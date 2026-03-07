# SNAPSHOT — Antigravity

*Last updated: 2026-03-07*

## Current State

- Framework mode: active
- Active branch: `main`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: media upload redesign v2, thumbnail planning, tree canvas polish, and builder/members stabilization

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

- [ ] Current media upload UX is still not archive-ready: no multi-file flow, no device video upload in the main path, no progress, no limits copy.
- [ ] Preview architecture still lacks thumbnail variants, so originals remain too heavy for large family archives.
- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.
- [ ] Manual memory notes had drifted away from the real workstream and need to stay fresh after each cycle.
- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.

## Current Focus

- [ ] Rebuild the media upload UX around one human-friendly local-file flow for photos and videos.
- [ ] Add multi-file upload, visible limits, and upload progress states.
- [ ] Plan thumbnail variants (`thumb/small/medium`) as the next media architecture step, with CDN later.
- [ ] Finish the current `family-tree-canvas` interaction and visual pass.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.
- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.
- [ ] Keep startup context, structured docs and memory files aligned with the current sprint.

## Next Steps

- [ ] Fix `spawn ENAMETOOLONG` in the upload path and confirm a stable multi-file upload loop.
- [ ] Allow file-backed video upload from device in the same primary flow as photos.
- [ ] Add limits copy and per-file progress UX near the upload action.
- [ ] Start the additive thumbnail/variant design after the upload flow is stable.
- [ ] Smoke-check `family-tree-canvas` scenarios with tests plus manual review on key widths.
- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.
- [ ] Decide when to start the `Cloudflare R2` exploratory follow-up without destabilizing the current object-storage path.
- [ ] Revisit landing and dashboard only after tree/member workflows are stable.
- [ ] Close each concrete work cycle with `/fi` so memory sync keeps the plan current.

## Working Cycle

1. Run `codex` in the terminal.
2. Type `start` in the agent chat.
3. Work on one concrete task.
4. Type `/fi` to close the cycle.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-07 13:48:38Z`
- Active branch: `main`
- Git status: `STATUS:57 files`
- Git diff: `DIFF:8744 lines`

### Top Changed Paths

- `.claude/ARCHITECTURE.md`
- `.claude/BACKLOG.md`
- `.claude/SNAPSHOT.md`
- `.codex/commands/start.md`
- `.codex/commands/start.sh`
- `.codex/config/framework-adapter.json`
- `.codex/utils/backlog-start-hint.py`
- `.env.example`
- `AGENTS.md`
- `README.md`

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

- Completed at (UTC): `2026-03-07 13:48:38Z`
- Branch: `main`
- Git status summary: `STATUS:57 files`
- Git diff summary: `DIFF:8744 lines`

- Session summary: `57` changed files, `8744` diff lines, `10` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:57 files`)
- `git_diff`: `success` (`DIFF:8744 lines`)
<!-- FRAMEWORK:SESSION:END -->
