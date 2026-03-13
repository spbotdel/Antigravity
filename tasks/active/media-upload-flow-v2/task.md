# Task

## Title

Media Upload Flow V2

## Problem

Current media upload behavior is not acceptable for a real family archive workflow.

Observed problems:

- photo upload can fail with `spawn ENAMETOOLONG`
- only one file can be selected at a time
- video upload from device is not supported in the main file flow
- the current split between file upload and external video link is not user-centric
- there is no visible upload progress, speed, or remaining-time feedback
- there is no explicit limits copy near the upload action
- current preview architecture still needs a dedicated thumbnail/variant plan for heavy family archives
- the person card media tab is still shaped like a technical admin panel rather than a human gallery workflow
- photo and video flows are not yet organized into separate gallery-first tabs
- the card does not yet have pinned bottom actions for quick upload and full-gallery mode
- selecting files still jumps too quickly from OS picker to upload instead of giving a review/confirm step
- avatar selection is not yet modeled as a deliberate choice separate from ordinary gallery order
- the current mixed-batch upload path still needs stabilization under focused regression before the larger gallery redesign proceeds
- the product still lacks a tree-level family archive for shared media that is not attached to one specific person
- the family archive still lacks album organization for real-world themed folders and family event batches
- the medium-term media stack still points at a transitional Yandex path instead of the target Cloudflare architecture

## Expected Behavior

The user should be able to:

- upload both photos and videos from desktop or mobile device through one clear file flow
- select and upload multiple files in one action
- keep external video links as a secondary optional path, not the main video path
- see per-upload progress with percentage, speed, and remaining time
- see limits and constraints near the upload action
- rely on a media architecture where previews do not load full originals by default
- support a separate tree-level `Медиа` section for family-wide archive items
- keep this archive readable for all actors who can view the tree
- allow archive upload/edit/delete for any actor with tree edit rights
- record archive uploads and deletions in the audit log with the acting user
- support archive browsing through:
  - `Фото` / `Видео`
  - `Все` / `Альбомы`
- support both:
  - manually created albums
  - automatically created uploader albums like `От Виктора Петровича`
- use a person card with three top-level tabs:
  - `Инфо`
  - `Фото`
  - `Видео`
- browse photos and videos as gallery grids first, not as metadata cards
- use sticky bottom actions in gallery tabs:
  - primary upload action
  - `Показать все`
- expand the gallery into the main builder stage area when full-gallery mode is opened
- open one photo/video into a fullscreen viewer with left/right navigation
- review a selected upload batch before final save:
  - remove items from the pending batch
  - add more items
  - confirm save explicitly
- see a confirmation guard when closing an unsubmitted upload batch
- choose one dedicated avatar photo for the person, which then drives:
  - the header avatar in the person card
  - the medium avatar in person panels
  - the small avatar in the tree canvas

## Current UI Plan

Phase 0 — Stabilization

- stabilize the current mixed photo/video batch upload path in builder
- make `smoke:media` deterministic again before deeper gallery workflow changes
- keep current object-storage photo/video delivery green while the UI is being restructured

Phase 0.5 — Cloudflare migration foundation

- adopt `Cloudflare` as the target media delivery architecture:
  - `R2` for new file-backed media storage
- keep current file-backed video playback as the default near-term path instead of making `Stream` mandatory
- keep `Queues` as a later async-jobs boundary, not the first migration step
- keep `Supabase` as auth/database/metadata plane
- keep the existing `Yandex Object Storage` path as transitional compatibility only
- introduce provider-aware migration steps so existing media remains readable during the transition
- remove the current dependence on Next.js binary proxying as the steady-state upload model
- move variant/avatar/video post-processing out of the request path into async jobs
- treat the Next.js app as metadata/ACL/orchestration plane rather than the long-term binary transport layer
- keep a self-managed `FFmpeg -> mp4/HLS/poster/thumbnail` pipeline as a last-resort fallback only if real playback problems remain after the simpler `R2/private delivery` path is validated

Phase A — Family archive surface

- add a tree-level navigation entry named `Медиа`
- create a family archive surface for photos/videos that are not attached to one person
- make the archive visible to every actor who can view the tree
- allow upload/edit/delete for any actor with tree edit rights
- ensure audit entries show who uploaded or deleted archive files
- design archive browsing using the same gallery language as person-card media
- split archive browsing into:
  - `Фото`
  - `Видео`
- inside each mode, support:
  - `Все`
  - `Альбомы`
- model incoming folder-like family batches as albums rather than filesystem folders
- create uploader albums automatically on first upload by a given editor
- allow explicit album creation for event/group archives like birthdays and weddings

Phase B — Card structure

- replace `Человек / Связи / Медиа` with `Инфо / Фото / Видео`
- remove duplicated person-summary content from photo/video tabs
- keep action buttons pinned to the bottom edge of the card in gallery tabs

Phase C — Gallery mode

- make photo and video tabs thumbnail-first grids
- move the expanded gallery into the builder stage area on `Показать все`
- keep file names, media kind labels and technical metadata out of the grid unless explicitly needed

Phase D — Viewer mode

- open a fullscreen lightbox/viewer for one selected photo or video
- support left/right navigation across the current tab collection
- keep comments/social actions out of scope for this product

Phase E — Upload review flow

- OS file picker selects multiple files
- app shows a review modal before upload starts
- user can remove individual files, add more files, or confirm save
- closing the review modal with pending files must show a discard-confirmation dialog

Phase F — Avatar model

- add explicit `avatar` selection from photo gallery
- use avatar derivatives for:
  - person header
  - inspector/card summaries
  - tree canvas node badges

## Current Progress Snapshot

- [x] Tree-level archive route, albums, sticky actions, and large viewer/lightbox are in place.
- [x] Builder person card now uses `Инфо / Фото / Видео`.
- [x] Builder photo/video upload now uses review flow with pending batch, add-more, and discard confirmation.
- [x] Builder photo/video galleries expose `Показать все` and can expand into the main stage area.
- [x] Person gallery now has a stable gallery-level fullscreen entrypoint and footer summary.
- [x] Variant-aware photo preview delivery is in place and green in smoke.
- [x] Key UI surfaces now have explicit preview-variant coverage:
  - person gallery uses `thumb/small/medium`
  - builder photo cards use preview variants by default
  - archive tiles and album covers use preview variants by default
- [x] `smoke:media` and `smoke:media:direct` are green after the builder/gallery rewrite.

## Remaining Focus

- [ ] Visual and behavioral polish between person gallery and tree archive.
- [ ] Archive album/mobile QA and calmer empty states.
- [ ] Broader QA for builder/viewer/members after the current media UI pass.
- [ ] Mandatory `Cloudflare R2` rollout for `Slava edition`:
  - gated config verification
  - direct-upload validation
  - rollout activation
  - post-activation stabilization
  - legacy Yandex-backed read verification
- [ ] Isolated broad smoke is still too slow for a reliable launch gate:
  - profile `GET /api/dashboard`
  - profile `GET /tree/[slug]/builder`
  - profile `GET /tree/[slug]/members`
  - profile `POST /api/invites/accept`
  - profile `POST /api/share-links`

## Current Execution Order From Repo State

1. Keep startup memory, README, and operational docs aligned with the launch rule that `Cloudflare R2` rollout is mandatory.
2. Verify gated rollout readiness:
   - `CF_R2_*`
   - bucket CORS
   - upload-intent metadata
   - `smoke:media`
   - `smoke:media:direct`
3. Activate rollout and confirm `resolvedUploadBackend=cloudflare_r2`.
4. Re-run targeted QA for archive/viewer/builder/members and close remaining media/archive regressions.
5. Bring `smoke:e2e` back to a realistic launch-gate state by reducing isolated runtime latency on dashboard/tree/member/access flows.
6. Run live `EU + RF` UAT.
7. Execute backup/restore rehearsal and final launch checklist.

## Status

in_progress

## Priority

high
