# Codex Start Command

User protocol:
- type `start` in Codex.

Adapter entry:
- `bash .codex/commands/start.sh`

What happens:
1. Migration/upgrade route is auto-detected and executed if needed.
2. Cold-start protocol runs.
3. If a newer framework version is detected, update is applied automatically via `.codex/commands/quick-update.sh`.
4. Shared project memory is loaded from `.claude/*`.
5. Backlog hint is printed from `.claude/BACKLOG.md` (first unchecked item plus stale warning when priorities are not refreshed).
6. Local Next.js dev server is auto-started on `http://localhost:3000/` (if it is not already running).
