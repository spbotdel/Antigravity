# ARCHITECTURE — Antigravity

*Hybrid memory file. The generated snapshot block below is the source of truth for current repo shape; manual notes are supplemental only.*

<!-- FRAMEWORK:ARCHITECTURE:START -->
## Current Architecture Snapshot

- Generated at (UTC): `2026-03-08 06:54:26Z`
- Primary runtime: `Next.js App Router web application`
- Application stack: `Next.js 16.1.6 + React 19.2.4 + TypeScript + Supabase`
- Backend/data layer: `Supabase auth, database, RLS, and storage`
- Legacy artifacts: Legacy assets preserved in `legacy/` and top-level viewer files

### Active Runtime Boundaries

- `app/` - App Router pages, auth flows, dashboard, tree routes, and route handlers.
- `components/` - UI components for builder, viewer, settings, members, and auth.
- `lib/` - shared server logic, permissions, validators, tree/media helpers, and Supabase clients.
- `supabase/` - schema migrations, seed data, and local Supabase configuration.
- `tests/` - unit, smoke, and e2e coverage for product flows.
- `legacy/` plus top-level `index.html`/`css/`/`js/` - preserved static viewer artifacts, not the primary runtime.

### Freshness Rules

- The checked-out repository contains the live Next.js/Supabase product and a preserved legacy viewer.
- Treat this generated block as the current source of truth for repo shape; manual notes below should only add decisions that cannot be inferred automatically.
<!-- FRAMEWORK:ARCHITECTURE:END -->

## Manual Notes

- The active runtime is the Next.js + TypeScript + Supabase application described in `README.md` and `SNAPSHOT.md`.
- The static viewer is preserved in `legacy/` and top-level legacy files, but it is not the primary runtime.
- `lib/` is the main shared application layer:
  server repository layer, permissions model, validators, tree display algorithms, and Supabase integration clients.
- Keep project-specific architectural decisions here only when they cannot be inferred from repository structure.

## System Architecture

High-level architecture:

```text
Browser (React / Next.js App Router)
        ↓
Next.js route handlers (app/api/*)
        ↓
Validation layer (lib/validators/*)
        ↓
Repository layer (lib/server/repository.ts)
        ↓
Supabase clients
        ↓
Supabase database + RLS
        ↓
Supabase storage (media)
```

## Layer Responsibilities

`app/`
- routing
- page composition
- API route handlers

`components/`
- UI logic
- tree canvas
- builder UI

`lib/`
- business logic
- permissions
- validation
- display tree building

`supabase/`
- schema
- migrations
- database policies

`tests/`
- validation of domain logic
- display tree tests
- integration tests

## Data Ownership

The source of truth for domain data is the Supabase database.

Domain entities stored in database:

- trees
- persons
- parent links
- partnerships
- media
- memberships
- share links

The application server does not persist domain state locally.

Next.js route handlers act as stateless request handlers.

## Tree Rendering Pipeline

The viewer and builder derive display trees from snapshot data.

Pipeline:

```text
database records
→ repository snapshot
→ display tree builder
→ canvas renderer
→ interactive UI
```

Important:

The display tree is derived and must not be treated as the canonical domain model.

## Workflow and Source of Truth

- Product code and history: git repository `Antigravity`
- Session context: `.claude/*`
- Current task tracking before Vibe Kanban: `.claude/BACKLOG.md`
- Generated blocks in this file are refreshed by framework completion.
- Avoid duplicating generated repo-shape facts in manual sections.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-08 06:54:26Z`
- Active branch: `main`
- Git status: `STATUS:20 files`
- Git diff: `DIFF:1994 lines`

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
- `ARCHITECTURE_RULES.md`
- `CHANGELOG.md`
- `check-ids.html`
- `CLAUDE.md`
- `COMMON_BUGS.md`
- `components/`

### Recently Changed Paths

- `.claude/ARCHITECTURE.md`
- `.claude/BACKLOG.md`
- `.claude/SNAPSHOT.md`
- `app/api/media/[mediaId]/route.ts`
- `app/api/media/upload-file/route.ts`
- `app/globals.css`
- `components/tree/builder-workspace.tsx`
- `components/tree/person-media-gallery.tsx`
- `lib/server/repository.ts`
- `lib/tree/display.ts`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-03-08 06:54:26Z`
- Branch: `main`
- Git status summary: `STATUS:20 files`
- Git diff summary: `DIFF:1994 lines`

- Session summary: `20` changed files, `1994` diff lines, `10` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:20 files`)
- `git_diff`: `success` (`DIFF:1994 lines`)
<!-- FRAMEWORK:SESSION:END -->
