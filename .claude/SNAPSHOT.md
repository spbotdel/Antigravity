# SNAPSHOT — Antigravity

*Last updated: 2026-03-02*

## Current State

- Framework mode: active
- Active branch: `main`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS, storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: UX/UI simplification, readability pass, and dashboard/landing cleanup

## Project Overview

Antigravity is a family tree platform with roles, private/public trees, media attachments, invites, and an owner audit log.

The core product baseline already exists in this repository. The main near-term work is no longer recovery of a missing Supabase app, but refinement of the live Next.js product and its interaction quality.

## Current Product Shape

- App Router pages: `app/`
- UI components: `components/`
- Shared logic: `lib/`
- Supabase SQL and seeds: `supabase/`
- Tests: `tests/`
- Legacy artifacts: `legacy/`, `index.html`, `css/`, `js/`

## Working Assumptions

- One family tree per owner in v1 remains the current scope.
- Photos are stored through Supabase Storage with access checks.
- Yandex video links are treated as public-only in v1.
- Russian is the active UI language.
- The tree canvas must remain the central object of the product, not a secondary widget below forms or marketing copy.

## Active Blockers

- [ ] Landing first screen is still too loud and not yet minimal enough.
- [ ] Dashboard still needs cleaner hierarchy, calmer typography, and clearer CTA affordance.
- [ ] Product-wide typography is not yet final and needs one stable readable system.
- [ ] Some screens still carry excess copy, empty space, or oversized headings from earlier design passes.

## Current Focus

- [ ] Simplify landing and dashboard first screens.
- [ ] Finish the typography and spacing pass across all main screens.
- [ ] Keep builder/viewer centered around the family tree canvas.
- [ ] Reduce visual weight while preserving clear actions and permissions.

## Next Steps

- [ ] Remove remaining oversized hero patterns and awkward line breaks.
- [ ] Tighten CTA hierarchy on dashboard, landing, settings, and tree screens.
- [ ] Continue inspector cleanup in the builder.
- [ ] Run another visual QA pass on desktop widths and mobile.

## Working Cycle

1. Run `codex` in the terminal.
2. Type `start` in the agent chat.
3. Work on one concrete task.
4. Type `/fi` to close the cycle.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-05 14:08:00Z`
- Active branch: `main`
- Git status: `STATUS:0 files`
- Git diff: `DIFF:0 lines`

### Top Changed Paths

- `<none>`

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
