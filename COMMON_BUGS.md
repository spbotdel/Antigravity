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

# Practical Rule

Before modifying production code, always determine which category the issue belongs to:

1. real domain/runtime bug
2. migration drift
3. development/runtime noise
4. network or tooling issue

Incorrect classification is one of the easiest ways to introduce new bugs while attempting to fix an issue.
