# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-03-16*

## Current State

- Framework mode: active
- Active branch: `fix/builder-inspector-desktop-align-final`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: family archive foundation, uploader/manual albums, variant-aware media delivery, and Cloudflare R2 groundwork are already in the worktree; current effort should now shift to archive/viewer polishing, broader QA, and migration sequencing
- Target media platform: `Cloudflare` for the next binary/media delivery stage, while the current Yandex path remains transitional compatibility.

## Current Active Task

- `tasks/active/media-upload-flow-v2` — `Media Upload Flow V2` (`in_progress`, priority `high`)
- Latest `smoke:media`: `media-storage-report-1773671336869.json` (`green`)

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
- [x] Archive surface now includes a large in-app viewer/lightbox and sticky bottom actions for the current context.
- [x] Variant-aware media delivery foundation exists for `thumb/small/medium` photo previews.
- [x] Cloudflare R2 runtime/config foundation is present for the next media storage stage.
- [ ] Finish the current `family-tree-canvas` interaction and visual pass.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow.
- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.
- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.

## Active Blockers

- [ ] Current media upload UX is still not archive-ready: single flow, multi-file batches, device video, limits and progress need to be confirmed end-to-end.
- [ ] Cloudflare target foundations exist in code/env, but the actual migration away from the transitional Yandex path is still incomplete.
- [ ] Preview variant foundations exist, but rollout and QA are still incomplete; originals should not leak back into archive/viewer/builder previews.
- [ ] The tree-level family archive now has sticky actions and a large viewer/lightbox, but broader album/mobile/end-to-end QA is still unfinished.
- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.

## Next Steps

- [ ] Convert the Cloudflare target into an explicit migration sequence: rollout gating, direct upload, Stream, and Queues.
- [ ] Finish archive album/mobile QA now that sticky actions and the large viewer/lightbox are in place.
- [ ] Switch tree cards, side rails, archive tiles, and media galleries to preview variants by default and confirm legacy fallbacks.
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
- Latest `smoke:media` artifact `media-storage-report-1773671336869.json` is green.

## Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.
- "
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.\n"
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.\n"
- Custom marker-driven runtime rule should surface in startup memory.\n")
