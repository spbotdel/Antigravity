# ARCHITECTURE_RULES

## Purpose

This file defines the practical architecture rules for the current `Antigravity` runtime.

It is not a generic style guide.
It is a project-specific set of constraints for:
- data access
- rendering
- permissions
- media
- migrations
- safe refactoring

## Current Runtime

The active runtime is:
- `Next.js App Router`
- `React`
- `TypeScript`
- `Supabase`

The primary product is the live family tree app in:
- `app/`
- `components/`
- `lib/`
- `supabase/`

Legacy static viewer files are preserved, but they are not the source of truth for runtime behavior.

## Rule 1: Supabase Database Is The Domain Source Of Truth

Domain state lives in Supabase.

Canonical domain entities:
- trees
- persons
- parent-child links
- partnerships
- media assets
- memberships
- invites
- share links
- audit entries

Do not introduce alternative local persistence for domain truth inside Next.js runtime code.

Next.js handlers and pages should be treated as stateless request/render layers over database-backed state.

## Rule 2: API Routes Stay Thin

Files in `app/api/*` should:
- parse request input
- call validators
- delegate to repository/business functions
- format HTTP responses

They should not:
- contain large business workflows
- duplicate permission logic
- perform direct ad hoc SQL/domain branching inline

If logic becomes non-trivial, it belongs in `lib/server/repository.ts` or another shared `lib/server/*` module.

## Rule 3: Repository Layer Owns Data Access

`lib/server/repository.ts` is the main server-side data layer.

It owns:
- tree reads/writes
- access checks around tree operations
- invite/share-link flows
- person and relationship mutations
- media lifecycle operations
- audit loading

Do not duplicate repository queries in:
- route handlers
- components
- random helper modules

If a new domain behavior is added, prefer extending the repository instead of bypassing it.

## Rule 4: Validation Happens Before Mutation

Request payloads must be validated in `lib/validators/*` before mutation logic runs.

Current validator zones:
- tree
- person
- relationship
- invite
- share-link
- media

Do not rely on UI shape alone for correctness.
Server-side validation is required even if a form already constrains input.

## Rule 5: Permissions Must Be Centralized

Permission logic belongs in:
- `lib/permissions.ts`
- repository gate checks
- database RLS/policies

Do not scatter role logic across unrelated UI components.

Current effective access concepts:
- `owner`
- `admin`
- `viewer`
- `share_link`
- `public`
- `anonymous`

Important:
- share-link access is not the same as membership access
- invite flow is not the same as share-link flow

## Rule 6: Domain Model And Display Model Must Stay Separate

Domain truth:
- persons
- parent-child links
- partnerships

Display projection:
- display tree nodes
- couple nodes
- grouped child branches
- canvas overlays
- visual branch ordering

Display structures are derived.
They must never be stored as canonical domain entities.

Changing the layout algorithm must not implicitly change relationships in the database.

## Rule 7: The Tree Is A Graph, Not A Perfect Binary Family Tree

Do not assume:
- every child has two parents
- every partnership has children
- every pair of parents are partners
- every parent-child relation implies partnership
- every person has known ancestry
- visual left/right order encodes fixed genealogy semantics

The runtime must tolerate:
- incomplete ancestry
- multiple partnerships
- shared and non-shared children
- disconnected or partially connected branches

## Rule 8: Deletion Behavior Must Be Explicit

Deletion is a high-risk genealogy operation.

Deleting a person must account for:
- parent-child links
- partnerships
- media links
- display projections

Do not introduce implicit cascade assumptions without checking current repository logic and database constraints.

Before changing deletion behavior:
1. inspect `lib/server/repository.ts`
2. inspect current DB constraints/triggers
3. verify builder/viewer behavior after deletion
4. update tests

## Rule 9: Media Uses Metadata + Access Policy + Storage

Media architecture should follow this pattern:
- metadata in database
- files in storage
- access resolved through server checks and signed delivery

Do not regress to:
- public-by-default file URLs
- UI-only access rules
- ad hoc direct external-link behavior as the main path

Legacy external URL support may exist, but it is fallback compatibility, not the preferred architecture.

## Rule 10: Migrations Are Part Of The Runtime Contract

Code that expects new tables/columns/policies must be considered incomplete until the matching migration is applied remotely.

If product behavior suddenly fails with messages like:
- table missing
- schema cache missing
- enum value missing

first check remote migration drift.

Do not treat migration drift as a pure frontend/runtime bug.

## Rule 11: Prefer Additive Changes Over Hidden Refactors

When extending the system:
- prefer additive migrations
- prefer explicit new routes over overloading unrelated ones
- prefer extending existing types carefully
- prefer preserving working user flows while introducing new ones

Avoid broad refactors that change:
- route contracts
- repository semantics
- permission meaning
- display algorithms
unless the task explicitly requires it.

## Rule 12: Tests Must Follow Behavior Changes

If behavior changes in any of these areas, tests should move with it:
- permissions
- validators
- tree display
- audit presentation
- builder regressions
- smoke/e2e flows

Important:
- unit tests validate the model
- e2e validates real workflow integrity
- artifacts are diagnostic outputs, not tests themselves

## Rule 13: Builder Regressions Need Scenario Testing

The builder is the riskiest interaction surface.

When touching builder logic, check at least:
- add parent
- add child
- add partner
- delete person
- delete relationship
- multiple parent branches
- multiple partnerships
- selection/inspector synchronization

If the change is non-trivial, prefer a scenario script or targeted regression test.

## Rule 14: Separate Environment Noise From Product Bugs

Development environments may produce noise from:
- dev impersonation
- local Next.js runtime behavior
- network instability
- remote migration drift

Before modifying product logic, confirm the issue
is not caused by environment-specific conditions.

## Rule 15: Display Uses Snapshot Data

Viewer and builder rendering should operate on snapshot data
rather than issuing repeated database queries during traversal.

Snapshots should contain:
- persons
- relationships
- partnerships
- media projections
- access filtering

Display algorithms should not depend on live database calls during traversal.

## Rule 16: Tests Are The First Debugging Surface

Before changing production code, check whether an existing test
already captures the failing behavior.

Relevant test zones:
- validators
- permissions
- tree display
- builder regression tests
- realistic tree scenarios

If a regression cannot be reproduced in tests,
consider adding a minimal test before changing logic.

## Rule 17: Keep The Architecture Legible

When in doubt, prefer code organization that preserves this mental model:

```text
page / route
→ validation
→ repository
→ Supabase
→ derived display model
→ UI
```

If a change makes this flow harder to see, it is probably the wrong shape.

## Practical Reading Order

For most feature work:
1. `supabase/migrations/*`
2. `lib/types.ts`
3. `lib/server/repository.ts`
4. relevant validator in `lib/validators/*`
5. relevant display logic in `lib/tree/display.ts` or `components/tree/family-tree-canvas.tsx`
6. page/API/component files
7. matching tests
