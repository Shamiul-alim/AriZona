#!/usr/bin/env bash
# Stop the AniZora media worker.
#
# A job in progress finishes its current step first, so nothing is left half
# written. Queued episodes stay queued and resume when it starts again.
. "$(dirname "$0")/common.sh"
require_config
grey "Stopping (letting the current step finish)..."
dc stop
echo
amber "Worker stopped. Uploads still work; episodes wait in the queue."
grey "Start it again with ./start-worker.sh"
echo
