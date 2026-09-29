#!/usr/bin/env bash
# Update the AniZora media worker to the latest version.
#
# Safe at any time. A job that was in progress is re-queued and picked up
# again: finished renditions are reused rather than rebuilt, so an interrupted
# job resumes instead of starting over.
. "$(dirname "$0")/common.sh"
require_config

echo "Building the latest version..."
if ! dc build --pull --no-cache; then
  red "Build failed. The running worker was left alone."
  exit 1
fi

echo
echo "Checking the new build..."
if ! dc run --rm --no-deps media-worker node dist/worker/media-worker.js --check; then
  red "The new build did not pass its checks. The running worker was left alone."
  exit 1
fi

echo
echo "Restarting..."
dc up -d
echo
green "Updated. Check it with ./status-worker.sh"
echo
