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
