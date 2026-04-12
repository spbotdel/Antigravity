# SYSTEM_INVARIANTS

## Purpose

This document defines the architectural invariants of the Antigravity system.

These are not style guidelines.

They are **system properties that the current runtime depends on**.

If a proposed change violates any invariant listed here, the change must be treated as an **intentional architecture change**, not a normal implementation task.

Violating these invariants can corrupt domain data, break tree rendering, or introduce security issues.

---

# Domain Model Invariants

### 1. The family tree is a graph

The genealogy model is a **graph**, not a strict binary tree.

Do not assume:

- every child has two parents
- every partnership has children
- every pair of parents are partners
- every branch is complete

The system must tolerate incomplete ancestry and irregular family structures.

---

### 2. Persons are canonical nodes

Canonical person data lives in the `persons` table.

Person records represent the **actual domain entities**.

Display nodes, UI cards, or layout nodes are not canonical data.

---

### 3. Relationships are explicit edges

Relationships must be stored explicitly.

Parent-child relationships exist as records in:
`person_parent_links`

Partnerships exist as records in:
`person_partnerships`

Relationships must never be inferred from:

- visual grouping
- name order
- UI card position
- layout structure.

---

# Data Ownership Invariants

### 4. Domain truth lives in Supabase

The Supabase database is the canonical source of domain state.

The application server must not persist alternative domain state outside the database.

Temporary UI state is allowed, but it must not become canonical truth.

---

### 5. Repository owns domain mutations

All domain mutations must pass through the repository layer.

Repository logic enforces:

- permissions
- audit events
- mutation consistency.

Do not bypass repository logic for:

- person mutations
- relationship mutations
- media mutations
- invite or share-link mutations.

---

### 6. API routes are not the business layer

Route handlers must remain thin.

Routes may:

- parse requests
- validate input
- call repository functions
- return responses

Routes must not become the primary domain logic layer.

---

# Rendering Invariants

### 7. Snapshot data is the rendering input

Viewer and builder rendering operate on snapshot data.

Snapshot data is already filtered and structured.

Rendering code must not perform direct database traversal during rendering.

---

### 8. Display structures are derived

Display structures are projections derived from domain data.

Examples:

- couple nodes
- grouped children
- layout branches
- canvas overlays

These structures must never be stored as domain records.

---

### 9. Builder and viewer may differ visually

Builder projection and viewer projection may differ.

This is allowed and expected.

However, both must derive from the **same canonical domain graph**.

---

# Security Invariants

### 10. Permission checks must exist server-side

UI visibility alone is not a security boundary.

Tree access, membership access, media access, and invite/share-link access must be enforced server-side.

---

### 11. Share links are read-only access

Share links provide read-only viewing.

They must not:

- create membership records
- grant edit permissions
- bypass repository permission checks.

Share-link access is separate from account-based roles.

---

### 12. Media access must go through access control

Media files must be delivered through controlled access.

Do not regress to unrestricted public file delivery as the primary media path.

Media access must respect:

- tree visibility
- membership roles
- share-link permissions.

---

### 12.0.1 Media rendering must fail soft on missing storage objects

If a thumb, preview variant, or original file is missing in storage:

- the page must keep rendering
- media UI may degrade to placeholders, hidden previews, or explicit open/download affordances
- the failure must remain diagnosable through bounded debug logging

Implications:

- missing objects are not allowed to crash archive pages, viewer panels, or builder media surfaces
- thumb preloading is an optimization, not a hard render dependency
- original-file failure must degrade the single-media surface instead of taking down the whole route

---

### 12.0.2 Office document preview depends on an explicit public R2 base

Inline preview for Office Word documents is allowed only when `CF_R2_PUBLIC_BASE_URL` is configured and the document path is compatible with that preview flow.

Implications:

- `.doc/.docx` preview must not be assumed for private signed URLs alone
- when that public preview precondition is not met, the product must fall back to download/open behavior
- attachment-oriented download behavior for documents and audio must remain explicit, not incidental

---

### 12.1 Archive album access is a hard upper bound for files inside it

If an archive file belongs to one or more albums, its effective visibility must be the strictest of:

- the file's own `visibility`
- every linked album `access`

Implications:

- a file must never be effectively wider than the most restricted album containing it
- `members` is stricter than `public`
- effective visibility is computed in repository logic, not in UI
- the system must not rely on separate ad hoc access checks in multiple places

---

### 12.2 Archive album kind is explicit and must not be inferred

If an archive album exists, it must carry explicit media kind:

- `photo`
- `video`

Implications:

- album type must not be derived from current contents
- empty albums must still have stable type
- uploader albums are also kind-scoped, not just uploader-scoped
- a file must never be linked into an album of different kind

---

### 12.3 Uploader identity is metadata only

Uploader identity may remain in:

- `created_by`
- audit context
- internal diagnostics

But uploader albums must not function as active archive organization.

Implications:

- archive organization uses only manual albums plus person-scoped virtual views derived from `person_media`
- uploader album links must not affect effective access
- uploader album rows may remain in the database as inert legacy data until a later cleanup pass

---

### 12.4 Manual albums are the only persisted archive album organization

If an archive album is part of active runtime behavior:

- it must be a manual album

Implications:

- archive UI must not surface uploader album cards or destinations
- new uploads must not create or rely on uploader album assignment
- effective archive access may be narrowed only by manual album access, not by uploader album links

---

# Data Integrity Invariants

### 13. Deletion must be explicit

Deleting a person or relationship must account for:

- parent-child links
- partnerships
- media associations
- snapshot consistency
- builder and viewer state.

Implicit cascade behavior must not be introduced casually.

---

### 14. Migration state is part of runtime correctness

Code may depend on database schema elements such as:

- tables
- columns
- enums
- constraints
- RLS policies.

If code expects them, the corresponding migration must exist remotely.

Migration drift is a runtime correctness issue.

---

### 14.1 Archive album linking must be idempotent

Archive album linking may be reached through:

- direct add-to-album
- archive upload completion
- uploader-album plus selected-album overlap
- retry-like repeated completion paths

Implications:

- repository logic must skip already existing `(album_id, media_id)` pairs
- the unique constraint on `tree_media_album_items(album_id, media_id)` remains required
- the system must not rely on duplicate-key failures as normal behavior

---

### 15. Refactoring must preserve semantics

If a change affects:

- route contracts
- repository behavior
- permission logic
- tree display semantics
- schema expectations

then the change is not a simple refactor.

It must be treated as a functional change.

---

# Practical Rule

When debugging or modifying the system, first determine whether the issue is caused by:

1. a violated invariant
2. migration drift
3. development environment noise
4. an actual feature bug

Misclassifying the problem is one of the fastest ways to break the system.
