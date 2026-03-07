# Codex `dev-status` Command

User protocol:
- run `dev-status` in Codex when `http://localhost:3000/` is not behaving as expected.

Adapter entry:
- `bash .codex/commands/dev-status.sh`

What happens:
1. Checks whether TCP port `3000` is open.
2. Checks whether `http://localhost:3000/` responds.
3. Validates the tracked PID in `.tmp/codex-dev-server.pid`.
4. Prints the tail of `.next-dev.log` and `.next-dev.err.log` when unhealthy.

Exit codes:
- `0`: healthy dev server.
- `1`: unhealthy dev server.
