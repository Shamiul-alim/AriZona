# Shared by the worker scripts. Sourced, not run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.worker.yml"
ENV_FILE="$ROOT/.env.worker"
CONTAINER=anizora-media-worker

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
amber() { printf '\033[33m%s\033[0m\n' "$1"; }
grey()  { printf '\033[90m%s\033[0m\n' "$1"; }

dc() { docker compose -f "$COMPOSE" --env-file "$ENV_FILE" "$@"; }

require_config() {
  if [ ! -f "$ENV_FILE" ]; then
    red "No configuration found. Run ./install-worker.sh first."
    exit 1
  fi
}

# Reads one value without printing it. Used for the API URL and, where a check
# needs it, the token.
env_value() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | head -1
}
