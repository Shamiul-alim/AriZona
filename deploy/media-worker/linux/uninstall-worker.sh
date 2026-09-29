#!/usr/bin/env bash
# Remove the AniZora media worker from this machine.
#
# Nothing published is affected: every episode already processed stays exactly
# as it is, because the worker holds no library data of its own. Anything still
# queued waits for the next worker, wherever that runs.
. "$(dirname "$0")/common.sh"

read -r -p "Remove the media worker from this machine? (y/N) " answer
case "$answer" in [Yy]*) ;; *) echo "Cancelled."; exit 0 ;; esac

dc down -v --rmi local || true
green "Container, image and scratch space removed."

if [ -f "$ENV_FILE" ]; then
  read -r -p "Also delete the saved credentials (.env.worker)? (y/N) " answer
  case "$answer" in
    [Yy]*) rm -f "$ENV_FILE"; green "Credentials deleted." ;;
    *)     amber "Credentials kept. Delete .env.worker by hand if this machine changes owner." ;;
  esac
fi
echo
grey "Done. Published episodes are unaffected."
echo
