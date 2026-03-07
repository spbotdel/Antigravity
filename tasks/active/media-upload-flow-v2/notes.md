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

## Proposed fix

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

Phase 2: Preview architecture

- originals remain private
- add derived preview variants:
  - `thumb`
  - `small`
  - `medium`
- tree blocks use `thumb`
- side cards / media lists use `small` or `medium`
- originals open only on explicit full-view action

Phase 3: Delivery evolution

- add variant-aware media delivery route:
  - `/api/media/:id?variant=thumb`
  - `/api/media/:id?variant=small`
  - `/api/media/:id?variant=medium`
  - original only on explicit full request
- treat CDN as a later follow-up after variants are stable
- evaluate `Cloudflare R2` only as a separate exploratory stream

## Validation

Current-flow validation:

- upload multiple photos in one action
- upload multiple videos from device in one action
- upload mixed batches from desktop/mobile
- progress UI updates during upload
- limits copy is visible near the upload button
- external video link flow still works
- object storage backend still passes focused regression

Future preview validation:

- tree blocks never load originals
- side cards use preview variants
- original opens only on explicit action
- variant route respects existing access checks

## Result

Plan saved as the active task capsule.

This task should be the next implementation stream.
