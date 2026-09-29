<#
.SYNOPSIS
    Start the AniZora media worker.
.DESCRIPTION
    Only needed after stopping it by hand. It starts with the machine on its own.
#>
[CmdletBinding()] param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $Root 'docker-compose.worker.yml'
$EnvFile = Join-Path $Root '.env.worker'

if (-not (Test-Path $EnvFile)) {
    Write-Host 'No configuration found. Run .\install-worker.ps1 first.' -ForegroundColor Red
    exit 1
}

docker compose -f $Compose --env-file $EnvFile up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Worker started. Check it with .\status-worker.ps1' -ForegroundColor Green
Write-Host ''
