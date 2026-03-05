#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
OWNER_PID="${PPID:-$$}"

is_port_open() {
  local port="$1"

  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(0.5)
try:
    rc = sock.connect_ex(("127.0.0.1", port))
finally:
    sock.close()
sys.exit(0 if rc == 0 else 1)
PY
}

wait_for_port() {
  local port="$1"
  local max_wait="${2:-60}"
  local elapsed=0

  while [ "$elapsed" -lt "$max_wait" ]; do
    if is_port_open "$port"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

is_http_ready() {
  local url="$1"

  python3 - "$url" <<'PY'
import sys
import urllib.error
import urllib.request

url = sys.argv[1]
request = urllib.request.Request(url, method="GET")

try:
    with urllib.request.urlopen(request, timeout=1):
        pass
except urllib.error.HTTPError:
    # HTTP response was received, so server is up.
    sys.exit(0)
except Exception:
    sys.exit(1)

sys.exit(0)
PY
}

wait_for_http() {
  local url="$1"
  local max_wait="${2:-60}"
  local elapsed=0

  while [ "$elapsed" -lt "$max_wait" ]; do
    if is_http_ready "$url"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

ensure_local_dev_server() {
  local target_url="http://localhost:3000/"

  if [ "${CODEX_AUTO_DEV_SERVER:-1}" = "0" ]; then
    return 0
  fi

  if is_port_open 3000 && wait_for_http "$target_url" 5; then
    echo "[codex] dev server already running at $target_url"
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "[codex] warning: npm not found. cannot auto-start $target_url"
    return 0
  fi

  echo "[codex] starting dev server at $target_url"

  set +e
  if command -v nohup >/dev/null 2>&1; then
    nohup npm run dev -- --hostname 0.0.0.0 --port 3000 > .next-dev.log 2> .next-dev.err.log < /dev/null &
  else
    npm run dev -- --hostname 0.0.0.0 --port 3000 > .next-dev.log 2> .next-dev.err.log &
  fi
  DEV_PID="$!"
  START_EXIT=$?
  set -e

  if [ "$START_EXIT" -ne 0 ] || [ -z "$DEV_PID" ]; then
    echo "[codex] warning: failed to launch dev server."
    echo "[codex] logs: .next-dev.log .next-dev.err.log"
    return 0
  fi

  if wait_for_http "$target_url" 60; then
    echo "[codex] dev server ready at $target_url (pid $DEV_PID)"
    return 0
  fi

  echo "[codex] warning: dev server did not become ready at $target_url within 60s."
  echo "[codex] logs: .next-dev.log .next-dev.err.log"
  return 0
}

run_cold_start() {
  set +e
  OUTPUT="$(FRAMEWORK_AGENT_NAME=codex FRAMEWORK_OWNER_PID=$OWNER_PID python3 src/framework-core/main.py cold-start 2>&1)"
  EXIT_CODE=$?
  set -e
}

# Auto-route migration on first run so user can just type `start`.
if [ -f ".claude/migration-context.json" ]; then
  ROUTE_JSON="$(bash .codex/commands/migration-router.sh)"
  NEXT_COMMAND="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("next_command", ""))' "$ROUTE_JSON")"

  case "$NEXT_COMMAND" in
    "bash .codex/commands/migrate-legacy.sh")
      echo "[codex] migration context detected: running legacy migration before cold-start."
      bash .codex/commands/migrate-legacy.sh
      ;;
    "bash .codex/commands/upgrade-framework.sh")
      echo "[codex] migration context detected: running framework upgrade before cold-start."
      bash .codex/commands/upgrade-framework.sh
      ;;
  esac
fi

run_cold_start

if [ "$EXIT_CODE" -eq 0 ] && [ "${CODEX_AUTO_UPDATE:-1}" != "0" ] && [ -f ".codex/commands/quick-update.sh" ]; then
  UPDATE_RESULT="$(python3 .codex/utils/parse-update-result.py "$OUTPUT")"

  if [[ "$UPDATE_RESULT" == UPDATE:available:* ]]; then
    echo "[codex] update detected ($UPDATE_RESULT). applying framework update automatically."
    set +e
    UPDATE_OUTPUT="$(bash .codex/commands/quick-update.sh 2>&1)"
    UPDATE_EXIT=$?
    set -e
    printf "%s\n" "$UPDATE_OUTPUT"

    if [ "$UPDATE_EXIT" -eq 0 ]; then
      echo "[codex] framework update applied. re-running start protocol."
      run_cold_start
    else
      echo "[codex] automatic update failed (exit $UPDATE_EXIT). continuing with current runtime."
    fi
  fi
fi

printf "%s\n" "$OUTPUT"

if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 2 ]; then
  ensure_local_dev_server
fi

if [ "$EXIT_CODE" -eq 2 ]; then
  echo "[codex] action-required: input is needed before continuing (crash recovery or active session lock)."
fi

exit "$EXIT_CODE"
