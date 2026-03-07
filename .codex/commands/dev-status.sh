#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEV_SERVER_PORT=3000
DEV_SERVER_URL="http://localhost:${DEV_SERVER_PORT}/"
DEV_SERVER_PID_FILE=".tmp/codex-dev-server.pid"
STATUS=0

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
    sys.exit(0)
except Exception:
    sys.exit(1)

sys.exit(0)
PY
}

process_alive() {
  local pid="$1"

  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  kill -0 "$pid" >/dev/null 2>&1
}

print_log_tail() {
  local file="$1"

  if [ -f "$file" ]; then
    echo "[codex] tail ${file}:"
    tail -n 20 "$file"
  else
    echo "[codex] tail ${file}: file is missing"
  fi
}

echo "[codex] dev-status: ${DEV_SERVER_URL}"

if is_port_open "$DEV_SERVER_PORT"; then
  echo "[codex] tcp:${DEV_SERVER_PORT}=open"
else
  echo "[codex] tcp:${DEV_SERVER_PORT}=closed"
  STATUS=1
fi

if is_http_ready "$DEV_SERVER_URL"; then
  echo "[codex] http_ready=yes"
else
  echo "[codex] http_ready=no"
  STATUS=1
fi

if [ -f "$DEV_SERVER_PID_FILE" ]; then
  PID_VALUE="$(tr -d '[:space:]' < "$DEV_SERVER_PID_FILE")"
  if [ -z "$PID_VALUE" ]; then
    echo "[codex] pid_file=${DEV_SERVER_PID_FILE} (empty)"
    STATUS=1
  elif process_alive "$PID_VALUE"; then
    echo "[codex] pid_file=${DEV_SERVER_PID_FILE} (pid ${PID_VALUE} alive)"
  else
    echo "[codex] pid_file=${DEV_SERVER_PID_FILE} (pid ${PID_VALUE} stale)"
    STATUS=1
  fi
else
  echo "[codex] pid_file=${DEV_SERVER_PID_FILE} (missing)"
fi

if [ "$STATUS" -eq 0 ]; then
  echo "[codex] dev server healthy."
  exit 0
fi

echo "[codex] dev server unhealthy."
print_log_tail ".next-dev.log"
print_log_tail ".next-dev.err.log"
echo "[codex] recovery: run 'bash .codex/commands/start.sh' after fixing port/process conflicts."
exit 1
