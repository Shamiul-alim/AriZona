<#
.SYNOPSIS
    Watch what the AniZora media worker is doing.
.PARAMETER Tail
    How many past lines to show first. Default 100.
.PARAMETER Follow
    Keep printing new lines. On by default; Ctrl+C stops watching (the worker
    keeps running).
#>
[CmdletBinding()]
param(
    [int]$Tail = 100,
    [bool]$Follow = $true
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$state = (docker inspect --format '{{.State.Status}}' anizora-media-worker 2>$null)
if (-not $state) {
    Write-Host 'The worker is not installed. Run .\install-worker.ps1 first.' -ForegroundColor Red
    exit 1
}

Write-Host 'Ctrl+C stops watching. The worker keeps running.' -ForegroundColor DarkGray
Write-Host ''
if ($Follow) { docker logs --tail $Tail -f anizora-media-worker }
else { docker logs --tail $Tail anizora-media-worker }
