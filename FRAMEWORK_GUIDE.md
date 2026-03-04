# Working with the Framework in Antigravity

This repository uses the Claude Code Starter Framework as the session layer for Codex and Claude.

## Quick Start

1. Open a terminal in the repository root.
2. Launch `codex`.
3. In the agent chat, type `start`.
4. Work on one clearly scoped task.
5. At the end of the work cycle, type `/fi`.

## Current Project Rule

The current top priority is Supabase recovery and stabilization.

That means:

- do not spend early effort on Vibe Kanban setup
- do not split into several feature streams yet
- do not treat the current static `main` branch as the final product state

## What to Do First

The repository currently contains the legacy static family tree viewer, while the expected Supabase-backed app is missing from the checked-out `main`.

The first investigation cycle should answer:

1. where the Supabase-enabled code currently lives
2. which branch or local copy should become the canonical app state
3. what the intended golden path is for Supabase
4. which env vars, auth flow, schema, and runtime boundaries are required

## Vibe Kanban Policy

Vibe Kanban is planned as a later orchestration layer.

Use it only after Supabase is stable enough that parallel workspaces will not amplify confusion.

Future split of responsibilities:

- Vibe Kanban: tasks, workspaces, review, merge coordination
- Framework: `start`, `/fi`, context loading, shared AI memory

## Shared Memory Files

The framework relies on these files:

- `.claude/SNAPSHOT.md`
- `.claude/BACKLOG.md`
- `.claude/ARCHITECTURE.md`

Keep them current, but avoid rewriting them independently in multiple parallel branches.
