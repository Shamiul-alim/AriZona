#!/usr/bin/env bash
# Is the AniZora media worker running, and what is it doing?
#
# Answers the three questions that actually come up: is it on, can it reach
# AniZora, and is it working on something right now.
#
# The connection and credential checks run inside the container, so they report
# the worker's own view rather than this shell's — those differ, and the
# worker's is the one that matters. It also means this script never reads or
# handles the token.
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

# Read from the worker's own log, so this still answers usefully when the
# machine is fine but the network is not.
LOG="$(docker logs --tail 80 "$CONTAINER" 2>&1 || true)"

LAST_STAMP="$(printf '%s\n' "$LOG" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z' | tail -1 || true)"
if [ -n "$LAST_STAMP" ]; then
  AGO=$(( $(date -u +%s) - $(date -u -d "$LAST_STAMP" +%s 2>/dev/null || echo 0) ))
  if [ "$AGO" -ge 0 ]; then
    if   [ "$AGO" -ge 3600 ]; then echo "Last activity:  $((AGO/3600)) hr ago"
    elif [ "$AGO" -ge 60 ];   then echo "Last activity:  $((AGO/60)) min ago"
    else                           echo "Last activity:  ${AGO} sec ago"; fi
  fi
fi

# A job prints its title, then indented steps. "state" is the last step of a
# job, so a title followed by one means that job is finished.
CURRENT=""; CURRENT_STEP=""
while IFS= read -r line; do
  if printf '%s' "$line" | grep -qE '^  [A-Za-z0-9]+\.+ '; then
    name="$(printf '%s' "$line" | sed -E 's/^  ([A-Za-z0-9]+)\.+ +(.*)$/\1/')"
    rest="$(printf '%s' "$line" | sed -E 's/^  ([A-Za-z0-9]+)\.+ +(.*)$/\2/')"
    if [ "$name" = "state" ]; then CURRENT=""; CURRENT_STEP=""
    else CURRENT_STEP="$rest ($name)"; fi
  elif [ -n "$(printf '%s' "$line" | tr -d '[:space:]')" ] && ! printf '%s' "$line" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
    CURRENT="$(printf '%s' "$line" | sed -e 's/^ *//' -e 's/ *$//')"
    CURRENT_STEP=""
  fi
done <<< "$LOG"

# The worker's own preflight, run inside the container. Reusing it means what
# this reports and what the worker needs cannot drift apart.
echo
echo "Checks (from inside the worker):"
CHECK_OK=0
# Run once and keep both the output and the verdict: a second run would repeat
# the Drive calls for nothing.
CHECK_OUT="$(docker exec "$CONTAINER" node dist/worker/media-worker.js --check 2>&1)" || CHECK_OK=1
printf '%s\n' "$CHECK_OUT" | grep -E '\bOK\b|FAIL' || true

echo
if [ -n "$CURRENT" ]; then
  echo "Current job:"
  echo "  $CURRENT"
  [ -n "$CURRENT_STEP" ] && grey "  $CURRENT_STEP"
else
  echo "Current job:    None (watching the queue)"
fi

echo
grey "Live output:  ./logs-worker.sh"
echo
exit $CHECK_OK
