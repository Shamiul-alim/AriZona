<#
.SYNOPSIS
    Is the AniZora media worker running, and what is it doing?

.DESCRIPTION
    Answers the three questions that actually come up: is it on, can it reach
    AniZora, and is it working on something right now.

    Prints no credentials.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env.worker'

function Get-EnvValue {
    param([string]$Name)
    if (-not (Test-Path $EnvFile)) { return $null }
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match "^\s*$Name\s*=\s*(.*)$") { return $Matches[1].Trim() }
    }
    return $null
}

Write-Host ''
Write-Host 'AniZora Media Worker' -ForegroundColor White
Write-Host '---------------------' -ForegroundColor DarkGray

# --- Container ---------------------------------------------------------------

$state = $null
$since = $null
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Container:      ' -NoNewline; Write-Host 'Docker is not running' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Start Docker Desktop; the worker starts itself once Docker is up.' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

$state = (docker inspect --format '{{.State.Status}}' anizora-media-worker 2>$null)
if (-not $state) {
    Write-Host 'Container:      ' -NoNewline; Write-Host 'Not installed' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Run .\install-worker.ps1 to set it up.' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

if ($state -eq 'running') {
    Write-Host 'Container:      ' -NoNewline; Write-Host 'Running' -ForegroundColor Green
    $startedAt = (docker inspect --format '{{.State.StartedAt}}' anizora-media-worker 2>$null)
    if ($startedAt) {
        $up = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($startedAt)).ToUniversalTime()
        $since = if ($up.TotalDays -ge 1) { '{0:N0} days' -f $up.TotalDays }
        elseif ($up.TotalHours -ge 1) { '{0:N0} hours' -f $up.TotalHours }
        else { '{0:N0} min' -f $up.TotalMinutes }
        Write-Host "Uptime:         $since"
    }
}
else {
    Write-Host 'Container:      ' -NoNewline; Write-Host $state -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Start it with .\start-worker.ps1' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

# --- Backend and authentication ----------------------------------------------

$api = Get-EnvValue 'API_URL'
$token = Get-EnvValue 'MEDIA_WORKER_TOKEN'

if (-not $api) {
    Write-Host 'Backend:        ' -NoNewline; Write-Host 'No configuration found' -ForegroundColor Red
    Write-Host ''
    exit 1
}

try {
    $health = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 30
    $dbNote = if ($health.database -eq 'up') { '' } else { " (database: $($health.database))" }
    Write-Host 'Backend:        ' -NoNewline; Write-Host "Reachable$dbNote" -ForegroundColor Green
}
catch {
    Write-Host 'Backend:        ' -NoNewline; Write-Host 'Unreachable' -ForegroundColor Red
    Write-Host '                The worker keeps retrying; jobs are not lost.' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

# The token is used, never displayed.
try {
    $null = Invoke-RestMethod -Uri "$api/media-worker/jobs?limit=1" -TimeoutSec 30 `
        -Headers @{ authorization = "Bearer $token" }
    Write-Host 'Authentication: ' -NoNewline; Write-Host 'OK' -ForegroundColor Green
}
catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 401) {
        Write-Host 'Authentication: ' -NoNewline; Write-Host 'Rejected' -ForegroundColor Red
        Write-Host '                This token does not match the AniZora backend,' -ForegroundColor DarkGray
        Write-Host '                or the backend has no MEDIA_WORKER_TOKEN set.' -ForegroundColor DarkGray
    }
    else {
        Write-Host 'Authentication: ' -NoNewline; Write-Host "Could not check ($code)" -ForegroundColor Yellow
    }
    Write-Host ''
    exit 1
}

# --- What it is doing --------------------------------------------------------
# Read from the worker's own log rather than the API, so this still answers
# usefully when the machine is fine but the network is not.

$log = docker logs --tail 60 anizora-media-worker 2>&1

$lastPoll = $log | Select-String -Pattern '^\S+Z ' | Select-Object -Last 1
if ($lastPoll) {
    $stamp = ($lastPoll.ToString() -split ' ')[0]
    try {
        $seen = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($stamp)).ToUniversalTime()
        $agoText = if ($seen.TotalMinutes -ge 60) { '{0:N0} hr ago' -f $seen.TotalHours }
        elseif ($seen.TotalSeconds -ge 60) { '{0:N0} min ago' -f $seen.TotalMinutes }
        else { '{0:N0} sec ago' -f $seen.TotalSeconds }
        Write-Host "Last activity:  $agoText"
    }
    catch { }
}

# A job prints its title, then indented steps. The newest title with a step
# after it is what is running now.
$current = $null
$currentStep = $null
foreach ($line in $log) {
    $text = $line.ToString()
    if ($text -match '^\s{2}(\S+?)\.+\s+(.*)$') {
        $currentStep = "$($Matches[1]) - $($Matches[2])"
        if ($Matches[1] -eq 'state') { $current = $null; $currentStep = $null }
    }
    elseif ($text -and $text -notmatch '^\S+Z ' -and $text.Trim()) {
        $current = $text.Trim()
        $currentStep = $null
    }
}

if ($current) {
    Write-Host ''
    Write-Host 'Current job:' -ForegroundColor White
    Write-Host "  $current"
    if ($currentStep) { Write-Host "  $currentStep" -ForegroundColor DarkGray }
}
else {
    Write-Host 'Current job:    None (watching the queue)'
}

Write-Host ''
Write-Host 'Live output:  .\logs-worker.ps1' -ForegroundColor DarkGray
Write-Host ''
