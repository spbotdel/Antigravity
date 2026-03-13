# Notes

## Investigation

User feedback after the first object-storage milestone:

- upload can fail with `spawn ENAMETOOLONG`
- single-file selection is not acceptable
- file-backed video must be uploadable from device, not only by external link
- the file flow should feel unified from a human perspective
- progress and limits must be visible in the UI

Architectural conclusion from the discussion:

- thumbnails / preview variants are no longer optional
- for this project, loading originals for tree blocks or side cards will not scale
- CDN is useful, but should follow variant generation rather than precede it
- the long-term media platform should target `Cloudflare`, not deepen the current Yandex dependency
- the product also needs a tree-level family archive for shared media that is not attached to one person yet
- that archive also needs album organization, because real family material often arrives as themed folders rather than one flat stream

## Proposed fix

Phase 0: Stabilize the current mixed batch path

- restore deterministic `smoke:media` behavior for mixed photo/video upload
- confirm that the current builder batch loop finishes reliably before larger UI restructuring
- keep the current object-storage upload/read/delete path green while the gallery redesign is introduced

Phase 0.5: Cloudflare migration plan

- keep `Supabase` as auth, database, permissions and metadata plane
- migrate the media binary plane toward `Cloudflare`
- target Cloudflare stack:
  - `R2` for new file-backed media originals and archive storage
  - keep current file-backed video playback as the default near-term path instead of forcing `Stream`
  - keep `Queues` as a later async layer after the primary upload/delivery path is stable
- keep `Yandex Object Storage` readable as a transitional source for already-uploaded files
- do not require a big-bang migration; new uploads can move first while old media stays accessible
- stop treating Next.js as the steady-state binary upload proxy
- stop keeping heavy derivative generation in the synchronous request path
- move toward:
  - browser -> Cloudflare direct upload
  - queue/background processing for variants/avatar/video post-processing
  - edge-first binary delivery on reads

Migration order:

1. Provider foundation
   - add Cloudflare env/config and provider abstraction
   - keep current repository contracts stable
2. Direct upload foundation
   - move browser uploads toward direct-to-cloud targets instead of app-proxied binary upload
   - keep the current Next.js route only as transitional compatibility while the direct path is introduced
3. New image uploads
   - move new photo/doc upload targets to `R2`
   - keep current Yandex-backed reads for existing assets
   - move derivative creation out of the request path into background jobs
4. Archive surface
   - add tree-level `Медиа` route and archive gallery for unassigned shared media
   - archive UX should use primary media modes:
     - `Фото`
     - `Видео`
   - within each mode, support:
     - `Все`
     - `Альбомы`
   - add explicit album creation
   - add auto-created uploader albums (`От <имя>`) on first upload by a given editor
5. New video uploads
   - keep existing file-backed/external video readable during migration
   - treat `Cloudflare Stream` as optional follow-up only if real playback issues make the simpler file-backed path insufficient
6. Async processing
   - move avatar extraction / derivative jobs toward queue-based processing
7. Edge delivery cleanup
   - move preview/original reads to edge-first delivery wherever possible
   - keep Next.js focused on metadata and ACL decisions
8. Cleanup
   - decide when legacy Yandex paths can stop accepting new uploads
   - define whether old assets migrate lazily on read or via an explicit batch migration
9. Last-resort video fallback
   - consider a self-managed `FFmpeg -> mp4/HLS/poster/thumbnail` pipeline only at the very end
   - introduce it only if playback compatibility or delivery quality still remains insufficient after `R2/private delivery`

Phase 1: Current flow redesign

- replace single-file upload with multi-file batch upload for photos and videos
- keep one primary device-upload flow for local files
- keep external video links as a secondary explicit option
- add visible limits copy under the upload action
- add per-file progress UI:
  - percent
  - speed
  - remaining time
- investigate and eliminate the `spawn ENAMETOOLONG` failure in the upload path

Phase 2: Card and gallery redesign

- replace the current `Человек / Связи / Медиа` card navigation with:
  - `Инфо`
  - `Фото`
  - `Видео`
- add a separate tree navigation entry `Медиа` for the family archive
- archive should be readable for every actor who can view the tree
- archive should not be only a flat list:
  - it needs `Все` / `Альбомы`
  - it needs user-created albums
  - it needs uploader albums generated automatically
- remove duplicated person-summary/info blocks from the photo/video tabs
- make photo and video tabs gallery-first rather than metadata-first
- pin bottom actions to the card footer so they stay reachable regardless of scroll
- in the photo tab:
  - primary action: `Загрузить фото`
  - secondary action: `Показать все`
- in the video tab:
  - primary action should mirror the same pattern for video upload
  - `Показать все` should expand the video gallery similarly
- full-gallery mode should take over the main builder stage area rather than staying inside the narrow inspector rail
- single-item open should use a fullscreen viewer/lightbox with left/right navigation and without visible filename/type clutter

Phase 3: Upload review UX

- selecting files in the OS dialog should not immediately finalize the batch
- after file selection, show an in-app review modal:
  - preview selected items
  - remove unwanted files
  - add more files
  - confirm save explicitly
- if the user closes the review flow without confirming upload, show a discard-warning modal so the pending selection is not lost silently

Phase 4: Avatar model

- one chosen photo becomes the canonical avatar for the person
- avatar choice is explicit and should not depend on gallery order
- avatar derivatives are then used in:
  - person-card header
  - summary cards / side rails
  - builder/viewer tree nodes

Phase 5: Preview architecture

- originals remain private
- add derived preview variants:
  - `thumb`
  - `small`
  - `medium`
- tree blocks use `thumb`
- side cards / media lists use `small` or `medium`
- originals open only on explicit full-view action

Phase 6: Delivery evolution

- add variant-aware media delivery route:
  - `/api/media/:id?variant=thumb`
  - `/api/media/:id?variant=small`
  - `/api/media/:id?variant=medium`
  - original only on explicit full request
- treat CDN as a later follow-up after variants are stable
- keep `Cloudflare R2` as the active migration target for new file-backed uploads, while rollout stays gated and additive

## Validation

Current-flow validation:

- upload multiple photos in one action
- upload multiple videos from device in one action
- upload mixed batches from desktop/mobile
- progress UI updates during upload
- limits copy is visible near the upload button
- external video link flow still works
- object storage backend still passes focused regression

Latest confirmation pass (`2026-03-11`):

- `npm run typecheck` passed
- `npm test -- tests/person-media-gallery.test.tsx tests/tree-viewer-client.test.tsx tests/builder-workspace.test.tsx` passed
- `npm run smoke:media` passed
- latest proxy artifact: `tests/artifacts/media-storage-report-1773245458462.json`
- `smoke:media` now also validates upload-intent rollout metadata:
  - `configuredBackend`
  - `resolvedUploadBackend`
  - `rolloutState`
  - `forceProxyUpload`
  - `uploadMode`
- `smoke:media` now follows the rebuilt builder UX:
  - `Фото / Видео` tabs instead of legacy `Медиа`
  - review modal with `К полям` and explicit `Сохранить`
  - pre-run cleanup for stale smoke media rows
- `npm run smoke:media:direct` passed
- latest direct artifact: `tests/artifacts/media-storage-report-1773231135100.json`
- direct smoke reuses the current `http://localhost:3000` dev server so browser direct uploads originate from an R2 CORS-allowed local origin
- builder person-media now also confirms:
  - `Инфо / Фото / Видео` tab split
  - document management stays in `Инфо`
  - `Показать все` expands photo gallery into the main builder stage
- variant semantics are now explicitly covered in focused tests for:
  - `PersonMediaGallery` stage/thumb/fullscreen preview routes
  - archive tile and album cover preview routes
  - builder photo card preview route
- focused component coverage now verifies the forced-proxy Cloudflare hint in:
  - `tests/builder-workspace.test.tsx`
  - `tests/tree-media-archive-client.test.tsx`
- focused transport coverage now verifies the client-side direct upload path in:
  - `tests/upload-transport-contract.test.ts`
  - direct original upload to signed URL
  - variant proxy follow-up only when `variantUploadMode=server_proxy`
- targeted fallback coverage now verifies legacy photo behavior in:
  - `tests/tree-viewer-client.test.tsx`
  - `tests/person-media-gallery.test.tsx`
  - `tests/tree-media-archive-client.test.tsx`
- `PersonMediaGallery` now exposes:
  - stable gallery-level `Показать все`
  - footer summary by default
  - safe empty-state handling when avatar selection is available but media array is empty
- Initial manual/mobile QA is now in progress with concrete fixes already landed:
  - viewer mobile thumb strip now uses a horizontal rail instead of a long vertical grid
  - archive mobile album view no longer shows duplicated `Назад к альбомам`
  - builder mobile canvas height is reduced so the inspector is reachable earlier
  - empty photo/video galleries in builder now expose immediate `Выбрать фото / Выбрать видео` actions
  - `smoke:media` delete verification now tolerates slow cleanup propagation instead of failing on a false red

Future preview validation:

- tree blocks never load originals
- side cards use preview variants
- original opens only on explicit action
- variant route respects existing access checks

New card/gallery validation:

- photo tab opens as a visual grid, not a metadata card list
- video tab follows the same structural rules as photos
- tree-level archive exists separately from person-linked galleries
- archive supports `Все` and `Альбомы` modes
- event batches like birthdays and weddings can be represented as albums
- uploader albums such as `От Вячеслава` or `От Виктора Петровича` appear automatically after their first upload
- sticky bottom actions remain visible while scrolling the gallery tab
- `Показать все` expands the gallery into the builder stage area
- fullscreen viewer supports left/right navigation
- upload review modal preserves the pending selection until explicit save or explicit discard
- avatar selection updates the header avatar and tree avatar flow consistently
- drag-and-drop bulk upload is a later enhancement after the main archive/gallery upload-review flow is stable

## Resolved product rule

- tree-level family archive upload/edit/delete is allowed for any actor with tree edit rights
- archive reads stay available to every actor who can view the tree
- audit log must show who uploaded or deleted archive files

## Adjacent QA progress

- `Участники` flow now has focused coverage for:
  - page-level access redirects in `tests/members-page.test.tsx`
  - invite revoke and reissue
  - share-link create/list/revoke routes
  - clipboard success and clipboard failure in the member management panel
  - revoked share-link reissue without duplicate revoke
  - fresh share-link clipboard copy
- main `smoke:e2e` now exercises:
  - invite creation through the page form
  - invite link clipboard copy
  - share-link creation through the page form
  - share-link clipboard copy
  - share-link revoke through the page card action
- tree-level `Медиа` page now has focused coverage for:
  - owner/editor render and summary counts in `tests/media-page.test.tsx`
  - share-link readable access without edit affordances
- builder flow now has focused coverage for:
  - page-level editor/share-link access in `tests/builder-page.test.tsx`
  - canvas resize persistence and min/max clamping in `tests/builder-workspace.test.tsx`
- remaining tree subpages now have focused coverage for:
  - settings page owner/share-link access in `tests/settings-page.test.tsx`
  - audit page owner/share-link access in `tests/audit-page.test.tsx`

## Result

Current stream is no longer the initial builder/gallery rebuild.

What is now done:

- builder person card uses `Инфо / Фото / Видео`
- person-media upload mirrors archive review flow with add-more and discard guard
- photo/video galleries have sticky actions and can take over the main builder stage
- person gallery and tree archive now share the same broad viewing pattern: fullscreen viewer, stable `Показать все`, and gallery-level footer summary
- `smoke:media` and `smoke:media:direct` are green again after the UI rewrite

Next implementation stream:

- finish the remaining manual/mobile QA pass from real screenshots
- then move into explicit Cloudflare migration sequencing:
  - gated config verification
  - direct-upload validation
  - activation checklist
  - post-activation stabilization rules

## Session Log — 2026-03-12

### What was completed in this session

- Fixed framework drift so `completion` now auto-syncs:
  - `.claude/*`
  - operational docs
  - main `Slava edition` plan docs
- Updated startup/operational/plan memory to treat `Cloudflare R2` rollout as mandatory for `Slava edition`.
- Switched server-side Supabase auth/session clients to `createServerSupabaseFetch()`:
  - `lib/supabase/server.ts`
  - `lib/supabase/route.ts`
  - `lib/supabase/middleware.ts`
- Added regression coverage for server-side Supabase client wiring in:
  - `tests/supabase-client-wiring.test.ts`
- Made post-auth navigation more reliable with full-page redirects in:
  - `components/auth/login-form.tsx`
  - `components/auth/invite-acceptance-card.tsx`
- Removed eager session refresh from `proxy.ts`, so middleware is no longer the main request-time bottleneck.
- Reduced some repository access latency by parallelizing independent tree/user access reads in `lib/server/repository.ts`.
- Moved invite/share-link audit writes to best-effort async logging instead of blocking route completion.
- Reworked `components/members/member-management-panel.tsx` to update local state after invite/share-link/member mutations instead of forcing a full `router.refresh()` after every action.
- Tightened `tests/smoke-e2e.mjs` so it:
  - uses more robust auth/invite helpers
  - avoids some unnecessary page reloads in members flow
  - tolerates noisy JSON better

### What was verified

- `npm run typecheck` passed after the code changes.
- Focused tests passed for:
  - server auth
  - server fetch
  - Supabase server client wiring
  - invite/share-link routes
  - member management panel
- `npm run smoke:auth` is green after the auth/runtime fixes.

### Current blocker after this session

- `npm run smoke:e2e` is still not green.
- The main blocker is no longer eager middleware/session refresh.
- The remaining bottleneck is heavy route/render latency in the isolated smoke runtime, especially around:
  - `GET /api/dashboard`
  - `GET /tree/[slug]/builder`
  - `GET /tree/[slug]/members`
  - `POST /api/invites/accept`
  - `POST /api/share-links`
- In the latest runs, broad smoke gets much further than before, but still times out because these routes remain too slow under the isolated environment.

## Next Steps

1. Profile and reduce the latency of `GET /api/dashboard`.
2. Profile and reduce the latency of `GET /tree/[slug]/builder`.
3. Profile and reduce the latency of `GET /tree/[slug]/members`.
4. Profile and reduce the latency of `POST /api/invites/accept`.
5. Profile and reduce the latency of `POST /api/share-links`.
6. Re-run `npm run smoke:e2e` after each concrete performance fix, not only at the end.
