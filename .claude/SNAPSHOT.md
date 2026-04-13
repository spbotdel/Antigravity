# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-04-13*

## Current State

- Framework mode: active
- Active branch: `feature/ux-media-update`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: family archive foundation, unified upload, variant-aware media delivery, and Cloudflare R2 groundwork are already in the worktree; the latest local pass added responsive viewer/media behavior for phone and tablet, and current effort should focus on hosted/real-device QA plus remaining archive/member validation
- Target media platform: `Cloudflare` for the next binary/media delivery stage, while the current Yandex path remains transitional compatibility.

## Current Active Task

- `tasks/active/media-upload-flow-v2` — `Media Upload Flow V2` (`in_progress`, priority `high`)

## Working Assumptions

- One family tree per owner remains the current v1 scope
- `Cloudflare R2` is the intended steady-state upload path for new file-backed media
- Legacy Yandex-backed reads remain a compatibility path until migration is explicitly closed
- Tree pages should use specialized page-data loaders unless they truly need a full snapshot
- Server-side Supabase transport remains `native-first` with `PowerShell` fallback only for transport instability
- Local `next dev` with `DEV_IMPERSONATE_*` is not a trustworthy surface for real multi-user invite validation or perceived route-speed checks
- Hosted staging without `DEV_IMPERSONATE_*` becomes the truth surface after Wave 1
- Full `shadcn` migration is deferred to Wave 3
- Invite email delivery is planned for Wave 2 through `Resend`, while app-level invite URLs remain the source of truth
- Application hosting target is `Vercel`; Cloudflare remains the storage plane via `R2`, not the app runtime target
- The current hosted validation URL is the `main` branch alias:
  `https://antigravity-git-main-spbotdel-4945s-projects.vercel.app`
- The current public hosted validation surface is the production alias:
  `https://antigravity-zeta-two.vercel.app`

## Current Focus

- [x] Unified local-file upload now covers photos and videos from device in one flow.
- [x] Multi-file batches, visible limits copy, and human-readable progress feedback are in place in the builder.
- [x] Viewer and builder now expose an in-app media gallery with inline playback for file-backed video.
- [x] `smoke:media` now persists a JSON report artifact in `tests/artifacts/`.
- [x] Tree-level `/tree/[slug]/media` archive foundation is in place with navigation, page shell, and archive client.
- [x] Archive album persistence exists for manual albums and uploader albums.
- [x] Archive upload review flow exists with batch confirmation and discard guard.
- [x] Variant-aware media delivery foundation exists for `thumb/small/medium` photo previews.
- [x] Cloudflare R2 runtime/config foundation is present for the next media storage stage.
- [x] Viewer info rail now adapts by viewport: desktop keeps a resizable side rail, tablet uses an overlay rail, and phone uses a bottom sheet with `peek/open/hidden` behavior.
- [x] Archive and viewer media controls now have mobile-specific tabs, coarse-pointer touch targets, and bounded lightbox navigation instead of one shared over-broad responsive rule set.
- [ ] Finish the current `family-tree-canvas` interaction and visual pass.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.
- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.
- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.

## Active Blockers

- [ ] Current media upload UX is still not archive-ready: single flow, multi-file batches, device video, limits and progress need to be confirmed end-to-end.
- [ ] Cloudflare target foundations exist in code/env, but the actual migration away from the transitional Yandex path is still incomplete.
- [ ] Preview variant foundations exist, but rollout and QA are still incomplete; originals should not leak back into archive/viewer/builder previews.
- [ ] The tree-level family archive foundation exists, but sticky actions, large viewer/lightbox flow, and broader end-to-end QA are still unfinished.
- [ ] The latest phone/tablet viewer and archive responsive pass is local-first and still needs practical QA on hosted `Vercel` plus real device widths.
- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.

## Next Steps

- [ ] Convert the Cloudflare target into an explicit migration sequence: rollout gating, direct upload, Stream, and Queues.
- [ ] Finish the archive surface with sticky actions, large viewer/lightbox behavior, and broader album flow QA.
- [ ] Switch tree cards, side rails, archive tiles, and media galleries to preview variants by default and confirm legacy fallbacks.
- [ ] Run phone/tablet QA for the new viewer sheet, archive tabs/grid, coarse-pointer actions, and builder inspector overlay on both local and hosted surfaces.
- [ ] Run targeted QA for viewer, builder and members after the current media UI pass.
- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.
- [ ] Revisit landing and dashboard only after tree/member workflows are stable.
- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.

## Completion Capture

- Primary captured workstream: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Detected foundation: tree-level `Медиа` route, archive client, archive upload endpoints, and persisted album model are present in the worktree.
- Detected archive upload review flow with pending batch state and discard confirmation.
- Detected variant-aware media delivery foundation for photo previews (`thumb/small/medium`).
- Detected Cloudflare R2 foundation in env/runtime config and supporting project files.
- Detected responsive viewer shell in the last local pass: desktop resizable rail, tablet overlay rail, and phone bottom sheet with stable selection state.
- Detected mobile media polish in the last local pass: archive tab lists use mobile grid classes, coarse-pointer actions are enlarged, and lightbox prev/next now stop at list bounds instead of wrapping.
- No `smoke:media` artifact was found during completion capture.

## Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Shared responsive media classes must stay scoped by context: fullscreen lightbox, inline gallery, archive controls, and viewer rails should not share unsafe global mobile rules.
- Viewer person details are now viewport-specific UI shell behavior: desktop uses a resizable rail, tablet an overlay rail, and phone a bottom sheet; shell changes must not break selection state or create empty floating chrome.

