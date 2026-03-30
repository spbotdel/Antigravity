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

# 2026-03-22 — Fullscreen media viewer and inline gallery must use separate responsive nav behavior

### Decision

Responsive behavior for shared media navigation classes must be scoped by UI context.

For `inline gallery` usage, mobile layouts may use wider navigation controls when that helps the inline composition.

For `fullscreen media viewer` usage under `.media-lightbox-minimal`:

- navigation must remain compact side controls
- fullscreen path must not inherit `width: 100%` mobile nav behavior from shared classes
- fullscreen-specific overrides must be applied explicitly through a context selector such as `.media-lightbox-minimal .media-lightbox-nav`

### Why

The media lightbox and inline gallery currently reuse classes such as `.media-lightbox-nav`.

A generic mobile rule for `.media-lightbox-nav` was acceptable for inline/mobile gallery, but it also affected the fullscreen lightbox path.

In fullscreen mode the nav controls are absolutely positioned at the left and right sides of the stage. When the shared mobile rule stretched them to full width:

- left and right controls overlapped
- the viewer showed a wide horizontal bar across the media stage
- fullscreen composition broke even though the inline/mobile gallery behavior itself was still reasonable

This is a class-sharing and cascade-scoping problem, not a media-type-specific layout problem.

### Consequence

Future responsive work on shared media components must preserve this rule:

- shared responsive rules should be treated as inline-safe defaults, not automatically fullscreen-safe behavior
- fullscreen viewer must explicitly override conflicting mobile rules through scoped selectors
- when inline and fullscreen surfaces share classes, responsive changes must be reviewed in both contexts before they are treated as safe

This reduces the chance that a mobile polish change for inline gallery quietly breaks fullscreen viewer composition.

---

# 2026-03-27 — Archive album access is a hard upper bound for files inside it

### Decision

Tree-level archive albums now carry their own access:

- `members`
- `public`

File access is enforced by the strictest context:

- file `visibility`
- every linked album `access`

The single repository entry point for this rule is:

- `resolveEffectiveMediaAccess(mediaId)`

### Why

The product promise for a private family archive is:

- if an album is closed to family only, nothing inside it should remain wider by accident

Keeping file access wider than its enclosing album would create a direct mismatch between:

- what the UI implies
- what the signed file route actually allows

### Consequence

Future work must preserve these rules:

- file `visibility` remains authored state
- album `access` is a limiting boundary
- effective file visibility is computed, not stored as a third permanent truth column
- `resolveMediaAccess(...)` must enforce through `resolveEffectiveMediaAccess(...)`
- tightening may close access immediately through effective visibility
- loosening must not silently widen files unless their own authored visibility and all other album constraints already allow it

---

# 2026-03-28 — Archive albums have explicit media kind and legacy mixed test albums are reset

### Decision

Tree-level archive albums now have a required explicit media kind:

- `photo`
- `video`

Album kind is authored server-side state.

It must not be inferred dynamically from current album contents.

The same product rule also applies to uploader albums:

- uploader albums are scoped by `(uploader_user_id, kind)`
- one uploader may therefore have one photo uploader album and one video uploader album inside the same tree

Existing legacy archive albums were treated as disposable test data and reset during the migration rollout.

No backfill or auto-classification path is part of this decision.

### Why

Showing the same persisted albums in both `Фото` and `Видео` tabs created a direct UX and data-model mismatch.

If album kind were derived from current contents instead of stored explicitly:

- tab filtering would stay ambiguous
- empty albums would have no stable type
- mixed or legacy contents would keep forcing compatibility heuristics

The product now prefers a strict explicit model over legacy flexibility.

### Consequence

Future work must preserve these rules:

- manual albums must always be created with explicit `kind`
- uploader albums must also carry explicit `kind`
- album contents must stay same-kind only
- archive UI should render album lists from explicit `album.kind`, not from content inference
- migrations and runtime code should assume that old mixed test albums were intentionally discarded, not preserved

---

# 2026-03-28 — Album-targeted archive upload inherits album access by default, but effective access stays strictest

### Decision

When the archive upload review flow targets a specific album, file visibility should default to that album's `access`.

The UI should not force the user to repeat the same privacy choice for album-targeted uploads.

This is a UX default only.

The repository access model remains unchanged:

- file `visibility` is still authored state
- effective access is still the strictest of file visibility and every enclosing album access

### Why

Once album access became selectable at creation time, asking for file visibility again during upload into that same album created redundant and confusing UX.

The user intent in that flow is usually:

- choose the album
- inherit the album privacy

not:

- choose album privacy
- then immediately restate the same visibility choice for each file

### Consequence

Future work must preserve these rules:

- upload into a selected album should default to the album's current `access`
- standalone archive upload may still expose normal file visibility choice
- this UX shortcut must not weaken the strictest-rule access model
- repository and DB logic must continue enforcing effective access independently of UI defaults

---

# 2026-03-28 — Archive album linking must be idempotent

### Decision

Application-level album linking for archive media must be idempotent.

If a `(album_id, media_id)` relation already exists, repository code should skip it instead of attempting a second insert.

### Why

The database uniqueness constraint on `tree_media_album_items(album_id, media_id)` is correct and must remain in place.

However, archive upload and album-targeting paths can legitimately re-enter album-linking logic through retries, overlapping uploader-album/manual-album handling, or repeated completion calls.

In that situation, treating an existing link as an error creates avoidable runtime failure even though the desired final state already exists.

### Consequence

Future work must preserve these rules:

- keep the unique constraint
- do not use duplicate-key exceptions as normal control flow
- repository album-link writes should insert only missing pairs
- uploader-album and selected-album flows may overlap, so deduping must happen before insert

---

# 2026-03-28 — Uploader albums are virtual archive albums

### Decision

Uploader/system albums such as `От Сергей Тест` are virtual albums.

For uploader albums, the source of truth for summary and detail semantics is the visible media set matching:

- `tree_id`
- `created_by`
- `kind`

This applies to:

- album card count
- album card cover/preview
- album detail contents

Persisted uploader album rows still matter only for:

- metadata
- access / edit / delete behavior
- stable album identity in UI

Persisted `tree_media_album_items` must not be treated as the semantic source of truth for uploader album summary behavior, even when such links exist.

### Why

Uploader albums are intended as a convenient archive view over one uploader's visible media for one media kind.

If uploader album cards use persisted `tree_media_album_items`, while album detail uses all visible media by `(created_by, kind)`, the product shows contradictory counts and broken expectations.

That mismatch is a product-model problem, not a presentation problem.

### Consequence

Future work must preserve these rules:

- uploader album card count and uploader album detail must always be derived from the same virtual media set
- uploader album cover must also be derived from that same media set
- manual albums may keep using persisted album-item relations as their source of truth
- persisted uploader album rows may exist, but they must not narrow uploader album count/detail semantics to linked items only

---

# 2026-03-28 — In `All media`, uploader albums merge by uploader while kind-specific modes stay split

### Decision

Uploader albums remain split by `kind` in:

- `Фото`
- `Видео`

But in `Все медиа`, uploader albums must be merged into a single virtual album per `uploader_user_id`.

The merged uploader album should:

- include all visible uploader media across photo and video
- expose combined count
- derive cover from that same combined media set

Manual albums must not be merged by this rule.

### Why

Once uploader albums became explicit per-kind virtual albums, `Все медиа` started showing duplicate uploader cards with the same title.

That is correct from a storage/model perspective, but wrong from a browsing perspective:

- users expect one uploader album in the combined archive mode
- users still expect separate uploader albums in the kind-specific modes

### Consequence

Future work must preserve these rules:

- `Все медиа` should show one uploader album per uploader
- `Фото` and `Видео` should keep uploader albums split by kind
- merged uploader album count, cover, and detail contents must all derive from the same combined visible media set
- manual albums remain one-card-per-persisted-album and are not affected by this merge rule

---

# 2026-03-30 — Archive grid keeps initial next-page thumb prefetch enabled by default

### Decision

The archive grid keeps one-page-ahead thumb URL prefetch enabled by default.

Current default behavior:

- initial screen uses server-pre-resolved direct thumb URLs
- hydrated client resolves the current visible thumb set through one batched request when needed
- exactly one next visible set may be prefetched during idle time

The evaluated `delay initial prefetch until visible images settle` mode remains diagnostic-only and is not part of the default product runtime.

### Why

The archive grid already had a real UX win after `Показать еще` once next-page thumb prefetch was enabled.

Further investigation showed:

- immediate initial-page next-set URL prefetch does mechanically overlap with the current visible screen
- browser image warming overlap was worth refining and was adjusted
- but after that refinement, no stable evidence showed that immediate initial-page URL prefetch alone causes a meaningful user-visible regression
- the dev environment remained too noisy, and cache order influenced the measurements too strongly to justify changing the default behavior

### Consequence

Future work should preserve these rules:

- keep one-page-ahead archive thumb prefetch enabled by default
- keep browser image warming limited so it does not interfere with the current visible screen
- do not enable `delay initial prefetch until settle` as product behavior without cleaner benchmark or real-user evidence
- if archive grid performance work resumes, treat the next bottleneck as a new measured problem rather than reopening this decision by default

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
