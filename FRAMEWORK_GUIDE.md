# Framework Guide

This repository uses the Claude Code Starter Framework as the session layer for Codex and Claude.

## Scope

This is a framework/internal tooling document.

It explains how the AI workflow layer operates in this repository.

It is not the source of truth for:
- product architecture
- repository navigation
- application reading order

For product understanding, start with:
- `REPO_MAP.md`
- `PROJECT_SUMMARY.md`
- `ARCHITECTURE_RULES.md`
- `DECISIONS.md`

## Quick Start

1. Open a terminal in the repository root.
2. Launch `codex`.
3. In the agent chat, type `start`.
4. Work on one clearly scoped task.
5. At the end of the work cycle, type `/fi`.

## Framework Role In This Repo

The framework is responsible for:
- session start / completion flow
- loading shared memory
- agent-facing workflow conventions

The framework is not responsible for defining the product architecture.

## Shared Memory Files

The framework reads and maintains:
- `.claude/SNAPSHOT.md`
- `.claude/BACKLOG.md`
- `.claude/ARCHITECTURE.md`

In practice:
- `SNAPSHOT.md` = current operational state
- `BACKLOG.md` = current task backlog
- `ARCHITECTURE.md` = supplemental session architecture memory

Static product understanding still lives in the repository docs, not in framework memory files.

## Related Framework Docs

- `AGENTS.md` = Codex adapter and repository-specific agent instructions
- `CLAUDE.md` = upstream framework protocols and framework runtime behavior
- `.codex/config/framework-adapter.json` = runtime startup-context list
