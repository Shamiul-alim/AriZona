<#
.SYNOPSIS
    Remove the AniZora media worker from this machine.
.DESCRIPTION
    Removes the container, its image and its scratch space.

    Nothing published is affected: every episode already processed stays
    exactly as it is, because the worker holds no library data of its own.
    Anything still queued waits for the next worker, wherever that runs.
.PARAMETER KeepConfig
    Leave .env.worker in place, for reinstalling later.
#>
[CmdletBinding()]
param([switch]$KeepConfig)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $Root 'docker-compose.worker.yml'
$EnvFile = Join-Path $Root '.env.worker'

$answer = Read-Host 'Remove the media worker from this machine? (y/N)'
if ($answer -notmatch '^[Yy]') { Write-Host 'Cancelled.'; exit 0 }

docker compose -f $Compose --env-file $EnvFile down -v --rmi local
Write-Host 'Container, image and scratch space removed.' -ForegroundColor Green

if (-not $KeepConfig -and (Test-Path $EnvFile)) {
    $answer = Read-Host 'Also delete the saved credentials (.env.worker)? (y/N)'
    if ($answer -match '^[Yy]') {
        Remove-Item $EnvFile -Force
        Write-Host 'Credentials deleted.' -ForegroundColor Green
    }
    else {
        Write-Host 'Credentials kept. Delete .env.worker by hand if this machine changes owner.' -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Done. Published episodes are unaffected.' -ForegroundColor DarkGray
Write-Host ''
