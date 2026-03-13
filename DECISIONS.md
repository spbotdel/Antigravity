# DECISIONS

This file records important architectural decisions made in the Antigravity project.

It is not a changelog and not a feature history.

The purpose is to preserve long-lived architectural knowledge so that future development and AI agents understand:

- why certain decisions were made
- what constraints exist
- what must not be accidentally refactored

Only decisions with long-term architectural impact should be recorded here.

---

# 2026-03-06 — The family tree is modeled as a graph

### Decision

The family tree is implemented as a graph, not as a strict hierarchical tree.

Persons are nodes and relationships are stored as edges:

- `person_parent_links`
- `person_partnerships`

### Why

Real genealogical structures are not strict trees:

- children may have unknown parents
- people may have multiple partnerships
- families may contain partial ancestry
- shared children may appear across partnerships

A graph model handles these cases naturally.

### Consequence

Future changes must not assume:

- exactly two parents
- a binary tree structure
- a single ancestry path

All display logic must tolerate incomplete or complex graph structures.

---

# 2026-03-06 — Domain model and display model are separate

### Decision

The canonical domain model stores only:

- persons
- parent-child links
- partnerships

Display structures such as:

- couple nodes
- grouped children
- visual branches
- overlays

are derived projections.

### Why

Display requirements differ between builder and viewer.

Persisting visual structures would couple UI rendering to the domain model.

### Consequence

Display algorithms may change without modifying database structures.

Derived display nodes must never be persisted as domain entities.

---

# 2026-03-06 — Builder and viewer use different tree projections

### Decision

Builder and viewer are allowed to use different tree projections.

- Builder projection prioritizes editing clarity.
- Viewer projection prioritizes readable family presentation.

### Why

Editing workflows require simpler structures, while viewing workflows benefit from grouped relationships such as couples.

A single projection model would compromise both use cases.

### Consequence

Differences between builder and viewer layouts are expected and valid.

Refactoring must not attempt to unify them unless the architecture is intentionally redesigned.

---

# 2026-03-06 — Repository layer owns domain mutations

### Decision

All domain mutations must go through the repository layer:

`lib/server/repository.ts`

### Why

The repository centralizes:

- permission checks
- data validation
- audit logging
- database interaction

Allowing mutations in multiple layers would fragment business logic.

### Consequence

API routes and UI components must not perform domain mutations directly.

All changes to:

- persons
- relationships
- media
- invites
- share links

must pass through the repository.

---

# 2026-03-06 — API routes remain thin

### Decision

Next.js API routes act only as request handlers, not as business logic containers.

They may:

- parse request input
- call validators
- call repository functions
- format responses

### Why

Keeping routes thin prevents duplication of domain logic across endpoints.

### Consequence

Complex logic must live in the repository layer or shared modules.

Routes should remain simple and predictable.

---

# 2026-03-06 — Snapshot-based rendering

### Decision

Viewer and builder rendering operate on snapshot data loaded from the server.

Snapshots contain:

- tree
- actor
- persons
- parent links
- partnerships
- media
- person-media links

### Why

This ensures that rendering is deterministic and does not require live database queries.

### Consequence

Rendering code must not perform direct database traversal.

All rendering must derive from snapshot data.

---

# 2026-03-06 — Share links are separate from memberships

### Decision

Share links provide read-only access and do not create membership records.

### Why

Share links are designed for simple family viewing without requiring accounts.

Mixing share-link access with membership access would complicate permission logic.

### Consequence

Share links must remain distinct from account-based roles.

They must not implicitly create members or grant editing capabilities.

---

# 2026-03-06 — Media architecture uses metadata + storage

### Decision

Media assets are stored as:

- metadata in database
- files in storage

Access is controlled through server routes and signed delivery.

### Why

This keeps access control centralized and avoids public-by-default file exposure.

### Consequence

Media files should not be served directly from public storage URLs.

Access must go through controlled routes.

Legacy external URLs remain supported only as fallback compatibility.

---

# 2026-03-06 — One tree per owner in v1

### Decision

The current version supports one tree per owner.

### Why

The product currently targets a small private family archive use case.

Supporting multiple trees introduces complexity in:

- UI
- permissions
- dashboard flows

### Consequence

Future work may lift this constraint, but the current system assumes a single tree per owner.

---

# 2026-03-06 — Migration state is part of runtime correctness

### Decision

Database migration state is treated as part of the runtime contract.

### Why

Code may depend on:

- new tables
- enum values
- constraints
- policies

If migrations are missing remotely, the system may fail in ways that look like product bugs.

### Consequence

When diagnosing issues, always check migration state before modifying application logic.

Migration drift must be considered a possible root cause of runtime failures.

---

# 2026-03-08 — Cloudflare is the target media delivery platform

### Decision

For the next media architecture stage:

- `Supabase` remains the source of truth for auth, database, permissions, and media metadata
- `Cloudflare R2` becomes the target binary storage layer for new file-backed media
- `Cloudflare Stream` becomes the target platform for new video ingest and playback
- `Cloudflare Queues` is the target async layer for media processing jobs

The existing `Yandex Object Storage` path remains transitional compatibility, not the long-term target.

### Why

The product starts with Russia-based usage but is expected to become global later.

The current stack must eventually tolerate:

- many concurrent viewers
- concurrent uploads and edits
- larger family archives
- heavier video usage, including longer recordings

An edge-oriented media plane is a better fit for that target than continuing to scale the current mixed Next.js + object-storage upload/read path alone.

### Consequence

Future media work should follow this split:

- `Supabase` = metadata and ACL plane
- `Cloudflare` = binary/media delivery plane

New upload and delivery design should prefer:

- direct uploads from the browser to Cloudflare-managed media endpoints
- CDN/edge delivery for previews and file-backed reads
- video playback through a dedicated streaming product
- background jobs for derivative creation, avatar extraction, and media post-processing

The current Yandex-backed path must keep working during migration, but new architectural work should not deepen the Yandex dependency.

The Next.js application should progressively move toward this role:

- permission checks
- metadata writes/reads
- upload/session orchestration

and away from this role:

- binary upload proxying
- synchronous image processing in the request path
- repeated heavy binary delivery on read

Migration consequence:

- new uploads should move first
- old Yandex-backed media should remain readable during migration
- a dedicated migration sequence must define when legacy Yandex paths stop accepting new uploads

---

# 2026-03-10 — Cloudflare Stream and FFmpeg are deferred unless playback problems are proven

### Decision

For the current migration stage:

- `Cloudflare R2` remains the near-term target for new file-backed media uploads
- private file-backed video playback remains the default path
- `Cloudflare Stream` is not a mandatory next step
- a self-managed `FFmpeg -> mp4/HLS/poster/thumbnail` pipeline is reserved as the very last fallback only if real playback problems remain after the simpler `R2/private delivery` path is validated

### Why

The current product is a private family archive, not a video-first platform.

Right now the most important thing is to keep migration scope small and reversible:

- stabilize `R2` rollout
- keep signed private delivery clear and testable
- avoid introducing recurring service cost or a custom transcoding pipeline before there is evidence that the simpler path is insufficient

`Cloudflare Stream` can solve managed video ingest/playback problems, and `FFmpeg/HLS` can solve compatibility/adaptive-delivery problems, but both add complexity that is not justified unless playback quality or compatibility actually becomes a blocker.

### Consequence

Near-term media planning should prefer:

- `R2` rollout gating
- direct upload where it helps
- private signed file delivery
- explicit QA around real playback behavior

Do not treat either of these as default roadmap requirements without evidence:

- `Cloudflare Stream`
- `FFmpeg -> mp4/HLS/poster/thumbnail`

If playback remains good enough on the simpler file-backed path, neither should be introduced.

---

# 2026-03-08 — Family archive media is a first-class tree surface

### Decision

The product will support two media surfaces:

- `person-linked media` inside a person card
- `family archive media` as a separate tree-level section named `Медиа`

The tree-level `Медиа` section is visible to any actor who can view the tree, not only owners/admins.

Archive items are tree-scoped first and may exist without a person link.

### Why

Real family archives contain many shared photos and videos that are not initially attached to one specific person.

If the product only supports person-linked media, shared family material becomes awkward to ingest, browse and later classify.

### Consequence

The media domain must support:

- tree-level archive browsing
- later attachment of archive items to people
- gallery-first viewing for both archive and person-card media
- archive mutations for any actor who already has tree edit rights
- audit log visibility for who uploaded and who deleted archive items

Future UI and route planning should assume a dedicated tree navigation entry:

- `/tree/[slug]/media`

The read surface must be available to all viewers with tree access.

---

# 2026-03-08 — Family archive is organized around gallery views and albums

### Decision

The tree-level `Медиа` section is not a flat dump of files.

It should be organized around:

- `Фото`
- `Видео`

and, inside each media mode:

- `Все`
- `Альбомы`

The product should also support:

- user-created albums
- automatically created uploader albums such as `От Вячеслава`

Disk-like folders received from relatives are modeled as albums in the product, not as a raw filesystem abstraction.

### Why

Real family archives arrive as themed folders:

- birthdays
- weddings
- trips
- scans

Users need a gallery-first archive surface that stays understandable over time.

Flat media lists are acceptable only as a temporary fallback, not as the long-term archive experience.

### Consequence

The media domain and UI must evolve toward:

- tree-level archive gallery views
- album creation flow
- auto-created uploader albums
- later attachment of archive items to people without destroying archive organization

This also means the future archive/upload flow must allow the user to decide whether new files go:

- into the general archive flow
- into a selected album
- into a newly created album

---

# 2026-03-09 — Server-side Supabase transport is native-first with PowerShell fallback

### Decision

Server-side Supabase access must not assume that the `PowerShell` bridge is the primary transport path.

The preferred transport model is:

- `native Node fetch` first
- `PowerShell` bridge only as fallback on transport-level failures or explicit override

This applies to:

- `lib/supabase/server-fetch.ts`
- `lib/supabase/admin-rest.ts`

### Why

The legacy PowerShell bridge was introduced as an operational workaround for Windows environments where Node-side network access to Supabase could fail intermittently.

That fallback is still useful, but using `powershell.exe` for every server-side REST call creates avoidable cost:

- extra process spawn overhead
- higher latency variance
- more CPU and memory pressure under repeated page loads
- harder diagnosis of whether a slowdown is in the app, the transport, or the remote service

### Consequence

Future changes must preserve this rule:

- keep `native-first` as the steady-state transport
- keep `PowerShell` as a resilience/debugging fallback
- do not reintroduce `PowerShell-only` request flow as the default unless a new decision explicitly replaces this one

Operational consequence:

- `SUPABASE_ADMIN_REST_TRANSPORT` may be used with `auto | native | powershell`
- `auto` is the default and expected mode

Documentation consequence:

- transport behavior must be visible in startup-context docs, not only in code
- non-obvious environment workarounds should be recorded in `DECISIONS.md`, `REPO_MAP.md`, `COMMON_BUGS.md`, and `.claude/*`

---

# 2026-03-09 — Tree pages should prefer specialized page loaders over full snapshots

### Decision

`getTreeSnapshot(...)` is not the default loader for every tree page.

Use the full snapshot only when the page truly needs rendering data such as:

- persons
- parent links
- partnerships
- media
- person-media links

For tree pages that only need `tree + actor` plus a small page-specific dataset, prefer specialized loaders such as:

- `getTreeAuditPageContext(...)`
- `getTreeMembersPageData(...)`
- `getTreeMediaPageData(...)`
- `getTreeSettingsPageData(...)`

### Why

The full snapshot is convenient but expensive.

Using it for pages like `audit`, `members`, `media`, or `settings` when they do not actually need the full tree projection creates:

- unnecessary Supabase reads
- more server-side memory pressure
- slower SSR
- more instability under repeated local/dev access

### Consequence

Future page work must not default to `getTreeSnapshot(...)` out of convenience.

Before using the full snapshot, the implementer should be able to justify that the page really needs rendering data rather than only access context and a narrower dataset.

This rule applies especially to:

- `app/tree/[slug]/audit/page.tsx`
- `app/tree/[slug]/members/page.tsx`
- `app/tree/[slug]/media/page.tsx`
- `app/tree/[slug]/settings/page.tsx`

The main viewer page and snapshot APIs remain valid consumers of the full snapshot.

---

# How to update this file

Add a new entry when:

- an architectural decision is made
- a long-term constraint is introduced
- a tricky runtime behavior is discovered
- an important design trade-off is accepted

Do not add entries for:

- minor bug fixes
- UI tweaks
- routine refactors
