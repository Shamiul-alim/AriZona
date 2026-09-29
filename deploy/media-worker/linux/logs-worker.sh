#!/usr/bin/env bash
# Watch what the AniZora media worker is doing.
#
#   ./logs-worker.sh          follow live
#   ./logs-worker.sh 500      show the last 500 lines, then follow
. "$(dirname "$0")/common.sh"
TAIL="${1:-100}"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  red "The worker is not installed. Run ./install-worker.sh first."
  exit 1
fi
grey "Ctrl+C stops watching. The worker keeps running."
echo
exec docker logs --tail "$TAIL" -f "$CONTAINER"
