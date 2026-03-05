# Core CLI Contract

CLI:
- `python3 src/framework-core/main.py cold-start`
- `python3 src/framework-core/main.py completion`

JSON envelope:
- `status`: `success | error | needs_input`
- `command`: command name
- `timestamp`: ISO UTC
- `tasks`: optional task result list
- `errors`: optional error list
- `warnings`: optional warning list
- `data`: optional payload (e.g., crash reason)
- `duration_total_ms`: optional duration

Completion task list includes `memory_sync` with:
- `name`: `memory_sync`
- `status`: `success | error`
- `result`: `MEMORY:updated:<n>` (or skip reason)

`memory_sync` errors are non-blocking for overall completion status and are surfaced via task status and warnings.

`needs_input` reasons currently used:
- `crash_detected`
- `session_locked`

Exit codes:
- `0`: success
- `1`: error
- `2`: needs_input
