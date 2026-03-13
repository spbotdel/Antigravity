# REPO_MAP

## Purpose

`Antigravity` is a `Next.js 16 + React 19 + TypeScript + Supabase` family tree application.

## Canonical Documentation Entrypoint

This file is the canonical navigation entrypoint for understanding the repository.

Use the documentation hierarchy below:

- Core project understanding:
  - `REPO_MAP.md`
  - `PROJECT_SUMMARY.md`
  - `ARCHITECTURE_RULES.md`
  - `DECISIONS.md`
- Operational memory:
  - `.claude/SNAPSHOT.md`
  - `.claude/BACKLOG.md`
- Domain documentation, read only when relevant:
  - `TREE_MODEL.md`
  - `TREE_ALGORITHMS.md`
  - `DATA_FLOW.md`
  - `SYSTEM_INVARIANTS.md`
- Framework / tooling docs:
  - `CLAUDE.md`
  - `AGENTS.md`
  - `FRAMEWORK_GUIDE.md`

### Documentation Roles

| Document | Role | Read when | Source of truth |
| --- | --- | --- | --- |
| `REPO_MAP.md` | navigation | always | yes |
| `PROJECT_SUMMARY.md` | product overview | onboarding | yes |
| `ARCHITECTURE_RULES.md` | constraints | before code changes | yes |
| `DECISIONS.md` | rationale | architecture or risky work | yes |
| `.claude/SNAPSHOT.md` | current state | active work | no |
| `.claude/BACKLOG.md` | current tasks | planning | no |
| `TREE_MODEL.md` | domain model | domain changes | yes |
| `TREE_ALGORITHMS.md` | rendering algorithms | builder/viewer work | yes |
| `DATA_FLOW.md` | runtime flow | API / loading / media flow work | yes |
| `SYSTEM_INVARIANTS.md` | invariants | risky domain or rendering changes | yes |
| `COMMON_BUGS.md` | debugging map | bugfixes | no |
| `AGENTS.md` | Codex adapter | framework workflow only | no |
| `CLAUDE.md` | framework protocols | framework workflow only | no |
| `FRAMEWORK_GUIDE.md` | framework overview | framework workflow only | no |

Current product shape:
- private/public family trees
- roles: `owner`, `admin`, `viewer`
- invite-based access
- family share links for read-only viewing
- builder/viewer around a family tree canvas
- private media with signed delivery
- object-storage-backed file media plus external video links
- owner audit log

## Primary References

Use these first for product understanding:
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)
- [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md)
- [DECISIONS.md](./DECISIONS.md)

Operational memory for the current work cycle:
- [.claude/SNAPSHOT.md](./.claude/SNAPSHOT.md)
- [.claude/BACKLOG.md](./.claude/BACKLOG.md)

Secondary planning / historical references:
- [docs/research/gpt-5.4-handoff-context-2026-03-06.md](./docs/research/gpt-5.4-handoff-context-2026-03-06.md)
- [docs/research/family-tree-v1-slava-edition-plan-2026-03-06.md](./docs/research/family-tree-v1-slava-edition-plan-2026-03-06.md)
- [docs/research/family-tree-v1-slava-edition-implementation-plan-2026-03-06.md](./docs/research/family-tree-v1-slava-edition-implementation-plan-2026-03-06.md)
- [docs/research/family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md](./docs/research/family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md)

## Important Note

[README.md](./README.md) is the human-friendly project introduction, not the navigation authority.

[AGENTS.md](./AGENTS.md), [CLAUDE.md](./CLAUDE.md), and [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md) are framework/internal tooling docs. They are useful for agent workflow, but they are not the source of truth for the application architecture.

## Top-Level Layout

- `app/`
  App Router pages, layouts, error boundaries, and API route handlers.
- `components/`
  UI components for auth, dashboard, members, settings, audit, viewer, and builder canvas.
- `lib/`
  Core logic: auth, permissions, validators, display tree building, Supabase wrappers, and server repository.
- `supabase/`
  Local Supabase config, schema migrations, and seed data.
- `tests/`
  Vitest unit/component tests and Playwright-style smoke/e2e scripts.
- `docs/research/`
  Product, architecture, rollout, and operational docs for the current `Slava edition` phase.
- `legacy/`, `index.html`, `css/`, `js/`
  Old static viewer artifacts. Not the primary runtime.
- `scripts/`
  Operational/helper scripts, including the PowerShell HTTP bridge used by server-side Supabase REST calls.
- `src/framework-core/`
  Framework/memory tooling used by the Codex/Claude workflow, not the product runtime.

## Runtime Entry Points

### App pages

- `app/layout.tsx`
  Root layout.
- `app/page.tsx`
  Landing page.
- `app/dashboard/page.tsx`
  Dashboard.
- `app/auth/login/page.tsx`
- `app/auth/register/page.tsx`
- `app/auth/accept-invite/page.tsx`
- `app/tree/[slug]/page.tsx`
  Viewer.
- `app/tree/[slug]/builder/page.tsx`
  Builder.
- `app/tree/[slug]/members/page.tsx`
  Access management.
- `app/tree/[slug]/settings/page.tsx`
  Tree settings.
- `app/tree/[slug]/audit/page.tsx`
  Owner audit log.

Important loader rule for tree pages:
- viewer page and snapshot APIs may use `getTreeSnapshot(...)`
- builder page may use `getBuilderSnapshot(...)`
- pages such as `audit`, `members`, `media`, and `settings` should prefer specialized page-data loaders instead of pulling a full snapshot by default

### API routes

- `app/api/trees/route.ts`
  Create tree.
- `app/api/trees/[treeId]/route.ts`
  Update tree metadata.
- `app/api/trees/[treeId]/visibility/route.ts`
  Update tree visibility.
- `app/api/persons/route.ts`
- `app/api/persons/[personId]/route.ts`
- `app/api/relationships/parent-child/route.ts`
- `app/api/relationships/parent-child/[linkId]/route.ts`
- `app/api/partnerships/route.ts`
- `app/api/partnerships/[id]/route.ts`
- `app/api/invites/route.ts`
- `app/api/invites/accept/route.ts`
- `app/api/members/[membershipId]/route.ts`
- `app/api/share-links/route.ts`
- `app/api/share-links/[shareLinkId]/route.ts`
- `app/api/media/upload-intent/route.ts`
- `app/api/media/upload-file/route.ts`
- `app/api/media/complete/route.ts`
- `app/api/media/[mediaId]/route.ts`
- `app/api/tree/[slug]/snapshot/route.ts`
- `app/api/tree/[slug]/builder-snapshot/route.ts`
- `app/api/dashboard/route.ts`

## Core Product Components

### Layout and shell

- `components/layout/app-header.tsx`
  App header with auth-aware actions.
- `components/layout/tree-nav.tsx`
  Tree sub-navigation for viewer/builder/members/settings/audit.

### Dashboard and auth

- `components/dashboard/dashboard-page-client.tsx`
- `components/dashboard/dashboard-overview.tsx`
- `components/dashboard/create-tree-form.tsx`
- `components/auth/login-form.tsx`
- `components/auth/register-form.tsx`
- `components/auth/invite-acceptance-card.tsx`
- `components/auth/sign-out-button.tsx`

### Tree builder/viewer

- `components/tree/builder-workspace.tsx`
  Main builder state machine and inspector logic.
- `components/tree/family-tree-canvas.tsx`
  Canvas rendering, node actions, overlays, and relation affordances.
- `components/tree/tree-viewer-client.tsx`
  Read-only viewer shell around the canvas.

### Members/settings/audit

- `components/members/member-management-panel.tsx`
  Invite flow, family share links, role changes, revoke actions.
- `components/settings/tree-settings-form.tsx`
  Tree metadata and privacy controls.
- `components/audit/audit-log-table.tsx`
  Paginated audit feed UI.

## Core Library Files

### Server/data layer

- `lib/server/repository.ts`
  Main product repository. This is the most important server-side file in the app.
  It handles:
  - tree reads/writes
  - memberships and invites
  - share links
  - persons and relationships
  - media creation/access/deletion
  - object storage signed upload/read/delete flow
  - audit loading

- `lib/server/auth.ts`
  Current-user resolution. In development it supports `DEV_IMPERSONATE_USER_*`.
- `lib/server/errors.ts`
  App error types and HTTP error formatting.
- `lib/server/invite-token.ts`
  Opaque token helpers for invites/share links.

### Permissions and domain helpers

- `lib/permissions.ts`
  Viewer capability model and media/tree visibility checks.
- `lib/types.ts`
  Shared app-level types.
- `lib/ui-text.ts`
  Text formatting for roles, media kinds, visibility, audit labels, etc.
- `lib/audit-presenter.ts`
  Converts raw audit entries into human-readable feed items.
- `lib/tree/display.ts`
  Builds display trees and person-media projections for viewer/builder.

### Validation

- `lib/validators/tree.ts`
- `lib/validators/person.ts`
- `lib/validators/relationship.ts`
- `lib/validators/invite.ts`
- `lib/validators/share-link.ts`
- `lib/validators/media.ts`

### Supabase integration

- `lib/supabase/server.ts`
- `lib/supabase/browser.ts`
- `lib/supabase/middleware.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/admin-rest.ts`
  Admin REST wrapper used by the repository.
  Important operational rule:
  - default transport is `native Node fetch`
  - `PowerShell` bridge is fallback-only unless `SUPABASE_ADMIN_REST_TRANSPORT=powershell`
- `lib/supabase/server-fetch.ts`
  Shared native-first fetch wrapper with PowerShell fallback for unstable Windows/network environments.
- `scripts/supabase-http.ps1`
  PowerShell bridge for REST requests from the server environment.
  This is a resilience/debugging fallback, not the preferred steady-state transport.

## Database and Migrations

Main schema:
- `supabase/migrations/20260301193000_family_tree_v1.sql`

Recent additions:
- `supabase/migrations/20260306160000_tree_share_links_v1.sql`
  Family share links table and policies.
- `supabase/migrations/20260306173000_unified_media_v1.sql`
  Adds `document` media kind.
- `supabase/migrations/20260306173100_unified_media_constraints_v1.sql`
  Updates media constraints after enum expansion.
- `supabase/migrations/20260307111500_object_storage_provider_v1.sql`
  Adds `object_storage` media provider.
- `supabase/migrations/20260307111600_object_storage_provider_constraints_v1.sql`
  Applies provider constraints after enum expansion.

Seed/config:
- `supabase/seed.sql`
- `supabase/config.toml`

Important operational note:
- remote Supabase can drift from local migrations; if behavior suggests a missing table/column, verify remote migration state first.

## Request/Data Flow

Typical path:
1. App page or API route in `app/`
2. Validation in `lib/validators/*`
3. Business/data access in `lib/server/repository.ts`
4. Supabase via:
   - server/browser SDK clients, or
   - admin REST bridge in `lib/supabase/admin-rest.ts`
5. UI rendering in `components/*`

## Architecture Rules

Follow these rules when modifying the codebase:

- API routes should remain thin and delegate logic to the repository layer.
- All database access should go through `lib/server/repository.ts`.
- Validation must be performed using `lib/validators/*` before calling repository functions.
- UI components should not directly access Supabase or the database.
- Shared business logic should live in `lib/` rather than `components/` or `app/`.
- Prefer extending existing modules over introducing new abstractions.
- Avoid duplicating repository queries or permission checks.

## Testing Map

### Unit/component tests

- `tests/permissions.test.ts`
- `tests/powershell-json.test.ts`
- `tests/validators.test.ts`
- `tests/tree-display.test.ts`
- `tests/audit-presenter.test.ts`
- `tests/dashboard-model.test.ts`
- `tests/dashboard-overview.test.tsx`
- `tests/family-tree-canvas.test.tsx`
- `tests/invite-token.test.ts`

### E2E/smoke scripts

- `tests/smoke-e2e.mjs`
  Main smoke flow.
- `tests/auth-smoke-e2e.mjs`
  Auth/account flow.
- `tests/media-storage-e2e.mjs`
  Focused regression for object-storage photo/video and external video links.
- `tests/builder-stress-e2e.mjs`
  Builder stress scenario.
- `tests/realistic-tree-e2e.mjs`
  Large realistic data scenario.
- `tests/builder-left-branches-e2e.mjs`
  Regression for left-parent branches, partners, spouse parents, and deletion.

### Artifacts

- `tests/artifacts/`
  Screenshots and reports from manual/e2e runs. Useful for debugging, not source code.

## Operational Notes

- `NEXT_PUBLIC_SITE_URL` and Supabase env in `.env.local` drive local runtime.
- In development, `DEV_IMPERSONATE_USER_ID` can make pages work even when live auth/network is unstable.
- The current linked remote Supabase project ref is stored in `supabase/.temp/project-ref`.
- GitHub and Supabase network access may be intermittently unstable in this environment; distinguish product bugs from transport issues before changing logic.
- On Windows, project helper commands under `.codex/commands/*.sh` assume a real Bash runtime.
  If `bash` resolves to the WSL stub and no distro is installed, use Git Bash instead of assuming the project command itself is broken.
- For server-side Supabase REST:
  - prefer reading `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` before changing transport behavior
  - do not assume the PowerShell bridge is the primary path
  - `SUPABASE_ADMIN_REST_TRANSPORT=auto` is the intended default

## Dependency Map

Typical dependency chain:

UI components
→ API routes in `app/api/*`
→ validators in `lib/validators/*`
→ business logic in `lib/server/repository.ts`
→ Supabase clients in `lib/supabase/*`
→ database tables defined in `supabase/migrations/*`

## Safe Areas To Ignore

Usually not part of product runtime changes:
- `.next/`
- `node_modules/`
- `tests/artifacts/`
- `legacy/` unless explicitly working on preserved old viewer files
- `src/framework-core/` unless changing framework/memory tooling

## Suggested First Reads For New Work

If the task is product behavior:
1. `app/tree/[slug]/*`
2. `components/tree/*`
3. `lib/server/repository.ts`
4. relevant validator in `lib/validators/*`
5. matching test in `tests/*`

If the task is access/auth:
1. `components/members/member-management-panel.tsx`
2. `app/api/invites/*`
3. `app/api/share-links/*`
4. `lib/permissions.ts`
5. `lib/server/auth.ts`
6. `lib/server/repository.ts`

If the task is media:
1. `components/tree/builder-workspace.tsx`
2. `components/tree/tree-viewer-client.tsx`
3. `app/api/media/*`
4. `lib/validators/media.ts`
5. `lib/server/repository.ts`
6. latest media migrations in `supabase/migrations/`
7. `tests/media-storage-e2e.mjs`

## Required Reading Matrix

Before making a non-trivial change, first read:

1. `PROJECT_SUMMARY.md`
2. `REPO_MAP.md`

Then continue by task type:

If the task affects domain logic:
- `TREE_MODEL.md`
- `SYSTEM_INVARIANTS.md`
- `ARCHITECTURE_RULES.md`

Examples:
- person mutations
- relationship mutations
- invite/share-link behavior
- media access behavior

If the task affects tree rendering or builder behavior:
- `TREE_MODEL.md`
- `TREE_ALGORITHMS.md`
- `DATA_FLOW.md`
- `SYSTEM_INVARIANTS.md`

Examples:
- builder bugs
- viewer/tree rendering issues
- selection/state issues
- couple/shared-child behavior
- canvas layout issues

If the task is a bugfix:
- `COMMON_BUGS.md`

Before changing code, first check whether the issue is more likely to be:
1. migration drift
2. snapshot mismatch
3. permission filtering
4. environment/runtime noise
5. actual product bug

If the task affects runtime flow:
- `DATA_FLOW.md`
- `ARCHITECTURE_RULES.md`
- `SYSTEM_INVARIANTS.md`

Examples:
- snapshot loading
- API mutation flow
- media upload flow
- audit flow
- invite/share-link flow

If the task is large or risky:
- `DECISIONS.md`

Required when the task could affect:
- architecture
- invariants
- permissions
- repository boundaries
- display semantics

Before coding, be able to state:
- what subsystem is affected
- which files are likely involved
- whether this changes domain logic, rendering logic, or runtime flow
- which invariants must remain true

If that cannot be stated clearly, continue reading before coding.

## Stability Zones

The following areas are considered stable and should not be refactored unless the task explicitly requires it:

- `lib/server/repository.ts`
- database schema in `supabase/migrations/*`
- permission model in `lib/permissions.ts`
- API route structure in `app/api/*`

Prefer minimal changes over architectural refactoring.

## Key Files

Core data layer:
lib/server/repository.ts

Permissions:
lib/permissions.ts

Tree display logic:
lib/tree/display.ts

Supabase integration:
lib/supabase/*

## Recommended Workflow For Agents

Before implementing changes:

1. Read this `REPO_MAP.md`.
2. Use the `Required Reading Matrix` above to determine the minimum docs for the task type.
3. Identify relevant modules.
4. Read `lib/server/repository.ts` if data access is involved.
5. Locate the relevant validator in `lib/validators/*`.
6. Inspect related tests in `tests/*`.

Then propose a minimal implementation plan before editing files.
