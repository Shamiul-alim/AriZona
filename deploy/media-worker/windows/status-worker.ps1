<#
.SYNOPSIS
    Is the AniZora media worker running, and what is it doing?

.DESCRIPTION
    Answers the three questions that actually come up: is it on, can it reach
    AniZora, and is it working on something right now.

    The connection and credential checks run inside the container, so they
    report the worker's own view rather than this desktop's — those differ, and
    the worker's is the one that matters. It also means this script never reads
    or handles the token.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Container = 'anizora-media-worker'

Write-Host ''
Write-Host 'AniZora Media Worker' -ForegroundColor White
Write-Host '---------------------' -ForegroundColor DarkGray

# --- Container ---------------------------------------------------------------

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Container:      ' -NoNewline; Write-Host 'Docker is not running' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Start Docker Desktop; the worker starts itself once Docker is up.' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

$state = (docker inspect --format '{{.State.Status}}' $Container 2>$null)
if (-not $state) {
    Write-Host 'Container:      ' -NoNewline; Write-Host 'Not installed' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Run .\install-worker.ps1 to set it up.' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

if ($state -ne 'running') {
    Write-Host 'Container:      ' -NoNewline; Write-Host $state -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Start it with .\start-worker.ps1' -ForegroundColor DarkGray
    Write-Host ''
    exit 1
}

Write-Host 'Container:      ' -NoNewline; Write-Host 'Running' -ForegroundColor Green

$startedAt = (docker inspect --format '{{.State.StartedAt}}' $Container 2>$null)
if ($startedAt) {
    $up = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($startedAt)).ToUniversalTime()
    $since = if ($up.TotalDays -ge 1) { '{0:N0} days' -f $up.TotalDays }
    elseif ($up.TotalHours -ge 1) { '{0:N0} hours' -f $up.TotalHours }
    else { '{0:N0} min' -f $up.TotalMinutes }
    Write-Host "Uptime:         $since"
}

# --- What it is doing --------------------------------------------------------
# Read from the worker's own log, so this still answers usefully when the
# machine is fine but the network is not.

$log = docker logs --tail 80 $Container 2>&1

$lastStamp = $null
foreach ($line in $log) {
    if ($line.ToString() -match '^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)') { $lastStamp = $Matches[1] }
}
if ($lastStamp) {
    try {
        $seen = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($lastStamp)).ToUniversalTime()
        $agoText = if ($seen.TotalMinutes -ge 60) { '{0:N0} hr ago' -f $seen.TotalHours }
        elseif ($seen.TotalSeconds -ge 60) { '{0:N0} min ago' -f $seen.TotalMinutes }
        else { '{0:N0} sec ago' -f $seen.TotalSeconds }
        Write-Host "Last activity:  $agoText"
    }
    catch { }
}

# A job prints its title, then indented steps. "state" is the last step of a
# job, so a title followed by one means that job is finished.
$current = $null
$currentStep = $null
foreach ($line in $log) {
    $text = $line.ToString()
    if ($text -match '^\s\s(\S+?)\.+\s+(.*)$') {
        if ($Matches[1] -eq 'state') { $current = $null; $currentStep = $null }
        else { $currentStep = "$($Matches[2]) ($($Matches[1]))" }
    }
    elseif ($text.Trim() -and $text -notmatch '^\d{4}-\d{2}-\d{2}T') {
        $current = $text.Trim()
        $currentStep = $null
    }
}

# --- Connection and credentials ----------------------------------------------
# The worker's own preflight, run inside the container. Reusing it means what
# this reports and what the worker needs cannot drift apart.

Write-Host ''
Write-Host 'Checks (from inside the worker):' -ForegroundColor White
$check = docker exec $Container node dist/worker/media-worker.js --check 2>&1
$checkOk = ($LASTEXITCODE -eq 0)
foreach ($line in $check) {
    $text = $line.ToString()
    if ($text -match 'FAIL') { Write-Host $text -ForegroundColor Red }
    elseif ($text -match '\bOK\b') { Write-Host $text -ForegroundColor Green }
}

# --- Current job -------------------------------------------------------------

Write-Host ''
if ($current) {
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

if (-not $checkOk) { exit 1 }
