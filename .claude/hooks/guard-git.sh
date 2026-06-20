#!/usr/bin/env bash
# Blocks force-pushes (repo rule: no force-push). Reads PreToolUse hook JSON on stdin.
# Exit 2 = block the tool call, exit 0 = allow. Defense-in-depth, not the only guard.
set -uo pipefail

payload="$(cat)"
# Robust JSON parse of tool_input.command (node is always on PATH here). Empty on failure.
cmd="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input&&j.tool_input.command)||""))}catch(e){}})' 2>/dev/null)"

case "$cmd" in
  *git*push*)
    if printf '%s' "$cmd" | grep -Eq -- '--force-with-lease|--force([[:space:]]|=|$)|(^|[[:space:]])-[[:alpha:]]*f[[:alpha:]]*([[:space:]]|$)|(^|[[:space:]])\+[^[:space:]]+'; then
      echo "Blocked: force-push disallowed (no-force-push rule). Use a normal / --ff-only push." >&2
      exit 2
    fi ;;
esac
exit 0
