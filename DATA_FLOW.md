# DATA_FLOW

## Purpose

This document describes how data moves through the current `Antigravity` runtime.

It focuses on practical request and rendering flows:
- page rendering
- API mutations
- snapshot loading
- permissions
- media upload/delivery
- invites and share links
- audit loading

The repository code remains the source of truth.

## High-Level Flow

```text
Browser
→ Next.js page or API route
→ validator layer
→ repository layer
→ Supabase clients / REST bridge
→ database + RLS + storage
→ repository result
→ page/UI rendering
```

## Core Rule

The main application data flow should look like this:

1. request enters `app/`
2. input is validated in `lib/validators/*`
3. business/data logic runs in `lib/server/repository.ts`
4. Supabase is called
5. result is transformed into UI-safe or API-safe shape
6. client renders from snapshot/response

## 1. Page Rendering Flow

### 1.1 Viewer page

Path:
- `app/tree/[slug]/page.tsx`

Flow:
1. route resolves tree slug
2. `getTreeSnapshot(slug, options)` is called
3. repository checks access:
- membership
- share link
- public/private visibility
4. repository loads tree snapshot data
5. snapshot is passed to `components/tree/tree-viewer-client.tsx`
6. viewer derives display tree from snapshot
7. canvas renders derived structure

### 1.2 Builder page

Path:
- `app/tree/[slug]/builder/page.tsx`

Flow:
1. route resolves slug
2. `getBuilderSnapshot(...)` is called
3. repository loads builder snapshot
4. actor permissions are checked
5. if actor cannot edit, redirect to viewer
6. builder workspace renders from snapshot

### 1.3 Members page

Path:
- `app/tree/[slug]/members/page.tsx`

Flow:
1. viewer snapshot is loaded
2. actor is checked for member-management access
3. repository loads:
- memberships
- invites
- share links
4. page passes data to `MemberManagementPanel`

### 1.4 Settings page

Path:
- `app/tree/[slug]/settings/page.tsx`

Flow:
1. tree snapshot is loaded
2. owner-only settings access is checked
3. settings form renders directly from snapshot tree/person data

### 1.5 Media page

Path:
- `app/tree/[slug]/media/page.tsx`

Flow:
1. route resolves tree slug and optional `share` token
2. `getTreeMediaPageData(...)` loads the specialized page context instead of a full tree snapshot
3. repository returns:
- tree
- actor
- visible media
- album summaries
- album item relations
4. page builds `albumMediaMap` plus persisted/derived album summaries
5. page passes the result to `TreeMediaArchiveClient`
6. archive client renders gallery view, album view, per-card actions, selection mode, bulk album add, and bulk download without a full page reload

Important:
- album summaries now include album-level `access`
- media visible on this page should already be filtered by effective access, not only raw file visibility

### 1.6 Audit page

Path:
- `app/tree/[slug]/audit/page.tsx`

Flow:
1. tree snapshot is loaded
2. owner audit access is checked
3. `listAudit(treeId, { page, pageSize })` is called
4. repository loads paginated audit rows and total count
5. audit presenter converts raw entries into human-readable `AuditEntryView`
6. UI renders paginated audit feed

## 2. Snapshot Loading Flow

Main functions:
- `getTreeSnapshot`
- `getBuilderSnapshot`
- internal `loadTreeSnapshot`

Data loaded into snapshot:
- tree
- actor
- people
- parent links
- partnerships
- media
- person-media links

Important:
- snapshot is already access-filtered
- display code should not repeat permission checks
- rendering should not issue live DB traversal queries

## 3. Mutation Flow

### 3.1 Tree mutations

Routes:
- `app/api/trees/route.ts`
- `app/api/trees/[treeId]/route.ts`
- `app/api/trees/[treeId]/visibility/route.ts`

Flow:
1. request payload is validated
2. repository function runs
3. permissions are checked in repository
4. tree row is inserted/updated
5. audit event is written
6. updated tree is returned

### 3.2 Person mutations

Routes:
- `app/api/persons/route.ts`
- `app/api/persons/[personId]/route.ts`

Flow:
1. request payload is validated
2. repository creates/updates/deletes person
3. repository writes audit
4. builder or viewer reloads snapshot

### 3.3 Relationship mutations

Routes:
- `app/api/relationships/parent-child/*`
- `app/api/partnerships/*`

Flow:
1. request payload is validated
2. repository checks tree-level edit access
3. relationship row is inserted/updated/deleted
4. audit event is written
5. client refreshes snapshot and recomputes display

## 4. Builder Interaction Flow

Main component:
- `components/tree/builder-workspace.tsx`

Flow:
1. builder starts from server snapshot
2. user interacts with canvas
3. canvas emits high-level action only:
- add parent
- add child
- add partner
- delete
4. builder workspace performs optimistic local update
5. builder sends API request
6. repository persists change
7. temporary ids are replaced with real ids
8. snapshot/UI state is refreshed

Important:
- canvas does not own domain mutations
- builder workspace orchestrates mutation flow

## 5. Media Flow

### 5.1 Upload flow

Routes:
- `app/api/media/upload-intent/route.ts`
- `app/api/media/complete/route.ts`

Flow:
1. user selects file in builder
2. request for upload intent is sent
3. repository:
- validates edit access
- resolves media kind from mime type
- creates signed upload target for the active storage backend
4. browser uploads file directly to storage or via a local proxy route, depending on the active storage backend
5. client calls `complete` route
6. repository creates:
- `media_assets` row
- `person_media` row
7. audit event is written
8. snapshot reload exposes new media

External video flow:
1. user pastes an external video URL in builder
2. `app/api/media/complete/route.ts` is called directly
3. repository creates a `media_assets` row with external provider metadata
4. `person_media` link is created
5. media route later redirects to the stored external URL

### 5.2 Read flow

Route:
- `app/api/media/[mediaId]/route.ts`

Flow:
1. media access route is requested
2. repository loads media record
3. repository checks:
- tree access
- share-link or membership access
- effective media visibility
4. if file-backed media:
- signed URL is generated for the configured storage backend
  - when `download=1`, the signed URL is prepared for attachment-friendly single-file download
5. if legacy external URL:
- external URL is returned as redirect target
6. browser follows redirect

Important:
- read enforcement should flow through:
  `resolveMediaAccess(...)`
  →
  `resolveEffectiveMediaAccess(mediaId)`
- effective media visibility is the strictest of:
  - file `visibility`
  - every linked album `access`

### 5.3 Delete flow

Flow:
1. delete request reaches media route
2. repository checks edit access
3. file is removed from storage if `storage_path` exists
4. metadata row is deleted
5. audit event is written

### 5.4 Archive Album Mutation Flow

Routes:
- `app/api/media/albums/route.ts`
- `app/api/media/albums/items/route.ts`

Flow:
1. archive client validates current tree context and selection state locally
2. request payload is validated in `lib/validators/media.ts`
3. repository checks tree edit access
4. repository creates either:
- a new manual album, or
- new `tree_media_album_items` rows for existing media -> album relations
5. client patches `albumMediaMap` locally
6. album summaries and counts recompute from the updated `albumMediaMap`

Important:
- client skips already-related media ids before bulk add-to-album
- database uniqueness on `(album_id, media_id)` remains the final duplicate guard
- manual album create now writes both:
  - album `kind`
  - album `access`
- album create/update routes now also write album-level `access`
- adding a file to a stricter album changes its effective access through repository logic, not by mutating file visibility in UI
- album-link writes should be idempotent:
  repository code must skip already existing `(album_id, media_id)` pairs instead of re-inserting them

### 5.5 Archive Download Flow

Routes:
- `app/api/media/[mediaId]/route.ts?download=1`
- `app/api/media/archive/download/route.ts`

Flow:
1. single-item archive download uses `/api/media/:id?download=1`
2. bulk archive download posts selected media ids to `/api/media/archive/download`
3. repository resolves the existing archive media rows for the current editor
4. route prepares the attachment response:
- direct attachment redirect for one item
- generated `.zip` for multiple items
5. archive client triggers a file save in the browser without reloading the page

### 5.6 Archive Upload Review Flow For Selected Albums

Flow:
1. user opens archive upload review while a specific manual album is the current target
2. client resolves the selected review album
3. upload review defaults file visibility from that album's `access`
4. UI may simplify the dialog by hiding the standalone visibility selector for album-targeted upload
5. completion route still persists authored file visibility and then links the file into:
- uploader album of the same `kind`
- selected manual album, when present

Important:
- this is a UX default, not a repository access rule change
- effective access still remains the strictest of file visibility and every linked album access
- uploader-album and selected-album linking may overlap in code paths, so repository linking must stay idempotent

## 6. Invite Flow

Routes:
- `app/api/invites/route.ts`
- `app/api/invites/accept/route.ts`

Flow:
1. owner/admin creates invite
2. repository generates opaque token and hashed token storage
3. invite row is written
4. URL is returned to UI
5. invited user accepts invite
6. repository creates or updates membership
7. invite is marked accepted
8. audit event is written

## 7. Share Link Flow

Routes:
- `app/api/share-links/route.ts`
- `app/api/share-links/[shareLinkId]/route.ts`

Flow:
1. owner/admin creates family share link
2. repository generates opaque token and stores only hash
3. share-link row is created
4. read-only URL is returned
5. viewer opens tree with `?share=...`
6. repository validates token against hash
7. actor is resolved as `share_link`
8. tree snapshot is returned with filtered data
9. `last_accessed_at` is updated best-effort

Important:
- share links do not create membership rows
- share links are read-only

## 8. Permission Flow

Main logic:
- `lib/permissions.ts`
- repository gate checks
- database RLS

Three layers of protection:
1. page/route access gating
2. repository permission checks
3. database policy enforcement

Important:
- permissions should not live only in the UI
- display/render code assumes already-filtered snapshot data

## 9. Audit Flow

Write path:
1. repository mutation succeeds
2. repository writes audit entry
3. audit entry stores:
- tree id
- actor
- entity type
- entity id
- action
- before/after payloads

Read path:
1. audit rows are loaded from DB
2. repository also loads supporting profile/person context
3. `lib/audit-presenter.ts` turns raw audit into readable feed
4. UI renders paginated feed

## 10. Error Flow

Main error handling path:
- route handler catches error
- `toErrorResponse(...)` formats API error
- pages use redirects or server-rendered fallback UI
- builder/viewer surfaces form/status messages from responses

Important:
- migration drift can look like runtime failure
- environment instability can look like product failure
- always separate transport/migration problems from domain logic bugs

## 11. Where Data Flow Should Not Happen

Avoid these patterns:
- direct DB access inside components
- direct DB traversal during rendering
- permission logic duplicated across many components
- route handlers containing complex domain workflows
- display algorithms re-checking access rules

## 12. Practical Reading Order

If you need to trace a product flow end-to-end:

1. `app/...page.tsx` or `app/api/...route.ts`
2. matching validator in `lib/validators/*`
3. `lib/server/repository.ts`
4. `lib/permissions.ts`
5. display/render layer:
   - `lib/tree/display.ts`
   - `components/tree/family-tree-canvas.tsx`
   - `components/tree/builder-workspace.tsx`
