# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-03-28*

## Current State

- Framework mode: active
- Active branch: `fix/builder-inspector-desktop-align-final`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: family archive foundation, typed photo/video albums, album/file access enforcement, inherited album-targeted upload access, variant-aware media delivery, and Cloudflare R2 groundwork are already in the worktree; current effort should now shift to runtime verification, archive/viewer polishing, broader QA, and migration sequencing
- Target media platform: `Cloudflare` for the next binary/media delivery stage, while the current Yandex path remains transitional compatibility.

## Current Active Task

- `tasks/active/media-upload-flow-v2` — `Media Upload Flow V2` (`in_progress`, priority `high`)
- Latest `smoke:media`: `media-storage-report-1773931536758.json` (`green`)

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
- [x] Archive albums now have explicit `kind` (`photo | video`), and uploader albums are scoped by `(uploader, kind)`.
- [x] Uploader albums are now treated as virtual albums:
  count, cover and detail contents derive from all visible media matching `(tree, created_by, kind)`.
- [x] Album/file access model is now implemented in code:
  `effective_access = strictest(file.visibility, every album.access containing this file)`.
- [x] Remote schema rollout for `tree_media_albums.access` was recovered manually and linked migration history is reconciled.
- [x] Remote schema rollout for `tree_media_albums.kind` is now applied on the linked active database through migration `20260328043000_tree_media_albums_media_kind_v1.sql`.
- [x] Archive upload review flow exists with batch confirmation and discard guard.
- [x] Album create flow now selects `access` at creation time instead of deferring privacy choice to edit-only flow.
- [x] Upload into a selected album now inherits that album's `access` by default in the review UI.
- [x] Archive album linking is now idempotent and no longer relies on duplicate-key failure for already existing `(album_id, media_id)` rows.
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
- [ ] Full manual runtime verification for album/file effective access is still pending even though repository-level coverage is green.
- [ ] Manual end-to-end QA for repeated multi-photo upload into one selected album is still pending even though repository linking is now idempotent.
- [ ] Manual runtime QA should still confirm uploader virtual album semantics on non-test content after recent resets/migrations.
- [ ] Builder canvas resize and overlay inspector still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows need end-to-end validation against live API responses and clipboard behavior.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Landing/dashboard cleanup is no longer the primary blocker, but still needs a secondary calm pass after tree/member flows stabilize.

## Next Steps

- [ ] Convert the Cloudflare target into an explicit migration sequence: rollout gating, direct upload, Stream, and Queues.
- [ ] Finish archive album/mobile QA now that sticky actions and the large viewer/lightbox are in place.
- [ ] Manually verify typed album behavior in runtime:
  photo albums only in `Фото`, video albums only in `Видео`, and uploader albums split by kind.
- [ ] Manually verify repeated multi-file upload into one selected album after the idempotent link fix.
- [ ] Manually verify the accepted album/file access model in runtime:
  no albums, public album, members album, and mixed-album cases.
- [ ] Switch tree cards, side rails, archive tiles, and media galleries to preview variants by default and confirm legacy fallbacks.
- [ ] Run targeted QA for viewer, builder and members after the current media UI pass.
- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.
- [ ] Revisit landing and dashboard only after tree/member workflows are stable.
- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.

## Completion Capture

- Primary captured workstream: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Detected foundation: tree-level `Медиа` route, archive client, archive upload endpoints, and persisted album model are present in the worktree.
- Detected archive upload review flow with pending batch state and discard confirmation.
- Detected explicit album typing and uploader-per-kind archive model:
  albums persist `kind`, tabs render from explicit album kind, and legacy mixed test albums were reset.
- Detected uploader virtual album semantics:
  uploader card count, uploader cover and uploader detail contents now derive from the same visible media set by `(tree, created_by, kind)`.
- Detected album/file access enforcement in repository and archive UI:
  albums store `access`, cards show family-only indicator, and media reads use effective access resolution.
- Detected manual remote recovery of pending migrations:
  `20260326164000_person_media_avatar_crop_v1.sql`
  `20260327194500_tree_media_albums_access_v1.sql`
- Detected active remote rollout of:
  `20260328043000_tree_media_albums_media_kind_v1.sql`
- Detected album create-time access selection plus album-targeted upload inheritance of `album.access`.
- Detected repository-side idempotent album linking for archive media.
- Detected variant-aware media delivery foundation for photo previews (`thumb/small/medium`).
- Detected Cloudflare R2 foundation in env/runtime config and supporting project files.
- Latest `smoke:media` artifact `media-storage-report-1773931536758.json` is green.

## Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Effective archive media access must stay repository-owned:
  `resolveMediaAccess(...)` must delegate to `resolveEffectiveMediaAccess(...)`.
- Archive albums must keep explicit `kind`; do not infer album type from current contents.
- Uploader albums must stay virtual:
  do not narrow uploader album card/detail semantics to persisted `tree_media_album_items`.
- Archive album linking must stay idempotent:
  repository code should insert only missing `(album_id, media_id)` pairs.

