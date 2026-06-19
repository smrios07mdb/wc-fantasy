#!/usr/bin/env bash
# Blocks force-pushes (repo rule: no force-push). Reads hook JSON on stdin.
# Exit 2 = block the tool call, exit 0 = allow. Defense-in-depth, not the only guard.
set -uo pipefail
cmd="$(cat | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')"
case "$cmd" in
  *"git push"*)
    if printf '%s' "$cmd" | grep -Eq -- '(--force([^-]|$)|--force-with-lease|(^|[[:space:]])-f([[:space:]]|$))'; then
      echo "Blocked: force-push disallowed (no-force-push rule). Use --ff-only / normal push." >&2
      exit 2
    fi ;;
esac
exit 0
