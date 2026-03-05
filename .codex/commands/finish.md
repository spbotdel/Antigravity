# Codex Finish Command

User protocol:
- type `/fi` in Codex.

Adapter entry:
- `bash .codex/commands/fi.sh`

What happens:
1. Completion protocol runs.
2. Security/export/git checks are executed.
3. Shared memory files are synchronized on every run (`hybrid` mode):
   - `.claude/SNAPSHOT.md`
   - `.claude/BACKLOG.md`
   - `.claude/ARCHITECTURE.md`
4. Structured result is returned, including `memory_sync` task status.
