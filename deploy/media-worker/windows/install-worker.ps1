<#
.SYNOPSIS
    One-time setup for the AniZora media worker on Windows 10/11.

.DESCRIPTION
    Run this once. Afterwards the worker starts with the machine and processes
    every uploaded master on its own — there is nothing to run per episode.

    Nothing you type here is echoed to the screen or written to a log.

.EXAMPLE
    .\install-worker.ps1
#>
[CmdletBinding()]
param(
    # Skip the prompts and keep an existing .env.worker as it is.
    [switch]$UseExistingConfig
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env.worker'
$Compose = Join-Path $Root 'docker-compose.worker.yml'

function Write-Step { param([string]$Text) Write-Host "`n$Text" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "  [ok]   $Text" -ForegroundColor Green }
function Write-Bad { param([string]$Text) Write-Host "  [fail] $Text" -ForegroundColor Red }
function Write-Note { param([string]$Text) Write-Host "         $Text" -ForegroundColor DarkGray }

Write-Host ''
Write-Host 'AniZora Media Worker - one-time setup' -ForegroundColor White
Write-Host '-------------------------------------' -ForegroundColor DarkGray

# --- 1. Docker ---------------------------------------------------------------
# Checked first and explicitly: "docker: command not found" three steps later is
# the kind of failure people give up on.

Write-Step '1. Checking Docker'

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Bad 'Docker is not installed.'
    Write-Host ''
    Write-Host '  Install Docker Desktop, then run this script again:' -ForegroundColor Yellow
    Write-Host '    https://www.docker.com/products/docker-desktop/' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  During installation, leave "Start Docker Desktop when you log in" ticked.' -ForegroundColor DarkGray
    exit 1
}
Write-Ok 'Docker is installed.'

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'Docker is installed but not running.'
    Write-Host ''
    Write-Host '  Start Docker Desktop from the Start menu, wait for the whale icon in' -ForegroundColor Yellow
    Write-Host '  the system tray to stop animating, then run this script again.' -ForegroundColor Yellow
    exit 1
}
Write-Ok 'Docker is running.'

docker compose version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'This Docker has no "compose" command. Update Docker Desktop.'
    exit 1
}
Write-Ok 'Docker Compose is available.'

# --- 2. Configuration --------------------------------------------------------

Write-Step '2. Configuration'

if ($UseExistingConfig -and (Test-Path $EnvFile)) {
    Write-Ok 'Keeping the existing .env.worker.'
}
else {
    if (Test-Path $EnvFile) {
        $answer = Read-Host '  A configuration already exists. Replace it? (y/N)'
        if ($answer -notmatch '^[Yy]') {
            Write-Note 'Keeping the existing configuration.'
            $UseExistingConfig = $true
        }
    }
}

if (-not $UseExistingConfig) {
    Write-Note 'Values are hidden as you type and are never echoed back.'
    Write-Host ''

    $defaultApi = 'https://arizona-3.onrender.com/api'
    $apiUrl = Read-Host "  AniZora API URL [$defaultApi]"
    if ([string]::IsNullOrWhiteSpace($apiUrl)) { $apiUrl = $defaultApi }

    # Reads one secret with the characters hidden.
    #
    # This does not use Read-Host -AsSecureString, which is what the installer
    # used to do and which quietly truncated pasted credentials. In the console
    # host, Ctrl+V is not a paste shortcut: it arrives at the reader as the
    # single control character 0x16 (SYN). Read-Host accepted that character as
    # the whole secret and Enter ended the line, so a pasted 40-character token
    # was stored as one unprintable byte - the MEDIA_WORKER_TOKEN length = 1
    # that produced UND_ERR_INVALID_ARG, and the mangled OAuth values that
    # produced invalid_client.
    #
    # So the keys are read one at a time and 0x16 is handled by fetching the
    # clipboard ourselves. Terminals that paste by injecting the text (Windows
    # Terminal, and right-click in the console host) deliver ordinary
    # characters and go through the normal path below.
    function Get-ClipboardText {
        # Get-Clipboard needs an STA thread; if the host is not one, fall back
        # to a short-lived STA runspace rather than failing the paste.
        try {
            if ([Threading.Thread]::CurrentThread.GetApartmentState() -eq 'STA') {
                return [string](Get-Clipboard -Format Text -Raw -ErrorAction Stop)
            }
        }
        catch { }
        try {
            $ps = [PowerShell]::Create()
            [void]$ps.AddScript('Get-Clipboard -Format Text -Raw')
            $ps.Runspace = [RunspaceFactory]::CreateRunspace()
            $ps.Runspace.ApartmentState = 'STA'
            $ps.Runspace.Open()
            $out = $ps.Invoke()
            $ps.Runspace.Close()
            $ps.Dispose()
            if ($out.Count -gt 0) { return [string]$out[0] }
        }
        catch { }
        return ''
    }

    function Read-Secret {
        param([string]$Prompt, [switch]$Optional)

        while ($true) {
            Write-Host "  $Prompt" -NoNewline
            Write-Host ': ' -NoNewline

            $sb = New-Object Text.StringBuilder
            $pasteHadNewline = $false

            while ($true) {
                $key = [Console]::ReadKey($true)

                if ($key.Key -eq [ConsoleKey]::Enter) { break }

                if ($key.Key -eq [ConsoleKey]::Backspace) {
                    if ($sb.Length -gt 0) {
                        [void]$sb.Remove($sb.Length - 1, 1)
                        # Rub out the last mask character.
                        Write-Host "`b `b" -NoNewline
                    }
                    continue
                }

                if ($key.Key -eq [ConsoleKey]::Escape) {
                    while ($sb.Length -gt 0) {
                        [void]$sb.Remove($sb.Length - 1, 1)
                        Write-Host "`b `b" -NoNewline
                    }
                    continue
                }

                # Ctrl+V arriving as a chord or as the raw 0x16 control byte.
                $isCtrlV = ($key.KeyChar -eq [char]22) -or
                    (($key.Modifiers -band [ConsoleModifiers]::Control) -and $key.Key -eq [ConsoleKey]::V)
                if ($isCtrlV) {
                    $clip = Get-ClipboardText
                    if ([string]::IsNullOrEmpty($clip)) { continue }
                    # A credential copied from a web page or a file almost
                    # always carries a trailing newline. Trimming the ends is
                    # expected; a newline in the middle means two values were
                    # copied at once, which is rejected below rather than
                    # silently joined into one.
                    if ($clip.Trim() -match '[\r\n]') { $pasteHadNewline = $true }
                    foreach ($ch in $clip.Trim().ToCharArray()) {
                        if ([char]::IsControl($ch)) { continue }
                        [void]$sb.Append($ch)
                        Write-Host '*' -NoNewline
                    }
                    continue
                }

                # Arrow keys, function keys and any other control character.
                if ([char]::IsControl($key.KeyChar) -or $key.KeyChar -eq [char]0) { continue }

                [void]$sb.Append($key.KeyChar)
                Write-Host '*' -NoNewline
            }

            Write-Host ''
            $plain = $sb.ToString()

            if ($pasteHadNewline) {
                Write-Host '    That paste held more than one line. Copy a single value and try again.' -ForegroundColor Yellow
                continue
            }
            if ($plain.Length -eq 0) {
                if ($Optional) { return '' }
                Write-Host '    This one is required.' -ForegroundColor Yellow
                continue
            }
            if ($plain -match '\s') {
                Write-Host '    That value contains a space. Check what was copied and try again.' -ForegroundColor Yellow
                continue
            }

            # Length only - never the value itself.
            Write-Host "    Got $($plain.Length) characters." -ForegroundColor DarkGray
            return $plain
        }
    }

    Write-Host ''
    Write-Host '  The worker token must match the one set in the AniZora backend.' -ForegroundColor DarkGray
    $token = Read-Secret 'MEDIA_WORKER_TOKEN'

    Write-Host ''
    Write-Host '  Google Drive credentials (from whoever handed over the project).' -ForegroundColor DarkGray
    Write-Host '  These three let the worker read your video and save the tracks it finds.' -ForegroundColor DarkGray
    $clientId = Read-Secret 'GOOGLE_DRIVE_CLIENT_ID'
    $clientSecret = Read-Secret 'GOOGLE_DRIVE_CLIENT_SECRET'
    $refreshToken = Read-Secret 'GOOGLE_DRIVE_REFRESH_TOKEN'

    Write-Host ''
    Write-Host '  Optional: a service-account key, if you were given one. It only narrows' -ForegroundColor DarkGray
    Write-Host '  reading to read-only; the worker works fine without it.' -ForegroundColor DarkGray
    Write-Host '  Press Enter to skip.' -ForegroundColor DarkGray
    $saB64 = Read-Secret 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (optional)' -Optional

    # Catch a mangled or mis-pasted credential here, where the message can say
    # which value is wrong, rather than letting the worker fail later with
    # invalid_client or an invalid authorization header. Only the length and
    # the shape are ever reported.
    $problems = @()
    if ($token.Length -lt 16) {
        $problems += "MEDIA_WORKER_TOKEN is only $($token.Length) characters - that is too short to be the real token."
    }
    if ($clientId -notmatch '\.apps\.googleusercontent\.com$') {
        $problems += 'GOOGLE_DRIVE_CLIENT_ID does not end in .apps.googleusercontent.com.'
    }
    if ($clientSecret.Length -lt 10) {
        $problems += "GOOGLE_DRIVE_CLIENT_SECRET is only $($clientSecret.Length) characters."
    }
    if ($refreshToken.Length -lt 20) {
        $problems += "GOOGLE_DRIVE_REFRESH_TOKEN is only $($refreshToken.Length) characters."
    }
    foreach ($pair in @{ 'MEDIA_WORKER_TOKEN' = $token; 'GOOGLE_DRIVE_CLIENT_ID' = $clientId
            'GOOGLE_DRIVE_CLIENT_SECRET' = $clientSecret; 'GOOGLE_DRIVE_REFRESH_TOKEN' = $refreshToken
            'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64' = $saB64
        }.GetEnumerator()) {
        if ($pair.Value -and ($pair.Value.ToCharArray() | Where-Object { [char]::IsControl($_) })) {
            $problems += "$($pair.Key) contains a control character."
        }
    }

    if ($problems.Count -gt 0) {
        Write-Host ''
        Write-Bad 'These values do not look right, so nothing was written:'
        foreach ($p in $problems) { Write-Host "    - $p" -ForegroundColor Yellow }
        Write-Host ''
        Write-Note 'Run the installer again and re-paste the values.'
        exit 1
    }

    $lines = @(
        '# AniZora media worker configuration.',
        '# Written by install-worker.ps1. Holds live credentials - do not share.',
        "API_URL=$apiUrl",
        "MEDIA_WORKER_TOKEN=$token",
        "GOOGLE_DRIVE_CLIENT_ID=$clientId",
        "GOOGLE_DRIVE_CLIENT_SECRET=$clientSecret",
        "GOOGLE_DRIVE_REFRESH_TOKEN=$refreshToken"
    )
    # Only written when there is one: an empty assignment is a valid env line
    # but makes the file look misconfigured to anyone reading it.
    if ($saB64) { $lines += "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=$saB64" }
    $lines += 'MEDIA_WORKER_CONCURRENCY=1'
    # UTF8 without BOM: Docker reads env files byte for byte, and a BOM would
    # become part of the first variable's name.
    [IO.File]::WriteAllLines($EnvFile, $lines, (New-Object Text.UTF8Encoding $false))

    # Readable only by this user and Administrators, so another account on this
    # machine cannot read the credentials.
    $acl = Get-Acl $EnvFile
    $acl.SetAccessRuleProtection($true, $false)
    $acl.Access | ForEach-Object { [void]$acl.RemoveAccessRule($_) }
    foreach ($who in @("$env:USERDOMAIN\$env:USERNAME", 'BUILTIN\Administrators')) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
                    $who, 'FullControl', 'Allow')))
    }
    Set-Acl -Path $EnvFile -AclObject $acl

    Write-Host ''
    Write-Ok 'Configuration saved (readable only by you).'
}

# --- 3. Build ----------------------------------------------------------------

Write-Step '3. Building the worker image'
Write-Note 'First run downloads the source and FFmpeg. This takes a few minutes.'
Write-Note 'After that the worker only reads your videos - it never re-encodes them.'

docker compose -f $Compose --env-file $EnvFile build
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'The image could not be built. The output above says why.'
    exit 1
}
Write-Ok 'Image built. FFmpeg is inside it - nothing to install on this PC.'

# --- 4. Verify ---------------------------------------------------------------
# Runs the worker's own preflight rather than re-implementing the checks here,
# so what the installer validates and what the worker needs cannot drift apart.

Write-Step '4. Verifying the setup'

docker compose -f $Compose --env-file $EnvFile run --rm --no-deps media-worker `
    node dist/worker/media-worker.js --check
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Bad 'Setup is not complete - see the failures above.'
    Write-Note 'Fix them and run:  .\install-worker.ps1 -UseExistingConfig'
    Write-Note 'Or re-run without the switch to re-enter the values.'
    exit 1
}

# --- 5. Start ----------------------------------------------------------------

Write-Step '5. Starting the worker'

docker compose -f $Compose --env-file $EnvFile up -d
if ($LASTEXITCODE -ne 0) {
    Write-Bad 'The worker could not start. The output above says why.'
    exit 1
}
Write-Ok 'Worker started.'

Start-Sleep -Seconds 6
$state = (docker inspect --format '{{.State.Status}}' anizora-media-worker 2>$null)
if ($state -ne 'running') {
    Write-Bad "The container is '$state' rather than running."
    Write-Note 'Check the logs with:  .\logs-worker.ps1'
    exit 1
}
Write-Ok 'Container is running and set to restart with this machine.'

# --- Done --------------------------------------------------------------------

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host ''
Write-Host '  From now on, adding an episode is:' -ForegroundColor White
Write-Host '    Admin -> Episode -> SINGLE_MASTER -> upload one file -> Save'
Write-Host ''
Write-Host '  That is all. This worker does the rest by itself.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Useful commands (from this folder):' -ForegroundColor White
Write-Host '    .\status-worker.ps1     is it running, what is it doing'
Write-Host '    .\logs-worker.ps1       live output'
Write-Host '    .\stop-worker.ps1       stop it'
Write-Host '    .\start-worker.ps1      start it again'
Write-Host '    .\update-worker.ps1     take the latest version'
Write-Host ''

# --- Docker Desktop autostart ------------------------------------------------
# The container restarts itself, but only once Docker is running. On Windows
# that means Docker Desktop has to start at login, which is a setting rather
# than something this script should change behind the user's back.

$settings = Join-Path $env:APPDATA 'Docker\settings-store.json'
if (-not (Test-Path $settings)) { $settings = Join-Path $env:APPDATA 'Docker\settings.json' }
if (Test-Path $settings) {
    try {
        $json = Get-Content $settings -Raw | ConvertFrom-Json
        $autoStart = $false
        if ($json.PSObject.Properties.Name -contains 'OpenUIOnStartupDisabled') {
            # Present in every recent build; its sibling is the one we want.
        }
        if ($json.PSObject.Properties.Name -contains 'AutoStart') { $autoStart = [bool]$json.AutoStart }
        if (-not $autoStart) {
            Write-Host '  One thing left:' -ForegroundColor Yellow
            Write-Host '    Docker Desktop -> Settings -> General ->' -ForegroundColor Yellow
            Write-Host '    tick "Start Docker Desktop when you log in".' -ForegroundColor Yellow
            Write-Host ''
            Write-Host '    Without it, the worker only runs after someone opens Docker Desktop.' -ForegroundColor DarkGray
            Write-Host ''
        }
    }
    catch {
        # Settings format varies between releases; not worth failing setup over.
    }
}
