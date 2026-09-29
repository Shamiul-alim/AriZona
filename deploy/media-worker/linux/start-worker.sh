#!/usr/bin/env bash
# Start the AniZora media worker.
# Only needed after stopping it by hand: it starts with the machine on its own.
. "$(dirname "$0")/common.sh"
require_config
dc up -d
echo
green "Worker started. Check it with ./status-worker.sh"
echo
