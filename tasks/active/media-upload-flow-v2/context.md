# Context

## Relevant docs

Start with `REPO_MAP.md` and use its `Required Reading Matrix` to choose the minimum task-specific docs.

Minimum docs for this task:

* PROJECT_SUMMARY.md
* REPO_MAP.md
* DATA_FLOW.md
* ARCHITECTURE_RULES.md
* SYSTEM_INVARIANTS.md
* COMMON_BUGS.md
* DECISIONS.md

## Relevant files

* components/tree/builder-workspace.tsx
* components/tree/tree-viewer-client.tsx
* components/layout/tree-nav.tsx
* app/api/media/upload-intent/route.ts
* app/api/media/upload-file/route.ts
* app/api/media/complete/route.ts
* app/api/media/[mediaId]/route.ts
* app/tree/[slug]/media/page.tsx
* components/media/tree-media-archive-client.tsx
* lib/server/repository.ts
* lib/validators/media.ts
* lib/tree/display.ts
* tests/media-storage-e2e.mjs
* app/globals.css

## Suspected area

The current task is no longer only the gallery redesign. The launch-critical area now touches:

- upload UX in builder
- local file upload batching/progress
- server-side upload orchestration
- media preview/delivery architecture for current thumbnail variants
- family archive browsing for media that is not attached to a person yet
- tree navigation and tree-level media read surface
- mandatory `Cloudflare R2` rollout for new uploads
- provider-aware reads for legacy Yandex-backed media

## Constraints

* repository owns media mutations
* media access must remain server-controlled
* share-link access must stay read-only
* current `Yandex Object Storage` path must keep working while the flow is redesigned
* `Cloudflare R2` rollout is launch-critical for `Slava edition`
* thumbnail/variant architecture should be additive and must not break existing originals
* existing person-linked media must coexist with a tree-level family archive
