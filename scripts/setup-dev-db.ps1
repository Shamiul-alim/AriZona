<#
.SYNOPSIS
  Provisions a self-contained PostgreSQL instance inside the project folder.

.DESCRIPTION
  Downloads the official PostgreSQL Windows binaries, runs initdb into
  .dev-db/data, and starts the server on a NON-DEFAULT port so it can never
  collide with (or touch) any PostgreSQL already installed on the machine.

  Nothing here requires administrator rights and no existing database,
  service, or credential on the host is read or modified.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/setup-dev-db.ps1
#>
[CmdletBinding()]
param(
  [string]$Version  = '16.8-1',
  [int]   $Port     = 55432,
  [string]$User     = 'anizora',
  [string]$Password = 'anizora_dev_password',
  [string]$Database = 'anizora'
)

$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$devDb     = Join-Path $root '.dev-db'
$binaries  = Join-Path $devDb 'pgsql'
$dataDir   = Join-Path $devDb 'data'
$logFile   = Join-Path $devDb 'postgres.log'
$zipPath   = Join-Path $devDb "postgresql-$Version-windows-x64-binaries.zip"
$url       = "https://get.enterprisedb.com/postgresql/postgresql-$Version-windows-x64-binaries.zip"

New-Item -ItemType Directory -Force -Path $devDb | Out-Null

if (-not (Test-Path (Join-Path $binaries 'bin\postgres.exe'))) {
  if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading PostgreSQL $Version binaries..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  }
  Write-Host 'Extracting...'
  Expand-Archive -Path $zipPath -DestinationPath $devDb -Force
}

$initdb  = Join-Path $binaries 'bin\initdb.exe'
$pgCtl   = Join-Path $binaries 'bin\pg_ctl.exe'
$psql    = Join-Path $binaries 'bin\psql.exe'

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  Write-Host 'Initialising cluster...'
  $pwFile = Join-Path $devDb 'initpw.txt'
  Set-Content -Path $pwFile -Value $Password -Encoding ascii -NoNewline
  & $initdb --pgdata=$dataDir --username=$User --pwfile=$pwFile --auth=scram-sha-256 --encoding=UTF8 --locale=C | Out-Null
  Remove-Item $pwFile -Force

  # Bind to loopback only and use a dedicated port.
  Add-Content -Path (Join-Path $dataDir 'postgresql.conf') -Value @"

# --- AniZora development overrides ---
port = $Port
listen_addresses = '127.0.0.1'
max_connections = 100
shared_buffers = 128MB
"@
}

$status = & $pgCtl --pgdata=$dataDir status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Starting PostgreSQL on port $Port..."
  & $pgCtl --pgdata=$dataDir --log=$logFile --options="-p $Port" start | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Host 'PostgreSQL already running.'
}

$env:PGPASSWORD = $Password
$exists = & $psql --host=127.0.0.1 --port=$Port --username=$User --dbname=postgres --tuples-only --no-align `
  --command="SELECT 1 FROM pg_database WHERE datname='$Database'"
if (($exists | Out-String).Trim() -ne '1') {
  Write-Host "Creating database '$Database'..."
  & $psql --host=127.0.0.1 --port=$Port --username=$User --dbname=postgres --command="CREATE DATABASE $Database" | Out-Null
}
Remove-Item Env:\PGPASSWORD

Write-Host ''
Write-Host 'Ready. Connection string:'
Write-Host "  postgresql://$User`:$Password@localhost:$Port/$Database?schema=public"
Write-Host ''
Write-Host 'Stop it later with:'
Write-Host "  .dev-db\pgsql\bin\pg_ctl.exe --pgdata=`"$dataDir`" stop"
