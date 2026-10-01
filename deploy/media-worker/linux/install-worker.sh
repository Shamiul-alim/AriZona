#!/usr/bin/env bash
# =============================================================================
# One-time setup for the AniZora media worker on Linux.
# =============================================================================
# Run this once. Afterwards the worker starts with the machine and processes
# every uploaded master on its own — there is nothing to run per episode.
#
# Nothing you type here is echoed to the screen or written to shell history.
# =============================================================================
. "$(dirname "$0")/common.sh"

KEEP_CONFIG=0
[ "${1:-}" = "--use-existing-config" ] && KEEP_CONFIG=1

echo
echo "AniZora Media Worker - one-time setup"
grey "-------------------------------------"

# --- 1. Docker ---------------------------------------------------------------
# Checked first and explicitly: "docker: command not found" three steps later
# is the kind of failure people give up on.

echo
echo "1. Checking Docker"

if ! command -v docker >/dev/null 2>&1; then
  red "  [fail] Docker is not installed."
  echo
  amber "  Install Docker Engine, then run this script again:"
  amber "    https://docs.docker.com/engine/install/"
  echo
  grey  "  On Debian/Ubuntu the convenience script is usually enough:"
  grey  "    curl -fsSL https://get.docker.com | sudo sh"
  grey  "    sudo usermod -aG docker \$USER   # then log out and back in"
  exit 1
fi
green "  [ok]   Docker is installed."

if ! docker info >/dev/null 2>&1; then
  red "  [fail] Docker is installed but this user cannot talk to it."
  echo
  amber "  Either start it:        sudo systemctl start docker"
  amber "  Or grant access:        sudo usermod -aG docker \$USER"
  amber "                          (log out and back in afterwards)"
  exit 1
fi
green "  [ok]   Docker is running."

if ! docker compose version >/dev/null 2>&1; then
  red "  [fail] This Docker has no 'compose' command."
  amber "  Install the plugin:  sudo apt-get install docker-compose-plugin"
  exit 1
fi
green "  [ok]   Docker Compose is available."

# Survives reboot only if the daemon does.
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-enabled docker >/dev/null 2>&1; then
    green "  [ok]   Docker starts with this machine."
  else
    amber "  [note] Docker does not start with this machine."
    amber "         Fix with:  sudo systemctl enable docker"
  fi
fi

# --- 2. Configuration --------------------------------------------------------

echo
echo "2. Configuration"

if [ "$KEEP_CONFIG" = 1 ] && [ -f "$ENV_FILE" ]; then
  green "  [ok]   Keeping the existing .env.worker."
elif [ -f "$ENV_FILE" ]; then
  read -r -p "  A configuration already exists. Replace it? (y/N) " answer
  case "$answer" in [Yy]*) KEEP_CONFIG=0 ;; *) KEEP_CONFIG=1; grey "         Keeping the existing configuration." ;; esac
fi

if [ "$KEEP_CONFIG" != 1 ]; then
  grey "  Values are hidden as you type and are never echoed back."
  echo

  DEFAULT_API="https://arizona-3.onrender.com/api"
  read -r -p "  AniZora API URL [$DEFAULT_API]: " API_URL
  API_URL="${API_URL:-$DEFAULT_API}"

  # read -s keeps the value off the screen; it never reaches shell history.
  read_secret() {
    local prompt="$1" optional="${2:-}" value=""
    while true; do
      read -r -s -p "  $prompt: " value; echo
      if [ -n "$value" ] || [ -n "$optional" ]; then printf '%s' "$value"; return; fi
      amber "    This one is required."
    done
  }

  echo
  grey "  The worker token must match the one set in the AniZora backend."
  TOKEN="$(read_secret 'MEDIA_WORKER_TOKEN')"

  echo
  grey "  Google Drive credentials (from whoever handed over the project)."
  grey "  These three let the worker read your video and save the tracks it finds."
  CLIENT_ID="$(read_secret 'GOOGLE_DRIVE_CLIENT_ID')"
  CLIENT_SECRET="$(read_secret 'GOOGLE_DRIVE_CLIENT_SECRET')"
  REFRESH_TOKEN="$(read_secret 'GOOGLE_DRIVE_REFRESH_TOKEN')"

  echo
  grey "  Optional: a service-account key, if you were given one. It only narrows"
  grey "  reading to read-only; the worker works fine without it. Enter to skip."
  SA_B64="$(read_secret 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (optional)' optional)"

  # Catch a mis-pasted credential here, where the message can name the value,
  # rather than letting the worker fail later with invalid_client or an
  # invalid authorization header. Only lengths and shapes are ever reported.
  PROBLEMS=""
  # "if" rather than "[ ... ] &&": common.sh sets -e, and a false test at the
  # head of an && list makes the whole list return non-zero, which would abort
  # the installer in exactly the case where the credential was fine.
  if [ "${#TOKEN}" -lt 16 ]; then
    PROBLEMS="$PROBLEMS\n    - MEDIA_WORKER_TOKEN is only ${#TOKEN} characters."
  fi
  case "$CLIENT_ID" in
    *.apps.googleusercontent.com) ;;
    *) PROBLEMS="$PROBLEMS\n    - GOOGLE_DRIVE_CLIENT_ID does not end in .apps.googleusercontent.com." ;;
  esac
  if [ "${#CLIENT_SECRET}" -lt 10 ]; then
    PROBLEMS="$PROBLEMS\n    - GOOGLE_DRIVE_CLIENT_SECRET is only ${#CLIENT_SECRET} characters."
  fi
  if [ "${#REFRESH_TOKEN}" -lt 20 ]; then
    PROBLEMS="$PROBLEMS\n    - GOOGLE_DRIVE_REFRESH_TOKEN is only ${#REFRESH_TOKEN} characters."
  fi

  if [ -n "$PROBLEMS" ]; then
    echo
    red "These values do not look right, so nothing was written:"
    printf '%b\n' "$PROBLEMS"
    echo
    grey "  Run the installer again and re-paste the values."
    exit 1
  fi

  # Created with no permissions, then written: the credentials are never
  # briefly world-readable on a shared machine.
  ( umask 077; : > "$ENV_FILE" )
  {
    echo "# AniZora media worker configuration."
    echo "# Written by install-worker.sh. Holds live credentials - do not share."
    echo "API_URL=$API_URL"
    echo "MEDIA_WORKER_TOKEN=$TOKEN"
    echo "GOOGLE_DRIVE_CLIENT_ID=$CLIENT_ID"
    echo "GOOGLE_DRIVE_CLIENT_SECRET=$CLIENT_SECRET"
    echo "GOOGLE_DRIVE_REFRESH_TOKEN=$REFRESH_TOKEN"
    # Only written when there is one: an empty assignment is valid but makes
    # the file look misconfigured to anyone reading it.
    if [ -n "$SA_B64" ]; then echo "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=$SA_B64"; fi
    echo "MEDIA_WORKER_CONCURRENCY=1"
  } >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  echo
  green "  [ok]   Configuration saved (readable only by you)."
fi

# --- 3. Build ----------------------------------------------------------------

echo
echo "3. Building the worker image"
grey "  First run downloads the source and FFmpeg. This takes a few minutes."
grey "  After that the worker only reads your videos - it never re-encodes them."

if ! dc build; then
  red "  [fail] The image could not be built. The output above says why."
  exit 1
fi
green "  [ok]   Image built. FFmpeg is inside it - nothing to install on this machine."

# --- 4. Verify ---------------------------------------------------------------
# Runs the worker's own preflight rather than re-implementing the checks here,
# so what the installer validates and what the worker needs cannot drift apart.

echo
echo "4. Verifying the setup"

if ! dc run --rm --no-deps media-worker node dist/worker/media-worker.js --check; then
  echo
  red "  [fail] Setup is not complete - see the failures above."
  grey "         Fix them and run:  ./install-worker.sh --use-existing-config"
  grey "         Or re-run without it to re-enter the values."
  exit 1
fi

# --- 5. Start ----------------------------------------------------------------

echo
echo "5. Starting the worker"

if ! dc up -d; then
  red "  [fail] The worker could not start. The output above says why."
  exit 1
fi
green "  [ok]   Worker started."

sleep 6
STATE="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null || true)"
if [ "$STATE" != "running" ]; then
  red "  [fail] The container is '$STATE' rather than running."
  grey "         Check the logs with:  ./logs-worker.sh"
  exit 1
fi
green "  [ok]   Container is running and set to restart with this machine."

echo
green "Setup complete."
echo
echo "  From now on, adding an episode is:"
echo "    Admin -> Episode -> SINGLE_MASTER -> upload one file -> Save"
echo
grey "  That is all. This worker does the rest by itself."
echo
echo "  Useful commands (from this folder):"
echo "    ./status-worker.sh     is it running, what is it doing"
echo "    ./logs-worker.sh       live output"
echo "    ./stop-worker.sh       stop it"
echo "    ./start-worker.sh      start it again"
echo "    ./update-worker.sh     take the latest version"
echo
