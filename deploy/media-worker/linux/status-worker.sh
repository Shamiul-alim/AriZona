#!/usr/bin/env bash
# Is the AniZora media worker running, and what is it doing?
#
# Answers the three questions that actually come up: is it on, can it reach
# AniZora, and is it working on something right now. Prints no credentials.
. "$(dirname "$0")/common.sh"

echo
echo "AniZora Media Worker"
grey "---------------------"

if ! docker info >/dev/null 2>&1; then
  printf 'Container:      '; red "Docker is not running"
  echo
  grey "Start it with: sudo systemctl start docker"
  echo
  exit 1
fi

STATE="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null || true)"
if [ -z "$STATE" ]; then
  printf 'Container:      '; red "Not installed"
  echo
  grey "Run ./install-worker.sh to set it up."
  echo
  exit 1
fi

if [ "$STATE" != "running" ]; then
  printf 'Container:      '; amber "$STATE"
  echo
  grey "Start it with ./start-worker.sh"
  echo
  exit 1
fi
printf 'Container:      '; green "Running"

STARTED="$(docker inspect --format '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || true)"
if [ -n "$STARTED" ]; then
  UP=$(( $(date -u +%s) - $(date -u -d "$STARTED" +%s 2>/dev/null || echo 0) ))
  if [ "$UP" -gt 0 ]; then
    if   [ "$UP" -ge 86400 ]; then echo "Uptime:         $((UP/86400)) days"
    elif [ "$UP" -ge 3600 ];  then echo "Uptime:         $((UP/3600)) hours"
    else                           echo "Uptime:         $((UP/60)) min"; fi
  fi
fi

API="$(env_value API_URL)"
TOKEN="$(env_value MEDIA_WORKER_TOKEN)"
if [ -z "$API" ]; then
  printf 'Backend:        '; red "No configuration found"
  echo; exit 1
fi

if curl -fsS --max-time 30 "$API/health" >/dev/null 2>&1; then
  printf 'Backend:        '; green "Reachable"
else
  printf 'Backend:        '; red "Unreachable"
  grey "                The worker keeps retrying; jobs are not lost."
  echo; exit 1
fi

# The token is used, never displayed.
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
  -H "authorization: Bearer $TOKEN" "$API/media-worker/jobs?limit=1" || echo 000)"
case "$CODE" in
  2*) printf 'Authentication: '; green "OK" ;;
  401)
    printf 'Authentication: '; red "Rejected"
    grey "                This token does not match the AniZora backend,"
    grey "                or the backend has no MEDIA_WORKER_TOKEN set."
    echo; exit 1 ;;
  *)
    printf 'Authentication: '; amber "Could not check ($CODE)"
    echo; exit 1 ;;
esac

# Read from the worker's own log rather than the API, so this still answers
# usefully when the machine is fine but the network is not.
LOG="$(docker logs --tail 60 "$CONTAINER" 2>&1 || true)"

LAST_STAMP="$(printf '%s\n' "$LOG" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' | tail -1 || true)"
if [ -n "$LAST_STAMP" ]; then
  AGO=$(( $(date -u +%s) - $(date -u -d "$LAST_STAMP" +%s 2>/dev/null || echo 0) ))
  if [ "$AGO" -ge 0 ]; then
    if   [ "$AGO" -ge 3600 ]; then echo "Last activity:  $((AGO/3600)) hr ago"
    elif [ "$AGO" -ge 60 ];   then echo "Last activity:  $((AGO/60)) min ago"
    else                           echo "Last activity:  ${AGO} sec ago"; fi
  fi
fi

# A job prints its title, then indented steps. The newest title still followed
# by steps is what is running now.
CURRENT=""; CURRENT_STEP=""
while IFS= read -r line; do
  if printf '%s' "$line" | grep -qE '^  [a-z0-9]+\.+ '; then
    name="$(printf '%s' "$line" | sed -E 's/^  ([a-z0-9]+)\.+ +(.*)$/\1/')"
    rest="$(printf '%s' "$line" | sed -E 's/^  ([a-z0-9]+)\.+ +(.*)$/\2/')"
    if [ "$name" = "state" ]; then CURRENT=""; CURRENT_STEP=""
    else CURRENT_STEP="$name - $rest"; fi
  elif [ -n "$line" ] && ! printf '%s' "$line" | grep -qE '^[0-9]{4}-'; then
    CURRENT="$(printf '%s' "$line" | sed -e 's/^ *//' -e 's/ *$//')"
    CURRENT_STEP=""
  fi
done <<< "$LOG"

if [ -n "$CURRENT" ]; then
  echo
  echo "Current job:"
  echo "  $CURRENT"
  [ -n "$CURRENT_STEP" ] && grey "  $CURRENT_STEP"
else
  echo "Current job:    None (watching the queue)"
fi

echo
grey "Live output:  ./logs-worker.sh"
echo
