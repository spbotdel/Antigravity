# ARCHITECTURE — Antigravity

*Current checked-out architecture plus project workflow contracts*

## Detected Stack

- Static HTML entry point
- Vanilla JavaScript modules
- D3.js-based tree rendering
- GEDCOM source file loading
- Framework runtime in Python and shell wrappers

## Current Codebase Reality

The checked-out `main` branch is an older static viewer, not the Supabase-enabled application slice the team expects to continue. That mismatch is currently more important than any individual feature request.

## Top-Level Structure

- `.gitattributes`
- `.github/`
- `.gitignore`
- `3.ged`
- `AGENTS.md`
- `check-ids.html`
- `CLAUDE.md`
- `css/`
- `FRAMEWORK_GUIDE.md`
- `index.html`
- `index.patch`
- `info.txt`
- `js/`
- `README.md`
- `security/`
- `src/`

## Current Application Components

### Browser entry point
**Location:** `index.html`
**Purpose:** Loads the static genealogy viewer and binds the main UX in a single page.

### Tree rendering logic
**Location:** `js/treeRenderer.js`
**Purpose:** Uses D3 to render and navigate the family tree visualization.

### Data preparation
**Location:** `js/gedcomParser.js` and `js/treeBuilder.js`
**Purpose:** Parse GEDCOM input and build descendant tree structures for rendering.

### Framework runtime
**Location:** `.claude/`, `.codex/`, `src/framework-core/`, `security/`
**Purpose:** Provide session lifecycle, project memory, migration flow, and completion checks.

## Current Data Flow

```text
3.ged
  -> GEDCOM parsing
  -> descendant tree building
  -> D3 hierarchy/rendering
  -> browser interaction in the static viewer
```

## Missing but Expected Slice

The Supabase-backed application state remembered by the team is not present in this checkout.

Until that slice is restored, architecture work should focus on:

- identifying the true application baseline
- recovering the intended runtime boundaries
- understanding how Supabase was expected to integrate
- defining the first stable end-to-end flow

## Workflow and Source of Truth

- Product code and history: git repository `Antigravity`
- Session context: `.claude/*`
- Current task tracking before Vibe Kanban: `.claude/BACKLOG.md`
- Future parallel task orchestration: Vibe Kanban, after explicit adoption

## Branch and Shared Memory Policy

- `main` is the current integration branch.
- Do not create several parallel workspaces until Supabase stabilization is complete.
- Once Vibe Kanban is introduced, keep `.claude/SNAPSHOT.md` and `.claude/ARCHITECTURE.md` synchronized from integration branches or dedicated integration PRs.
- Avoid using `.claude/*` as an actively edited artifact in every future workspace branch.

## Framework Notes

- Project memory lives in `.claude/` files.
- Execution adapters run from `.claude/` for Claude and `.codex/` for Codex.
- Shared runtime is implemented in `src/framework-core/`.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-05 14:08:00Z`
- Active branch: `main`
- Git status: `STATUS:0 files`
- Git diff: `DIFF:0 lines`

### Detected Stack

- Node.js / npm

### Top-Level Structure Snapshot

- `.env.example`
- `.env.local`
- `.gitattributes`
- `.github/`
- `.gitignore`
- `.next/`
- `.next-dev.err.log`
- `.next-dev.log`
- `.next-start.err.log`
- `.next-start.log`
- `.tmp/`
- `3.ged`
- `AGENTS.md`
- `app/`
- `CHANGELOG.md`
- `check-ids.html`
- `CLAUDE.md`
- `components/`
- `css/`
- `FRAMEWORK_GUIDE.md`

### Recently Changed Paths

- `<none>`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-03-05 14:08:00Z`
- Branch: `main`
- Git status summary: `STATUS:0 files`
- Git diff summary: `DIFF:0 lines`

- Session summary: `0` changed files, `0` diff lines, `0` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:0 files`)
- `git_diff`: `success` (`DIFF:0 lines`)
<!-- FRAMEWORK:SESSION:END -->
