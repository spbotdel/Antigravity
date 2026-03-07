# Codex Start Command

User protocol:
- type `start` in Codex.

Adapter entry:
- `bash .codex/commands/start.sh`

What happens:
1. Migration/upgrade route is auto-detected and executed if needed.
2. Cold-start protocol runs.
3. Auto-update is opt-in; set `CODEX_AUTO_UPDATE=1` to enable automatic framework update via `.codex/commands/quick-update.sh`.
4. Startup context is loaded from `.codex/config/framework-adapter.json` via `startup_context_paths` and currently includes `.claude/*`, `README.md`, and the structured project docs.
5. Backlog hint is printed from `.claude/BACKLOG.md` (first unchecked item plus stale warning when the latest embedded refresh, file update, or manual review is older than the threshold).
6. Local Next.js dev server is auto-started on `http://localhost:3000/` (if it is not already running), with PID tracking in `.tmp/codex-dev-server.pid`.
7. If port `3000` is occupied but the target URL is not responding, startup fails with diagnostics and recovery hints (no auto-kill, no fallback port).

Related commands:
- `bash .codex/commands/dev-status.sh` for port/HTTP/PID diagnostics.
- `bash .codex/commands/sart.sh` typo-safe alias for `start`.
