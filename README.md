# Antigravity

Antigravity is now a `Next.js + TypeScript + Supabase` family tree platform.

For project navigation and reading order, start with [REPO_MAP.md](./REPO_MAP.md).

## What is in this repo

The active app supports:

- owner, admin, viewer, and anonymous access modes
- one family tree per owner in v1
- public and private tree visibility
- secure invite links
- family share links for read-only viewing
- private file media with signed delivery
- S3-compatible object storage for private media, with transitional legacy compatibility verified on `Yandex Object Storage`
- file-backed video and external video-link flows
- owner-only audit log

The old static genealogy viewer is preserved in [`legacy/`](./legacy).

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage / S3-compatible Object Storage`
- `Vitest`

## Main app structure

- `app/` - App Router pages and API routes
- `components/` - UI and client-side workspaces
- `lib/` - auth, permissions, validators, object-storage/Supabase clients, server repository
- `supabase/migrations/` - schema, constraints, RLS, storage bucket bootstrap
- `supabase/seed.sql` - optional local seed data
- `legacy/` - preserved static HTML/CSS/JS viewer

## Project documentation

The repository uses a small documentation hierarchy:

- canonical navigation entrypoint: [REPO_MAP.md](./REPO_MAP.md)
- core project understanding: [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md), [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md), [DECISIONS.md](./DECISIONS.md)
- operational memory: [`.claude/SNAPSHOT.md`](./.claude/SNAPSHOT.md), [`.claude/BACKLOG.md`](./.claude/BACKLOG.md)
- domain details when relevant: [TREE_MODEL.md](./TREE_MODEL.md), [TREE_ALGORITHMS.md](./TREE_ALGORITHMS.md), [DATA_FLOW.md](./DATA_FLOW.md), [SYSTEM_INVARIANTS.md](./SYSTEM_INVARIANTS.md)
- framework/internal tooling docs: [AGENTS.md](./AGENTS.md), [CLAUDE.md](./CLAUDE.md), [FRAMEWORK_GUIDE.md](./FRAMEWORK_GUIDE.md)

The runtime startup-context list for Codex is defined in [`.codex/config/framework-adapter.json`](./.codex/config/framework-adapter.json).

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill values:

```bash
cp .env.example .env.local
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVER_REQUEST_TIMEOUT_MS` optional, defaults to `15000`
- `SUPABASE_ADMIN_REST_TRANSPORT` optional, defaults to `auto`
- `SUPABASE_ADMIN_REST_TRANSPORT=auto` uses native Node fetch first and falls back to PowerShell only on transport-level failures
- `SUPABASE_ADMIN_REST_TRANSPORT=native` disables the PowerShell fallback and forces native fetch only
- `SUPABASE_ADMIN_REST_TRANSPORT=powershell` forces the legacy PowerShell bridge for debugging or environment isolation
- `NEXT_PUBLIC_SITE_URL`
- `MEDIA_STORAGE_BACKEND` optional, defaults to `supabase`
- `NEXT_PUBLIC_STORAGE_BUCKET` optional for Supabase Storage, defaults to `tree-photos`
- `OBJECT_STORAGE_BUCKET` required when `MEDIA_STORAGE_BACKEND=object_storage`
- `OBJECT_STORAGE_ENDPOINT` optional, defaults to `https://storage.yandexcloud.net`
- `OBJECT_STORAGE_REGION` optional, defaults to `ru-central1`
- `OBJECT_STORAGE_ACCESS_KEY_ID` required for object storage
- `OBJECT_STORAGE_SECRET_ACCESS_KEY` required for object storage
- `CF_ACCOUNT_ID` required when `MEDIA_STORAGE_BACKEND=cloudflare_r2`
- `CF_R2_BUCKET` required when `MEDIA_STORAGE_BACKEND=cloudflare_r2`
- `CF_R2_ACCESS_KEY_ID` required when `MEDIA_STORAGE_BACKEND=cloudflare_r2`
- `CF_R2_SECRET_ACCESS_KEY` required when `MEDIA_STORAGE_BACKEND=cloudflare_r2`
- `CF_R2_ENDPOINT` optional for Cloudflare R2, defaults to `https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `CF_R2_REGION` optional, defaults to `auto`
- `CF_R2_ROLLOUT_AT` optional UTC timestamp for migration gating; before this moment new uploads remain on the legacy object-storage path even if `MEDIA_STORAGE_BACKEND=cloudflare_r2`

Current transitional compatibility path:

- `MEDIA_STORAGE_BACKEND=object_storage`
- `OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- `OBJECT_STORAGE_REGION=ru-central1`
- backend validated with `Yandex Object Storage`
- keep this path readable for already-uploaded assets during rollout, but do not treat it as the final launch upload path

Mandatory `Slava edition` Cloudflare rollout path:

- `MEDIA_STORAGE_BACKEND=cloudflare_r2`
- `CF_R2_BUCKET=<bucket>`
- `CF_R2_ENDPOINT=https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `CF_R2_ROLLOUT_AT=2026-03-15T00:00:00Z` optional when migration should begin at a controlled time instead of immediately
- browser direct-upload rollout requires bucket CORS configuration

For the current project plan, `Cloudflare R2` rollout is part of the `Slava edition` definition of done. Launch should not be called complete while new uploads still depend on the legacy Yandex path.

Mandatory rollout sequence for `Slava edition`:

1. Configure `MEDIA_STORAGE_BACKEND=cloudflare_r2` together with valid `CF_R2_*` credentials, but keep `CF_R2_ROLLOUT_AT` in the future.
2. Verify the pre-rollout state:
   - upload-intent says `configuredBackend=cloudflare_r2`
   - `resolvedUploadBackend=object_storage`
   - `rolloutState=cloudflare_rollout_gated`
   - existing media reads still work
3. Enable bucket CORS and validate browser direct-upload prerequisites before changing rollout time.
4. Run both smoke paths before activation:
   - `npm run smoke:media`
   - `npm run smoke:media:direct`
5. Move `CF_R2_ROLLOUT_AT` to the current UTC time or remove it only after both smoke paths are green.
6. Verify the active rollout state:
   - upload-intent says `resolvedUploadBackend=cloudflare_r2`
   - `rolloutState=cloudflare_rollout_active`
   - photo uploads still produce preview variants
   - file-backed video still reads correctly
7. Keep old Yandex-backed media readable through provider-aware reads; migration remains additive instead of big-bang.
8. Treat release readiness as blocked until:
   - targeted archive/viewer/builder/members QA is green
   - live `EU + RF` UAT is complete
   - backup/restore rehearsal is complete

Controlled rollout checklist:

- Phase 1. Config readiness
  - `CF_ACCOUNT_ID`, `CF_R2_BUCKET`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, and `CF_R2_ENDPOINT` resolve correctly
  - `MEDIA_STORAGE_BACKEND=cloudflare_r2`
  - `CF_R2_ROLLOUT_AT` is still in the future
- Phase 2. Gated verification
  - `npm run smoke:media` stays green on the legacy upload path
  - `npm run smoke:media:direct` stays green against the direct browser path from the allowed local origin
  - upload-intent metadata matches the gated path, so rollout status is observable without guesswork
- Phase 3. Activation
  - move `CF_R2_ROLLOUT_AT` to now
  - confirm new uploads switch to `cloudflare_r2`
  - confirm legacy reads still resolve
- Phase 4. Post-activation stabilization
  - keep `Cloudflare Stream` deferred unless playback problems are proven
  - keep `Queues` as the next async-processing boundary after the core upload/read path is stable
  - keep a self-managed `FFmpeg/HLS` fallback out of scope unless `R2/private delivery` is still insufficient
- Phase 5. Launch hardening
  - targeted archive/viewer/builder/members QA is green
  - live `EU + RF` UAT is complete
  - backup/restore rehearsal and launch checklist are complete

Current transition detail:

- for new Cloudflare-backed uploads, the original binary may already go browser -> R2 directly
- photo preview variants (`thumb/small/medium`) can still be generated through the app route during the transition
- this keeps the migration additive while preserving the current variant pipeline
- upload-intent responses expose `configuredBackend`, `resolvedUploadBackend`, `rolloutState`, and `forceProxyUpload` so rollout debugging does not depend on guessing from env alone
- file-backed private video playback remains the default near-term path; `Cloudflare Stream` is deferred unless real playback problems justify the extra service
- a self-managed `FFmpeg -> mp4/HLS/poster/thumbnail` pipeline is also deferred to the very end and should be introduced only if playback compatibility or delivery quality is still insufficient after `R2/private delivery`
- `npm run smoke:media:direct` reuses the current `http://localhost:3000` dev server so browser direct uploads originate from an R2 CORS-allowed local origin

Current validation baseline as of `2026-03-12`:

- `npm run typecheck` is green
- `npm test` is green
- `npm run build` is green
- `npm run smoke:e2e` is green
- `npm run smoke:media` is green
- `npm run smoke:media:direct` is green
- `smoke:auth` core flow is green, but cleanup remains sensitive to intermittent network timeouts

3. Apply the current SQL migrations in `supabase/migrations/` to your Supabase project.

### Windows note

Project helper commands under `.codex/commands/*.sh` expect a real Bash runtime.

If `bash` on Windows resolves to the WSL stub and no WSL distro is installed, use Git Bash instead of assuming `start` is broken.

For the current media/object-storage path this includes at least:

- [`supabase/migrations/20260301193000_family_tree_v1.sql`](./supabase/migrations/20260301193000_family_tree_v1.sql)
- [`supabase/migrations/20260306173000_unified_media_v1.sql`](./supabase/migrations/20260306173000_unified_media_v1.sql)
- [`supabase/migrations/20260306173100_unified_media_constraints_v1.sql`](./supabase/migrations/20260306173100_unified_media_constraints_v1.sql)
- [`supabase/migrations/20260307111500_object_storage_provider_v1.sql`](./supabase/migrations/20260307111500_object_storage_provider_v1.sql)
- [`supabase/migrations/20260307111600_object_storage_provider_constraints_v1.sql`](./supabase/migrations/20260307111600_object_storage_provider_constraints_v1.sql)

4. Optionally run [`supabase/seed.sql`](./supabase/seed.sql) after at least one auth user exists.

5. Start the app:

```bash
npm run dev
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm test`
- `npm run smoke:media`
- `npm run smoke:media:direct`

## Product routes

- `/` - landing page
- `/auth/login`
- `/auth/register`
- `/auth/accept-invite`
- `/dashboard`
- `/tree/[slug]`
- `/tree/[slug]/builder`
- `/tree/[slug]/members`
- `/tree/[slug]/settings`
- `/tree/[slug]/audit`

## Important v1 constraints

- only one tree per owner
- no GEDCOM import/export
- media storage is sized for a small private family archive, not for terabyte-scale workloads
- no realtime collaborative editing
- no ownership transfer

## Verification status

Implemented and verified locally:

- `npm run typecheck`
- `npm test`
- `npm run smoke:media`
- `npm run smoke:media:direct`
- `npm run build`
