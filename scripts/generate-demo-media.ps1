<#
.SYNOPSIS
  Generates the self-contained demo media used by `npm run db:seed`.

.DESCRIPTION
  Every file produced here is synthesised from scratch by ffmpeg — a test
  pattern plus a sine tone. Nothing is downloaded and no third-party video is
  involved, so the demo catalogue ships with media that is genuinely ours.

  The point of generating real files rather than stubbing URLs is that it makes
  the player's acceptance criteria actually verifiable:

    * four real resolutions      -> quality switching is observable
    * a burnt-in quality label   -> you can SEE which rendition is playing
    * testsrc's running timer    -> seek accuracy is observable frame by frame
    * two distinct audio tones   -> audio/DUB switching is audible (440Hz vs 660Hz)
    * 90-second duration         -> intro/outro markers and mid-roll cues fit

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/generate-demo-media.ps1
#>
[CmdletBinding()]
param(
  [int]$Duration = 90,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'backend\storage\uploads\demo'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# ffmpeg's drawtext filter treats ':' as an argument separator, so a Windows
# drive letter breaks the filter graph. Copying the font next to the output and
# running from there sidesteps the escaping entirely.
$fontSrc = 'C:\Windows\Fonts\arial.ttf'
$fontOk  = Test-Path $fontSrc
if ($fontOk) { Copy-Item $fontSrc (Join-Path $outDir 'label.ttf') -Force }

Push-Location $outDir
try {
  # name, width, height, audio Hz, label, testsrc pattern seed
  $targets = @(
    @{ File='sub-1080p.mp4'; W=1920; H=1080; Hz=440; Label='1080p  -  JAPANESE AUDIO' },
    @{ File='sub-720p.mp4';  W=1280; H=720;  Hz=440; Label='720p  -  JAPANESE AUDIO'  },
    @{ File='sub-480p.mp4';  W=854;  H=480;  Hz=440; Label='480p  -  JAPANESE AUDIO'  },
    @{ File='sub-360p.mp4';  W=640;  H=360;  Hz=440; Label='360p  -  JAPANESE AUDIO'  },
    @{ File='dub-720p.mp4';  W=1280; H=720;  Hz=660; Label='720p  -  ENGLISH DUB'     },
    @{ File='dub-480p.mp4';  W=854;  H=480;  Hz=660; Label='480p  -  ENGLISH DUB'     }
  )

  foreach ($t in $targets) {
    # Size is checked as well as existence, so a truncated file from an
    # interrupted run is regenerated rather than silently kept.
    $existing = Get-Item $t.File -ErrorAction SilentlyContinue
    if ($existing -and $existing.Length -gt 100KB -and -not $Force) {
      Write-Host "skip   $($t.File) (already present)"
      continue
    }
    if ($existing) { Remove-Item $t.File -Force }

    $fontSize = [int]([math]::Max(18, $t.H / 14))
    $filter = if ($fontOk) {
      # boxborderw is deliberately omitted — older ffmpeg builds reject it.
      "drawtext=fontfile=label.ttf:text='$($t.Label)':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.55:x=(w-text_w)/2:y=h-text_h-40"
    } else { $null }

    $args = @(
      '-loglevel','error','-y',
      '-f','lavfi','-i',"testsrc=size=$($t.W)x$($t.H):rate=30:duration=$Duration",
      '-f','lavfi','-i',"sine=frequency=$($t.Hz):duration=$Duration"
    )
    if ($filter) { $args += @('-vf', $filter) }
    $args += @(
      '-c:v','libx264','-preset','veryfast','-crf','28','-pix_fmt','yuv420p',
      '-c:a','aac','-strict','-2','-b:a','128k',
      '-movflags','+faststart',
      $t.File
    )

    Write-Host "encode $($t.File) ($($t.W)x$($t.H), $($t.Hz)Hz)..."
    & ffmpeg @args
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($t.File)" }
  }
} finally {
  Pop-Location
}

Remove-Item (Join-Path $outDir 'label.ttf') -ErrorAction SilentlyContinue

Write-Host ''
Get-ChildItem $outDir -Filter *.mp4 |
  Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}} |
  Format-Table -AutoSize
Write-Host "Demo media written to $outDir"
