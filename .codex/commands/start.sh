#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
OWNER_PID="${PPID:-$$}"
DEV_SERVER_PORT=3000
DEV_SERVER_URL="http://localhost:${DEV_SERVER_PORT}/"
DEV_SERVER_PID_FILE=".tmp/codex-dev-server.pid"

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

to_windows_path() {
  local path="$1"

  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$path"
    return 0
  fi

  printf "%s" "$path"
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
    # HTTP response was received, so server is up.
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

read_dev_pid() {
  if [ ! -f "$DEV_SERVER_PID_FILE" ]; then
    return 1
  fi

  tr -d '[:space:]' < "$DEV_SERVER_PID_FILE"
}

write_dev_pid() {
  local pid="$1"
  mkdir -p "$(dirname "$DEV_SERVER_PID_FILE")"
  printf "%s\n" "$pid" > "$DEV_SERVER_PID_FILE"
}

clear_dev_pid() {
  rm -f "$DEV_SERVER_PID_FILE"
}

print_dev_server_recovery_hint() {
  echo "[codex] recovery: run 'bash .codex/commands/dev-status.sh' for diagnostics."
  echo "[codex] recovery: review '.next-dev.log' and '.next-dev.err.log'."
  echo "[codex] recovery: free port ${DEV_SERVER_PORT} or stop the conflicting process, then run 'start' again."
}

print_dev_server_diagnostics() {
  local tracked_pid=""

  echo "[codex] diagnostics: target=${DEV_SERVER_URL} port=${DEV_SERVER_PORT}"

  if is_port_open "$DEV_SERVER_PORT"; then
    echo "[codex] diagnostics: tcp:${DEV_SERVER_PORT}=open"
  else
    echo "[codex] diagnostics: tcp:${DEV_SERVER_PORT}=closed"
  fi

  if is_http_ready "$DEV_SERVER_URL"; then
    echo "[codex] diagnostics: http_ready=yes"
  else
    echo "[codex] diagnostics: http_ready=no"
  fi

  tracked_pid="$(read_dev_pid || true)"
  if [ -n "$tracked_pid" ] && process_alive "$tracked_pid"; then
    echo "[codex] diagnostics: tracked_pid=${tracked_pid} (alive)"
    return 0
  fi

  if [ -n "$tracked_pid" ]; then
    echo "[codex] diagnostics: tracked_pid=${tracked_pid} (stale)"
  else
    echo "[codex] diagnostics: tracked_pid=none"
  fi
}

ensure_local_dev_server() {
  local tracked_pid=""
  local dev_pid=""

  if [ "${CODEX_AUTO_DEV_SERVER:-1}" = "0" ]; then
    return 0
  fi

  tracked_pid="$(read_dev_pid || true)"
  if [ -n "$tracked_pid" ] && { ! process_alive "$tracked_pid" || tracked_pid_mismatches_windows_host "$tracked_pid"; }; then
    clear_dev_pid
    tracked_pid=""
  fi

  if is_port_open "$DEV_SERVER_PORT"; then
    if wait_for_http "$DEV_SERVER_URL" 5; then
      if [ -n "$tracked_pid" ]; then
        echo "[codex] dev server already running at ${DEV_SERVER_URL} (pid ${tracked_pid})"
      else
        echo "[codex] dev server already running at ${DEV_SERVER_URL}"
      fi
      return 0
    fi

    echo "[codex] warning: port ${DEV_SERVER_PORT} is occupied, but ${DEV_SERVER_URL} is not responding."
    print_dev_server_diagnostics
    print_dev_server_recovery_hint
    return 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    if ! should_use_windows_host_checks; then
      echo "[codex] warning: npm not found. cannot auto-start ${DEV_SERVER_URL}"
      return 0
    fi
  fi

  echo "[codex] starting dev server at ${DEV_SERVER_URL}"

  set +e
  if should_use_windows_host_checks; then
    local root_dir_win=""
    local stdout_win=""
    local stderr_win=""
    local script=""

    root_dir_win="$(ps_escape "$(to_windows_path "$ROOT_DIR")")"
    stdout_win="$(ps_escape "$(to_windows_path "$ROOT_DIR/.next-dev.log")")"
    stderr_win="$(ps_escape "$(to_windows_path "$ROOT_DIR/.next-dev.err.log")")"
    script="\$wd = '${root_dir_win}'; \$stdout = '${stdout_win}'; \$stderr = '${stderr_win}'; \$proc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--hostname', '0.0.0.0', '--port', '${DEV_SERVER_PORT}') -WorkingDirectory \$wd -RedirectStandardOutput \$stdout -RedirectStandardError \$stderr -PassThru; Write-Output \$proc.Id"
    dev_pid="$(run_windows_powershell "$script" 2>/dev/null | tr -d '\r' | tail -n 1)"
    START_EXIT=$?
  elif command -v nohup >/dev/null 2>&1; then
    nohup npm run dev -- --hostname 0.0.0.0 --port "$DEV_SERVER_PORT" > .next-dev.log 2> .next-dev.err.log < /dev/null &
    dev_pid="$!"
    START_EXIT=$?
  else
    npm run dev -- --hostname 0.0.0.0 --port "$DEV_SERVER_PORT" > .next-dev.log 2> .next-dev.err.log &
    dev_pid="$!"
    START_EXIT=$?
  fi
  set -e

  if [ "$START_EXIT" -ne 0 ] || [ -z "$dev_pid" ]; then
    echo "[codex] warning: failed to launch dev server."
    print_dev_server_diagnostics
    print_dev_server_recovery_hint
    echo "[codex] logs: .next-dev.log .next-dev.err.log"
    return 1
  fi

  write_dev_pid "$dev_pid"

  if wait_for_port "$DEV_SERVER_PORT" 20 && wait_for_http "$DEV_SERVER_URL" 60; then
    echo "[codex] dev server ready at ${DEV_SERVER_URL} (pid ${dev_pid})"
    return 0
  fi

  if ! process_alive "$dev_pid"; then
    clear_dev_pid
  fi

  echo "[codex] warning: dev server did not become ready at ${DEV_SERVER_URL}."
  print_dev_server_diagnostics
  print_dev_server_recovery_hint
  echo "[codex] logs: .next-dev.log .next-dev.err.log"
  return 1
}

run_cold_start() {
  set +e
  OUTPUT="$(FRAMEWORK_AGENT_NAME=codex FRAMEWORK_OWNER_PID=$OWNER_PID python3 src/framework-core/main.py cold-start 2>&1)"
  EXIT_CODE=$?
  set -e
}

print_backlog_hint() {
  local hint_script=".codex/utils/backlog-start-hint.py"

  if [ ! -f "$hint_script" ]; then
    return 0
  fi

  set +e
  python3 "$hint_script"
  local hint_exit=$?
  set -e

  if [ "$hint_exit" -ne 0 ]; then
    echo "[codex] warning: failed to render backlog hint."
  fi
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

if [ "$EXIT_CODE" -eq 0 ] && [ "${CODEX_AUTO_UPDATE:-0}" = "1" ] && [ -f ".codex/commands/quick-update.sh" ]; then
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

FINAL_EXIT_CODE="$EXIT_CODE"
if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 2 ]; then
  print_backlog_hint
  if ! ensure_local_dev_server; then
    if [ "$FINAL_EXIT_CODE" -eq 0 ]; then
      FINAL_EXIT_CODE=1
    fi
  fi
fi

if [ "$EXIT_CODE" -eq 2 ]; then
  echo "[codex] action-required: input is needed before continuing (crash recovery or active session lock)."
fi

exit "$FINAL_EXIT_CODE"
