# ARCHITECTURE — Antigravity

*Hybrid memory file. The generated snapshot block below is the source of truth for current repo shape; manual notes are supplemental only.*

<!-- FRAMEWORK:ARCHITECTURE:START -->
## Current Architecture Snapshot

- Generated at (UTC): `2026-03-12 18:00:28Z`
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

- Updated at (UTC): `2026-03-12 18:00:28Z`
- Active branch: `main`
- Git status: `STATUS:99 files`
- Git diff: `DIFF:13444 lines`

### Detected Stack

- Node.js / npm

### Top-Level Structure Snapshot

- `.env.example`
- `.env.local`
- `.gitattributes`
- `.github/`
- `.gitignore`
- `.next/`
- `.next-auth-smoke/`
- `.next-dev.err.log`
- `.next-dev.log`
- `.next-invite-debug/`
- `.next-media-smoke/`
- `.next-smoke-e2e/`
- `.next-smoke-e2e-1773097073046-4wl4k8/`
- `.next-start.err.log`
- `.next-start.log`
- `.pytest_cache/`
- `.tmp/`
- `.vscode/`
- `3.ged`
- `AGENTS.md`

### Recently Changed Paths

- `.claude/ARCHITECTURE.md`
- `.claude/BACKLOG.md`
- `.claude/SNAPSHOT.md`
- `.codex/config/framework-adapter.json`
- `.env.example`
- `.gitignore`
- `COMMON_BUGS.md`
- `DECISIONS.md`
- `README.md`
- `REPO_MAP.md`
- `app/api/dashboard/route.ts`
- `app/api/media/[mediaId]/route.ts`
- `app/api/media/upload-file/route.ts`
- `app/globals.css`
- `app/tree/[slug]/audit/page.tsx`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-03-12 18:00:28Z`
- Branch: `main`
- Git status summary: `STATUS:99 files`
- Git diff summary: `DIFF:13444 lines`

- Session summary: `99` changed files, `13444` diff lines, `15` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:99 files`)
- `git_diff`: `success` (`DIFF:13444 lines`)
<!-- FRAMEWORK:SESSION:END -->

## Current Media Architecture

- Person-linked media and tree-level archive now coexist: the worktree contains `/tree/[slug]/media`, archive client UI, archive upload endpoints, and persisted album wiring.
- Archive organization is modeled through `tree_media_albums` and album items, with both manual albums and uploader albums supported.
- The archive read surface now includes a large in-app viewer/lightbox and sticky footer actions, so gallery browsing no longer depends on narrow cards or external tab jumps.
- Photo delivery already has a variant-aware foundation: preview reads may use `thumb/small/medium`, while originals should remain an explicit full-view path.
- The binary plane is in transitional mode: current file-backed reads still preserve object-storage compatibility, while Cloudflare R2 foundation is already present in env/runtime config for the next migration stage.
- Architectural boundary remains unchanged: `app/api/media*` stays thin, repository owns media/archive mutations, and rendering consumes repository snapshots rather than issuing direct DB traversal.
- Active architecture-driving task: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Current regression signal: latest `smoke:media` artifact `media-storage-report-1773322585848.json` is green.
- Share-link architecture is moving from `hash-only + reveal-once` to `token_hash for validation + encrypted revealable token for owner/admin UX`; legacy links remain readable but may require reissue if they predate encrypted storage.
- Invite delivery remains an application-level concern: the system keeps `tree_invites` as the source of truth, and planned email delivery should send the existing app-generated invite URL rather than redesigning around Supabase Auth invite emails.
- Hosted staging is the intended validation surface after Wave 1: real auth, invite/share-link behavior, and perceived speed should be judged there rather than from local `next dev` with `DEV_IMPERSONATE_*`.
- A full `shadcn` / design-system migration is intentionally deferred until after launch-critical fixes and hosted validation.

## Current Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Local `next dev` with `DEV_IMPERSONATE_*` is not a valid surface for final invite-role validation or route-speed conclusions.
- After Wave 1, hosted staging without impersonation becomes the truth surface for real user-path checks.
- Planned email invite delivery should keep a manual-copy fallback even when mail transport succeeds.

