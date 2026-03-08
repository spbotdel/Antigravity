# SNAPSHOT — Antigravity

*Last updated: 2026-03-08*

## Current State

- Framework mode: active
- Active branch: `main`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: media upload and in-app viewing are largely stabilized; next media step is thumbnail variants, alongside tree canvas polish and builder/members QA

## Project Overview

Antigravity is a family tree platform with roles, private/public trees, media attachments, invites, and an owner audit log.

The core product baseline already exists in this repository. The near-term work is centered on the live Next.js product: keep tree interactions calmer and more predictable, finish access-management UX, and keep project memory aligned with the actual runtime after closing the current media milestone.

## Current Product Shape

- App Router pages: `app/`
- UI components: `components/`
- Shared logic: `lib/`
- Supabase SQL and seeds: `supabase/`
- Tests: `tests/`
- Legacy artifacts: `legacy/`, `index.html`, `css/`, `js/`

## Current Active Task

- `tasks/active/media-upload-flow-v2/`

## Working Assumptions

- One family tree per owner in v1 remains the current scope.
- File-backed media now runs through a generic object-storage path, currently verified with `Yandex Object Storage`.
- External video links remain supported as a separate path from file-backed media.
- Russian is the active UI language.
- The tree canvas must remain the central object of the product, not a secondary widget below forms or marketing copy.
- The startup file list for `start` is defined in `.codex/config/framework-adapter.json` under `startup_context_paths`.

## Active Blockers

- [ ] Preview architecture still lacks thumbnail variants, so originals remain too heavy for large family archives.
- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.

## Current Focus

- [x] Unified local-file upload now covers photos and videos from device in one flow.
- [x] Multi-file batches, visible limits copy, and human-readable progress feedback are in place in the builder.
- [x] Viewer and builder now expose an in-app media gallery with inline playback for file-backed video.
- [x] `smoke:media` now persists a JSON report artifact in `tests/artifacts/`.
- [ ] Add thumbnail variants (`thumb/small/medium`) so previews stop loading originals by default.
- [ ] Finish the current `family-tree-canvas` interaction and visual pass.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.
- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.
- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.

## Next Steps

- [ ] Implement variant-aware media delivery for `thumb/small/medium`, keeping originals only for explicit full view.
- [ ] Switch tree cards, side rails and media galleries to preview variants instead of originals.
- [ ] Run targeted QA for viewer, builder and members after the current media UI pass.
- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.
- [ ] Revisit landing and dashboard only after tree/member workflows are stable.
- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.

## Working Cycle

1. Run `codex` in the terminal.
2. Type `start` in the agent chat.
3. Work on one concrete task.
4. Type `/fi` to close the cycle.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-08 06:54:26Z`
- Active branch: `main`
- Git status: `STATUS:20 files`
- Git diff: `DIFF:1994 lines`

### Top Changed Paths

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
