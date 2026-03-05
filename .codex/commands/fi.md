# Codex `/fi` Command

User-level completion command.

Run:
- `bash .codex/commands/fi.sh`

Behavior:
- executes the framework completion protocol,
- runs security cleanup/export checks,
- always runs shared-memory sync in `hybrid` mode for:
  - `.claude/SNAPSHOT.md`
  - `.claude/BACKLOG.md`
  - `.claude/ARCHITECTURE.md`
  using `FRAMEWORK:AUTO` and `FRAMEWORK:SESSION` blocks,
- returns completion status in the standard JSON contract.
