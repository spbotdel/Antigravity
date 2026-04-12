# ARCHITECTURE — Antigravity

*Hybrid memory file. The generated snapshot block below is the source of truth for current repo shape; manual notes are supplemental only.*

<!-- FRAMEWORK:ARCHITECTURE:START -->
## Current Architecture Snapshot

- Generated at (UTC): `2026-04-07 20:41:18Z`
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
- Server-side Supabase transport is a documented architecture detail:
  - `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch
  - `scripts/supabase-http.ps1` exists as fallback/debug transport, not the intended primary path
- Tree pages should not default to `getTreeSnapshot(...)`:
  - full snapshot is for viewer and snapshot consumers
  - narrower tree pages should use specialized repository page loaders when possible
- Builder normal tree mode now behaves as a workspace surface rather than a page hero: the page-level hero block is removed, the section nav is mounted in-stage, and the tree heading is rendered as a text-only overlay inside the canvas shell.
- Expanded Builder gallery mode intentionally keeps its separate stage-header/back-action path; the in-stage overlay pattern applies to normal tree mode only.
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

- Updated at (UTC): `2026-04-07 20:41:18Z`
- Active branch: `feature/ui-ux-final-polish`
- Git status: `STATUS:6 files`
- Git diff: `DIFF:280 lines`

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
- `.playwright-cli/`
- `.tmp/`
- `3.ged`
- `AGENTS.md`
- `app/`
- `ARCHITECTURE_RULES.md`
- `CHANGELOG.md`
- `check-ids.html`
- `CLAUDE.md`
- `cloudflare/`
- `COMMON_BUGS.md`
- `components/`

### Recently Changed Paths

- `DECISIONS.md`
- `app/globals.css`
- `app/tree/[slug]/audit/page.tsx`
- `app/tree/[slug]/media/page.tsx`
- `app/tree/[slug]/members/page.tsx`
- `app/tree/[slug]/settings/page.tsx`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-04-07 20:41:18Z`
- Branch: `feature/ui-ux-final-polish`
- Git status summary: `STATUS:6 files`
- Git diff summary: `DIFF:280 lines`

- Session summary: `6` changed files, `280` diff lines, `6` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:6 files`)
- `git_diff`: `success` (`DIFF:280 lines`)
<!-- FRAMEWORK:SESSION:END -->

## Current Media Architecture

- Person-linked media and tree-level archive now coexist: the worktree contains `/tree/[slug]/media`, archive client UI, archive upload endpoints, and persisted album wiring.
- Archive organization is modeled through `tree_media_albums` and album items, with both manual albums and uploader albums supported.
- Photo delivery already has a variant-aware foundation: preview reads may use `thumb/small/medium`, while originals should remain an explicit full-view path.
- The binary plane is in transitional mode: current file-backed reads still preserve object-storage compatibility, while Cloudflare R2 foundation is already present in env/runtime config for the next migration stage.
- Architectural boundary remains unchanged: `app/api/media*` stays thin, repository owns media/archive mutations, and rendering consumes repository snapshots rather than issuing direct DB traversal.
- Active architecture-driving task: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Server-side Supabase transport is now a first-class runtime rule: native Node fetch is preferred, while the PowerShell bridge remains fallback/debug transport only.
- Tree runtime now distinguishes between full snapshot consumers and narrow page-data consumers; `audit`, `members`, `media`, and `settings` should stay on specialized loaders instead of drifting back to full snapshots.
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.
- "
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.\n"
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.\n"
- Custom marker-driven runtime rule should surface in startup memory.\n")

## Current Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.
- "
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.\n"
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.\n"
- Custom marker-driven runtime rule should surface in startup memory.\n")

