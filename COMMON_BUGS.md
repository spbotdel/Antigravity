# COMMON_BUGS

## Purpose

This document lists recurring bugs and failure patterns in the current `Antigravity` project.

It is not a changelog.

It is a practical debugging guide for:

- product bugs
- migration drift
- development runtime noise
- test flakiness
- network or tooling failures that appear to be product issues

The goal is to diagnose problems correctly **before modifying production code**.

The repository code remains the source of truth.

---

# Bug Categories

Most issues in Antigravity fall into one of the following categories:

1. **Migration drift**  
   Local code expects database schema that is not yet applied remotely.

2. **Builder state bugs**  
   Optimistic state or selection handling problems in the builder.

3. **Snapshot mismatch**  
   Database state exists but snapshot loading or filtering hides it.

4. **Permission filtering**  
   Data exists but is filtered by access logic.

5. **Dev/runtime noise**  
   Hydration errors, network failures, CLI issues, or hot reload inconsistencies.

Correctly identifying the category prevents unnecessary code changes.

---

# Quick Debug Order

When diagnosing a product issue, check in this order:

1. Migration state
2. Snapshot data
3. Repository query logic
4. Permission filtering
5. Display/rendering projection
6. Canvas layout

Avoid starting with UI changes before verifying data and snapshot state.

---

# How To Use This File

When something breaks:

1. Find the closest matching symptom below.
2. Check the likely cause.
3. Run the suggested "first checks".
4. Only then change production code.

Misclassifying the problem is one of the easiest ways to introduce new bugs.

---

# 1. Missing Table In Supabase Schema Cache

### Symptom

Errors such as:

- `Could not find the table 'public.tree_share_links' in the schema cache`
- missing table or column in REST responses

### Likely Cause

Remote Supabase migrations are behind local code expectations.

### First Checks

1. Compare local migration files in `supabase/migrations/*` with the remote project schema.
2. Verify whether the feature depends on a newly added table or column.
3. Confirm that the migration was applied to the remote database.

### Typical Fix

Apply the missing migration remotely before modifying application logic.

### Relevant Files

- `supabase/migrations/*`
- `lib/server/repository.ts`

---

# 2. Enum Migration Fails On Remote Database

### Symptom

Migration errors such as:

- `unsafe use of new value ... of enum type`

### Likely Cause

A migration adds a new enum value and immediately uses it in the same transaction.

### First Checks

1. Look for `ALTER TYPE ... ADD VALUE`.
2. Check whether the same migration also modifies constraints referencing the new value.

### Typical Fix

Split the migration into two steps:

1. enum expansion
2. later constraint update

### Relevant Files

- `supabase/migrations/20260306173000_unified_media_v1.sql`
- `supabase/migrations/20260306173100_unified_media_constraints_v1.sql`

---

# 3. Audit Log Shows Exactly 1000 Events

### Symptom

Audit UI shows:

- `Всего событий 1000`
- history appears capped at exactly `1000`

### Likely Cause

Historically caused by REST row limits rather than the true audit count.

### First Checks

1. Verify whether UI uses `entries.length` instead of a real total.
2. Check pagination and `count` behavior in the audit loader.
3. Inspect `supabase/config.toml` for `max_rows`.

### Typical Fix

Use:

- paginated audit queries
- `count=exact`
- accurate UI totals

### Relevant Files

- `app/tree/[slug]/audit/page.tsx`
- `components/audit/audit-log-table.tsx`
- `lib/server/repository.ts`
- `lib/supabase/admin-rest.ts`
- `supabase/config.toml`

---

# 4. Builder/Viewer Hydration Mismatch

### Symptom

Errors such as:

- `Hydration failed because the server rendered HTML didn't match the client`
- header mismatch between server and client

### Likely Cause

Server and client markup diverge in the application shell.

Typical sources:

- auth-aware header
- async layout behavior
- dev impersonation state

### First Checks

1. Inspect `app/layout.tsx`.
2. Inspect `components/layout/app-header.tsx`.
3. Compare server HTML and client output.
4. Restart the dev server before assuming a product bug.

### Typical Fix

Ensure the application shell renders deterministically in SSR and CSR.

### Relevant Files

- `app/layout.tsx`
- `components/layout/app-header.tsx`
- `components/auth/sign-out-button.tsx`

---

# 5. Builder Form Shows Deleted Person Data

### Symptom

After deleting a selected person:

- summary updates
- form fields still display stale data

### Likely Cause

Edit form did not remount when `selectedPerson` changed.

### First Checks

1. Inspect keyed forms in builder inspector.
2. Verify selection change after deletion.

### Typical Fix

Use stable React keys so the form remounts when the selected person changes.

### Relevant Files

- `components/tree/builder-workspace.tsx`

---

# 6. Builder Regression Tests Fail Even Though UI Looks Correct

### Symptom

Regression scripts report failure even though:

- creation succeeded
- deletion succeeded
- tree appears correct

### Likely Cause

Often caused by:

- timing-sensitive snapshot checks
- stale dev runtime state
- leftover data from interrupted test runs

### First Checks

1. Inspect snapshot data for leftover scenario prefixes.
2. Restart dev server.
3. Verify test expectations match actual scenario behavior.

### Typical Fix

Clean the fixture tree and rerun tests.

If necessary, relax strict count assumptions in regression tests.

### Relevant Files

- `tests/builder-left-branches-e2e.mjs`
- `tests/builder-stress-e2e.mjs`
- `components/tree/builder-workspace.tsx`

---

# 7. Share Links Feature Loads Empty Or Fails Softly

### Symptom

Members page loads but:

- share link list is empty
- create/revoke fails silently

### Likely Cause

Feature intentionally degrades when `tree_share_links` table does not exist remotely.

### First Checks

1. Confirm whether the remote table exists.
2. Inspect repository fallback logic.

### Typical Fix

Apply the missing migration remotely.

### Relevant Files

- `lib/server/repository.ts`
- `app/api/share-links/*`
- `components/members/member-management-panel.tsx`

---

# 8. Smoke E2E Fails On Supabase Auth Admin Calls

### Symptom

Smoke tests fail on:

- `auth.admin.createUser`
- `ConnectTimeoutError`
- `fetch failed`

### Likely Cause

Often a Node/network transport issue to Supabase rather than product logic.

### First Checks

1. Compare shell HTTP reachability vs Node fetch.
2. Confirm `.env.local` keys are correct.
3. Verify that tests use `SUPABASE_SERVICE_ROLE_KEY`.

### Typical Fix

Treat as environment or network issue unless proven otherwise.

### Relevant Files

- `tests/smoke-e2e.mjs`
- `tests/auth-smoke-e2e.mjs`
- `.env.local`

---

# 9. Supabase CLI Login Or Migration Commands Fail

### Symptom

CLI errors such as:

- `context deadline exceeded`
- `lookup api.supabase.com`
- `Access token not provided`

### Likely Cause

CLI authentication or DNS/network issues.

### First Checks

1. Confirm `npx supabase login` succeeded.
2. Use `--dns-resolver https` if DNS is unstable.
3. Confirm correct use of personal access tokens.

### Typical Fix

Use a valid `sbp_...` personal access token or apply migrations via Supabase SQL editor.

### Relevant Files

- `supabase/.temp/project-ref`
- `supabase/migrations/*`

---

# 10. Server-Side Supabase Reads Are Slow Or Highly Jittery

### Symptom

Pages or API routes intermittently jump between:

- normal `4s-7s` responses
- much slower `20s+` responses
- occasional transport-style failures such as `fetch failed`, `ConnectTimeoutError`, or `SUPABASE_UNAVAILABLE`

### Likely Cause

Often caused by transport instability between the local Windows runtime and Supabase, not by the product logic itself.

Important current rule:

- `lib/supabase/admin-rest.ts` is `native-first`
- `scripts/supabase-http.ps1` is fallback-only, not the intended steady-state path

### First Checks

1. Confirm whether the issue affects many pages at once, not just one route.
2. Inspect `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` before changing repository logic.
3. Check whether `SUPABASE_ADMIN_REST_TRANSPORT` was forced to `powershell`.
4. Compare warm-route behavior with repeated requests before assuming a domain bug.

### Typical Fix

Do not revert to `PowerShell-only` transport by default.

Instead:

- keep `native-first` transport
- use PowerShell only as fallback or temporary debugging override
- optimize repository/page loaders only after transport behavior is understood

### Relevant Files

- `lib/supabase/admin-rest.ts`
- `lib/supabase/server-fetch.ts`
- `scripts/supabase-http.ps1`
- `.env.example`
- `README.md`

---

# 11. Git Push Fails Even Though Local Commit Works

### Symptom

Errors such as:

- `Could not resolve host: github.com`

### Likely Cause

Network or DNS issues to GitHub.

### First Checks

1. Confirm the commit exists locally.
2. Verify network connectivity.

### Typical Fix

Retry push later from a working network environment.

---

# 12. Dev Impersonation Hides Real Auth Problems

### Symptom

Pages work locally but fail in real auth scenarios.

### Likely Cause

`DEV_IMPERSONATE_USER_ID` bypasses normal authentication.

### First Checks

1. Inspect `.env.local`.
2. Inspect `lib/server/auth.ts`.
3. Confirm whether the current flow uses impersonation.

### Typical Fix

Do not diagnose production auth behavior through impersonated sessions.

---

# 13. Legacy Media Behavior Conflicts With Unified Media Model

### Symptom

Mixed behavior such as:

- file-backed media
- external video URLs
- `410` responses on old media routes

### Likely Cause

Transition from legacy external video handling to unified private media model.

### First Checks

1. Check whether media record uses `storage_path` or `external_url`.
2. Inspect repository media logic.
3. Verify migration state.

### Typical Fix

Treat `external_url` as legacy compatibility only.

### Relevant Files

- `lib/server/repository.ts`
- `lib/validators/media.ts`
- `app/api/media/*`
- `components/tree/builder-workspace.tsx`
- `components/tree/tree-viewer-client.tsx`

---

# 14. Test Tree Is Dirty From Previous Runs

### Symptom

Regression scenarios behave inconsistently:

- unexpected person counts
- duplicate prefixed names
- incorrect navigation

### Likely Cause

Interrupted test runs left synthetic data in the fixture tree.

### First Checks

Inspect snapshot data for prefixes such as:

- `LB`
- `LeftBranch-`
- stress-test markers

### Typical Fix

Clean the fixture tree before rerunning regression scenarios.

---

# 15. Page Fails After Code Change But Logic Appears Correct

### Symptom

A page fails immediately after a refactor, but route data appears correct.

### Likely Cause

Often caused by:

- stale dev server state
- hot reload inconsistencies
- cached client state

### First Checks

1. Hard refresh the page.
2. Restart `next dev`.
3. Re-run `npm run typecheck`.

### Typical Fix

Reset the local runtime environment before modifying logic.

---

# 16. Tree Page Is Slow Because It Uses Full Snapshot By Habit

### Symptom

Pages such as:

- `audit`
- `members`
- `media`
- `settings`

feel much slower than expected even when their own UI is simple.

### Likely Cause

The page loads `getTreeSnapshot(...)` even though it only needs:

- `tree`
- `actor`
- a narrower page-specific dataset

### First Checks

1. Inspect the page loader before touching UI code.
2. Check whether the page actually consumes:
   - `people`
   - `parentLinks`
   - `partnerships`
   - `media`
   - `personMedia`
3. If not, replace the full snapshot with a specialized page-data loader in the repository.

### Typical Fix

Prefer page-specific repository loaders over full snapshot loading when the page is not a real snapshot consumer.

### Relevant Files

- `app/tree/[slug]/audit/page.tsx`
- `app/tree/[slug]/members/page.tsx`
- `app/tree/[slug]/media/page.tsx`
- `app/tree/[slug]/settings/page.tsx`
- `lib/server/repository.ts`

---

# 17. Fullscreen Media Viewer Shows A Wide Horizontal Bar On Narrow Screens

### Symptom

On a narrow-width fullscreen media viewer:

- a wide horizontal bar appears across the media stage
- left and right arrows look merged into one oversized overlay
- fullscreen composition breaks even though the inline gallery still looks acceptable

### Likely Cause

The fullscreen viewer and inline gallery share navigation classes such as `.media-lightbox-nav`.

A generic mobile rule for `.media-lightbox-nav` can unintentionally stretch the fullscreen nav controls to full width.

In the fullscreen path those controls are absolutely positioned side controls, so `width: 100%` makes the left and right buttons overlap across the stage.

### First Checks

1. Inspect the responsive rules for `.media-lightbox-nav` in `app/globals.css`.
2. Confirm whether the fullscreen path uses `.media-lightbox-minimal`.
3. Check whether fullscreen nav has an explicit scoped override such as `.media-lightbox-minimal .media-lightbox-nav`.
4. Verify which element is drawing the bar before blaming filmstrip or browser video controls.

### Typical Fix

Keep inline/mobile responsive behavior separate from fullscreen responsive behavior.

Use:

- generic mobile rules for inline/shared baseline only
- explicit fullscreen overrides through `.media-lightbox-minimal .media-lightbox-nav`

Do not treat this as a `video-only` problem or a `filmstrip-only` problem unless inspection proves otherwise.

### Relevant Files

- `app/globals.css`
- `components/tree/person-media-gallery.tsx`

---

# 18. Archive Upload Fails With Duplicate `(album_id, media_id)` Key Violation

### Symptom

Archive upload or album-targeted upload fails with errors such as:

- `duplicate key value violates unique constraint "tree_media_album_items_album_id_media_id_key"`

### Likely Cause

Repository album-link logic attempted to insert the same `(album_id, media_id)` pair twice.

Typical overlap zones:

- selected manual album during archive upload
- uploader auto-album linking
- repeated completion/retry path for the same uploaded media

### First Checks

1. Inspect `completeArchiveMediaUpload(...)` in `lib/server/repository.ts`.
2. Inspect `addMediaToTreeMediaAlbums(...)` in `lib/server/repository.ts`.
3. Verify whether repository code checks for an existing album-item row before insert.
4. Confirm whether uploader-album and manual target album could both point to the same final pair or whether the same completion path re-ran.

### Typical Fix

Do not weaken the unique constraint.

Keep database integrity as-is and make repository linking idempotent:

- fetch existing album-item rows for the candidate `(album_id, media_id)` pairs
- insert only missing pairs

### Relevant Files

- `lib/server/repository.ts`
- `components/media/tree-media-archive-client.tsx`
- `app/api/media/archive/complete/route.ts`

---

# 19. Cloudflare Video Preview Stays In `pending` Or `processing`

### Symptom

Archive video tiles or album covers show:

- dark placeholder instead of generated thumb
- the video itself still opens and plays
- `summary=1` for the media reports `preview_status: pending` or `preview_status: processing`

### Likely Cause

Preview generation was started but not fully completed, or the original best-effort post-upload processing did not recover automatically after interruption.

### First Checks

1. Check `GET /api/media/:id?summary=1` for:
   - `provider`
   - `preview_status`
   - `preview_error`
   - `preview_claimed_at`
2. Confirm the file is actually `provider = cloudflare_r2`.
3. Confirm whether the affected media is visible on `/tree/[slug]/media`, because visible editor surfaces now re-trigger recovery for stuck previews.
4. If the tile is already visible, verify whether the client eventually refreshes the tile from placeholder to thumb without a manual reload.

### Typical Fix

Do not treat this as a broken video file by default.

The correct path is:

- server-side visible-preview recovery from the media page
- client-side bounded polling for visible `pending` / `processing` video previews
- normal thumb batching once the preview becomes `ready`

Only escalate to file/FFmpeg investigation when `preview_status = failed` or `preview_error` is populated.

### Relevant Files

- `app/tree/[slug]/media/page.tsx`
- `components/media/tree-media-archive-client.tsx`
- `app/api/internal/media/process-video-previews/route.ts`
- `lib/server/repository.ts`

---

# 20. Tree avatars blink and requests go to `storage.yandexcloud.net`

### Symptom

On tree load:

- avatar badges appear a moment after the rest of the tree
- browser network or status text shows requests to `storage.yandexcloud.net`

### Likely Cause

Active avatar rows in the current demo tree still use legacy `provider = object_storage`.

Tree card avatars are inserted only after the client effect in `FamilyTreeCanvas`, and those inserted avatar images then resolve through `/api/media/:id`, which may redirect to legacy object storage for old rows.

### First Checks

1. Inspect primary `person_media` rows for the active tree.
2. Check matching `media_assets.provider` and `created_at`.
3. Confirm whether the tree is using disposable demo or fixture data such as `popovi` or smoke trees.

### Typical Fix

Treat this as demo-data remediation first:

- recreate the affected avatar media through the current file-backed flow
- reassign them as primary avatars
- delete the old legacy rows

Do not start by adding resolver exceptions for Yandex-backed avatars.

### Relevant Files

- `components/tree/family-tree-canvas.tsx`
- `lib/tree/display.ts`
- `app/api/media/[mediaId]/route.ts`
- `lib/server/repository.ts`
- `lib/env.ts`

---

# 21. Chrome Android Video Starts, Shows Duration, Then Falls Into False Fallback

### Symptom

On `Chrome Android` in real product surfaces such as:

- `/tree/[slug]/media?mode=video`
- person card / viewer lightbox

video may:

- show native controls and correct duration,
- begin buffering or partially load,
- then switch to the app fallback like `Оригинал этого медиа сейчас недоступен...`

Historically this could happen more often on repeated opens of the same asset than on the first open.

### Likely Cause

This was previously misclassified as:

- broken video file,
- signed URL / `HEAD` issue,
- Cloudflare R2 delivery failure,
- generic codec incompatibility.

The investigation on `2026-04-14` showed the more accurate pattern:

- `/api/media/:id` could still return `206` and stay viable,
- the same asset could play on a minimal native debug page,
- the failure was in the site integration path around `PersonMediaGallery`,
- especially on `Chrome Android` when the player had already reached a partially playable state and then emitted a late error.

### First Checks

1. Reproduce on a real `Chrome Android` device, not on desktop emulation.
2. Check whether the failure happens on:
   - the archive/media surface,
   - the person-card viewer,
   - one specific asset only,
   - or every video.
3. Confirm whether the player already shows duration / controls before the fallback appears.
4. Check current preview/prod runtime logs for:
   - `GET /api/media/:id` with `206`,
   - late client-side error after metadata/playback start.
5. Read the historical handoff before changing code:
   [chrome-android-video-handoff-2026-04-14.md](C:/Antigravity/Antigravity-audio-docs-experiment/docs/research/chrome-android-video-handoff-2026-04-14.md)

### Typical Fix

Do not start by changing storage provider, codec policy, or rebuilding the entire player.

The proven direction was:

- keep the real delivery path through `/api/media/:id`,
- make the `Chrome Android` expanded path closer to plain native `<video controls playsinline preload="metadata">`,
- avoid collapsing immediately into placeholder fallback after a late error if the player has already reached playable state,
- only treat the issue as file-specific after the site integration path is ruled out.

### Relevant Files

- `components/tree/person-media-gallery.tsx`
- `components/tree/tree-viewer-client.tsx`
- `components/media/tree-media-archive-client.tsx`
- `app/api/media/[mediaId]/route.ts`
- `docs/research/chrome-android-video-handoff-2026-04-14.md`

---

# 22. Hosted Video Upload Reaches 100% Then Hangs Before Final Save

### Symptom

On hosted surfaces such as `*.vercel.app`:

- upload progress reaches full file size,
- UI stays on `Загружается...` / `Сохраняется...`,
- the file does not appear in the archive or person card,
- runtime logs may show `upload-intent` but no matching `complete` request.

### Likely Cause

Browser direct upload to `Cloudflare R2` is blocked by bucket CORS for the current hosted origin.

Typical shape:

- `upload-intent` returns a `direct` upload contract,
- browser starts PUT to R2,
- current hosted origin is not allowed in bucket CORS,
- client never reaches the normal completion step.

### First Checks

1. Inspect current bucket CORS, not just app env.
2. Compare the browser origin with the allowed origins in:
   [cloudflare/r2-cors.json](C:/Antigravity/Antigravity-audio-docs-experiment/cloudflare/r2-cors.json)
3. Confirm whether the failing surface is:
   - local `http://localhost:3000`,
   - preview branch alias,
   - main alias,
   - production alias,
   - or a newly attached custom domain.
4. If `upload-intent` succeeds but `complete` is missing, treat CORS as the first suspect.

### Typical Fix

Do not keep permanent proxy-only workarounds for hosted upload if the product is meant to use browser direct upload.

The correct fix is:

- update `cloudflare/r2-cors.json` with the real allowed browser origins,
- apply that CORS policy to the actual R2 bucket,
- only then remove any temporary hosted-proxy workaround from runtime code.

When a new custom domain is added later, update `cloudflare/r2-cors.json` and re-apply the bucket policy before switching traffic.

### Relevant Files

- `cloudflare/r2-cors.json`
- `README.md`
- `app/api/media/upload-intent/route.ts`
- `app/api/media/archive/upload-intent/route.ts`
- `lib/utils.ts`

---

# Practical Rule

Before modifying production code, always determine which category the issue belongs to:

1. real domain/runtime bug
2. migration drift
3. development/runtime noise
4. network or tooling issue

Incorrect classification is one of the easiest ways to introduce new bugs while attempting to fix an issue.
