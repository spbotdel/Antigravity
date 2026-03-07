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
* app/api/media/upload-intent/route.ts
* app/api/media/upload-file/route.ts
* app/api/media/complete/route.ts
* app/api/media/[mediaId]/route.ts
* lib/server/repository.ts
* lib/validators/media.ts
* lib/tree/display.ts
* tests/media-storage-e2e.mjs
* app/globals.css

## Suspected area

The current builder media panel and upload pipeline are too narrow for real archive usage.
The next change touches:

- upload UX in builder
- local file upload batching/progress
- server-side upload orchestration
- media preview/delivery architecture for future thumbnail variants

## Constraints

* repository owns media mutations
* media access must remain server-controlled
* share-link access must stay read-only
* current `Yandex Object Storage` path must keep working while the flow is redesigned
* thumbnail/variant architecture should be additive and must not break existing originals
* CDN is a later layer; variant generation should come first
