#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEV_SERVER_PORT=3000
DEV_SERVER_URL="http://localhost:${DEV_SERVER_PORT}/"
DEV_SERVER_PID_FILE=".tmp/codex-dev-server.pid"
STATUS=0

is_wsl() {
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then
    return 0
  fi

  grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null
}

has_windows_powershell() {
  command -v powershell.exe >/dev/null 2>&1
}

should_use_windows_host_checks() {
  is_wsl && has_windows_powershell
}

encode_powershell_script() {
  local script="$1"

  python3 - "$script" <<'PY'
import base64
import sys

print(base64.b64encode(sys.argv[1].encode("utf-16le")).decode("ascii"))
PY
}

run_windows_powershell() {
  local script="$1"
  local encoded=""

  if ! has_windows_powershell; then
    return 1
  fi

  encoded="$(encode_powershell_script "$script")"
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand "$encoded"
}

ps_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

is_port_open_local() {
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

is_port_open_windows() {
  local port="$1"
  local script=""

  printf -v script '$port = %s; try { $client = New-Object System.Net.Sockets.TcpClient; $iar = $client.BeginConnect("127.0.0.1", $port, $null, $null); if (-not $iar.AsyncWaitHandle.WaitOne(500)) { $client.Close(); exit 1 }; $client.EndConnect($iar) | Out-Null; $client.Close(); exit 0 } catch { exit 1 }' "$port"
  run_windows_powershell "$script" >/dev/null 2>&1
}

is_port_open() {
  local port="$1"

  if is_port_open_local "$port"; then
    return 0
  fi

  if should_use_windows_host_checks && is_port_open_windows "$port"; then
    return 0
  fi

  return 1
}

windows_host_server_only() {
  local port="$1"

  if ! should_use_windows_host_checks; then
    return 1
  fi

  if is_port_open_local "$port"; then
    return 1
  fi

  is_port_open_windows "$port"
}

is_http_ready_local() {
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

is_http_ready_windows() {
  local url="$1"
  local script=""
  local escaped_url=""

  escaped_url="$(ps_escape "$url")"
  script="\$ProgressPreference = 'SilentlyContinue'; \$url = '${escaped_url}'; try { Invoke-WebRequest -Uri \$url -UseBasicParsing -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch [System.Net.WebException] { if (\$_.Exception.Response) { exit 0 }; exit 1 } catch { exit 1 }"
  run_windows_powershell "$script" >/dev/null 2>&1
}

is_http_ready() {
  local url="$1"

  if is_http_ready_local "$url"; then
    return 0
  fi

  if should_use_windows_host_checks && is_http_ready_windows "$url"; then
    return 0
  fi

  return 1
}

process_alive() {
  local pid="$1"

  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  if should_use_windows_host_checks; then
    local script=""
    printf -v script '$pid = %s; try { Get-Process -Id $pid -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }' "$pid"
    run_windows_powershell "$script" >/dev/null 2>&1
    return $?
  fi

  return 1
}

tracked_pid_mismatches_windows_host() {
  local pid="$1"

  if ! windows_host_server_only "$DEV_SERVER_PORT"; then
    return 1
  fi

  local script=""
  printf -v script '$pid = %s; try { Get-Process -Id $pid -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }' "$pid"

  if run_windows_powershell "$script" >/dev/null 2>&1; then
    return 1
  fi

  return 0
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
  elif tracked_pid_mismatches_windows_host "$PID_VALUE"; then
    echo "[codex] pid_file=${DEV_SERVER_PID_FILE} (pid ${PID_VALUE} stale)"
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
