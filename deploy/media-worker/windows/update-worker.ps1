<#
.SYNOPSIS
    Update the AniZora media worker to the latest version.
.DESCRIPTION
    Rebuilds from the current source and restarts.

    Safe to run at any time. A job that was in progress is re-queued and picked
    up again: finished renditions are reused rather than rebuilt, so an
    interrupted job resumes instead of starting over.
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

Write-Host 'Building the latest version...' -ForegroundColor Cyan
docker compose -f $Compose --env-file $EnvFile build --pull --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Build failed. The running worker was left alone.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Checking the new build...' -ForegroundColor Cyan
docker compose -f $Compose --env-file $EnvFile run --rm --no-deps media-worker `
    node dist/worker/media-worker.js --check
if ($LASTEXITCODE -ne 0) {
    Write-Host 'The new build did not pass its checks. The running worker was left alone.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Restarting...' -ForegroundColor Cyan
docker compose -f $Compose --env-file $EnvFile up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Updated. Check it with .\status-worker.ps1' -ForegroundColor Green
Write-Host ''
