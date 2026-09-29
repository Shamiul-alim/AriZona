<#
.SYNOPSIS
    Stop the AniZora media worker.
.DESCRIPTION
    A job in progress finishes its current step first, so nothing is left half
    written. Queued episodes stay queued and are picked up when it starts again.
#>
[CmdletBinding()] param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $Root 'docker-compose.worker.yml'
$EnvFile = Join-Path $Root '.env.worker'

Write-Host 'Stopping (letting the current step finish)...' -ForegroundColor DarkGray
docker compose -f $Compose --env-file $EnvFile stop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Worker stopped. Uploads still work; episodes wait in the queue.' -ForegroundColor Yellow
Write-Host 'Start it again with .\start-worker.ps1' -ForegroundColor DarkGray
Write-Host ''
