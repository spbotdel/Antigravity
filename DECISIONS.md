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
