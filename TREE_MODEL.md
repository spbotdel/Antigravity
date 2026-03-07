# TREE_MODEL

## Purpose

This document describes the actual tree/domain model used by the current `Antigravity` runtime.

Scope:
- family tree entities
- relationship model
- access model
- media model
- display model in viewer/builder
- important constraints of the current implementation

## Core Idea

The application models a family tree as:
- one `tree`
- many `persons`
- directed `parent -> child` links
- undirected pair-like `partnerships`
- media attached to people
- role-based and link-based access around the tree

The canvas/UI is built on top of these records. The database does not store a precomputed visual tree.

## Graph Model

The genealogy structure is a directed graph.

Nodes:
- persons

Edges:
- parent -> child (directed)
- partnerships (undirected pair)

Important:

The visual tree is a projection of this graph.

The graph may contain:
- multiple generations
- multiple partnerships
- children from different partners
- incomplete ancestry (unknown parents)

## Main Entities

### 1. Tree

Table:
- `public.trees`

Type:
- `TreeRecord`

Main fields:
- `id`
- `owner_user_id`
- `slug`
- `title`
- `description`
- `visibility`: `public | private`
- `root_person_id`

Meaning:
- the top-level container for one family tree
- in current v1 scope, one owner can have only one tree

Important note:
- `root_person_id` controls the preferred visual starting point of the tree
- if it is missing, the app derives a fallback root from people/links

### 2. Person

Table:
- `public.persons`

Type:
- `PersonRecord`

Main fields:
- `id`
- `tree_id`
- `full_name`
- `gender`
- `birth_date`
- `death_date`
- `birth_place`
- `death_place`
- `bio`
- `is_living`

Meaning:
- one human node in the family graph
- contains person-level facts only

Important note:
- relationship semantics do not live on the person record itself

### 3. Parent Link

Table:
- `public.person_parent_links`

Type:
- `ParentLinkRecord`

Main fields:
- `id`
- `tree_id`
- `parent_person_id`
- `child_person_id`
- `relation_type`

Meaning:
- directed edge from parent to child

Current usage:
- the runtime currently uses this mainly as a basic parent-child relation
- `relation_type` exists, but v1 product scope intentionally keeps child relationships simple

Important constraint:
- uniqueness is currently on `(tree_id, parent_person_id, child_person_id)`
- so one exact parent-child pair cannot have multiple parallel link rows

### 4. Partnership

Table:
- `public.person_partnerships`

Type:
- `PartnershipRecord`

Main fields:
- `id`
- `tree_id`
- `person_a_id`
- `person_b_id`
- `status`
- `start_date`
- `end_date`

Meaning:
- pair relationship between two adults

Current usage:
- used for spouses/partners/ex-partners
- multiple partnerships per person are supported

Important note:
- relationship state such as `partner`, `married`, `divorced` belongs to the partnership, not to the person

### 5. Media Asset

Table:
- `public.media_assets`

Type:
- `MediaAssetRecord`

Main fields:
- `id`
- `tree_id`
- `kind`: `photo | video | document`
- `provider`
- `visibility`: `public | members`
- `storage_path`
- `external_url`
- `title`
- `caption`
- `mime_type`
- `size_bytes`

Meaning:
- one stored media unit

Current direction:
- unified private file model is the primary path
- `external_url` remains as legacy/fallback for older video records

### 6. Person-Media Link

Table:
- `public.person_media`

Type:
- `PersonMediaRecord`

Main fields:
- `id`
- `person_id`
- `media_id`
- `is_primary`

Meaning:
- attaches media to a person
- allows one person to have multiple assets

### 7. Membership

Table:
- `public.tree_memberships`

Type:
- `MembershipRecord`

Main fields:
- `tree_id`
- `user_id`
- `role`: `owner | admin | viewer`
- `status`: `active | revoked`

Meaning:
- account-based access to a tree

### 8. Invite

Table:
- `public.tree_invites`

Type:
- `InviteRecord`

Meaning:
- temporary token that turns into membership access after acceptance

### 9. Share Link

Table:
- `public.tree_share_links`

Type:
- `ShareLinkRecord`

Main fields:
- `tree_id`
- `label`
- `token_hash`
- `expires_at`
- `revoked_at`
- `last_accessed_at`

Meaning:
- read-only family access without account-based membership

Important note:
- this is separate from `tree_invites`
- invites are for role-bearing account access
- share links are for read-only viewing

### 10. Audit Log

Table:
- `public.audit_log`

Type:
- `AuditEntry`

Meaning:
- append-only operational history of key tree actions

## Access Model

### Membership access

`ViewerActor` describes current effective access:
- `userId`
- `role`
- `isAuthenticated`
- `accessSource`
- `shareLinkId`
- capability booleans

Access sources:
- `membership`
- `share_link`
- `public`
- `anonymous`

Capabilities:
- `owner`: full tree control, settings, audit, member management
- `admin`: edit tree and media, manage many collaborative actions
- `viewer`: read-only via account
- `share_link`: read-only via family link

### Tree visibility

Tree-level visibility:
- `public`
- `private`

Current interpretation:
- `public` allows anonymous viewing
- `private` requires membership or valid share link

### Media visibility

Media-level visibility:
- `public`
- `members`

Current interpretation:
- `public` can be seen by public viewers and share-link viewers
- `members` requires account role or share-link access according to current runtime policy

## Relationship Semantics

### Parent-child

The model stores parenthood as explicit edges.

Meaning:
- family structure is not inferred from surnames or couple cards
- links are the source of truth

### Partnership

The model stores adult pair relationships separately from parent links.

Meaning:
- a person may have several partnerships
- shared children are discovered by intersecting parent-child links of two partners

### Why this matters

The canvas can show:
- a single person node
- a couple node for a partnership with shared children
- solo child branches for children not shared by a visible pair

## Relationship Assumptions

Do not assume:

- every child has two parents
- every partnership has children
- every pair of parents are partners
- every parent-child relation implies partnership
- the first parent in UI is the "father"
- visual order implies genealogy meaning

## Domain vs Display

Domain truth:
- persons
- parent-child links
- partnerships

Display projection:
- couple nodes
- grouped children
- visual branches

Display nodes must never be persisted as domain data.

Changes to layout must not modify domain relationships.

## Deletion Semantics

Deleting a person must handle:

- parent-child links
- partnerships
- media links
- display projections

Possible strategies:

1. restrict deletion if relationships exist
2. cascade delete relationships
3. orphan children if parent removed

The current implementation should follow repository logic in:
- `lib/server/repository.ts`

Agents must not introduce implicit cascade behavior without verifying repository rules.

## Display Model

The runtime has two display builders in:
- `lib/tree/display.ts`

### 1. `buildDisplayTree(snapshot)`

Purpose:
- builds the richer viewer tree
- can emit both:
  - `person` nodes
  - `couple` nodes

How it works:
- groups parent-child links by parent and child
- groups partnerships by person
- computes shared children for each partnership
- walks from root person downward
- creates couple nodes only where partnership + shared children make sense

### 2. `buildBuilderDisplayTree(snapshot)`

Purpose:
- builds the simpler builder tree
- emits only `person` nodes

Meaning:
- builder prioritizes editing and local clarity
- viewer can be more narrative/structured

### Root selection

Both display builders use:
1. explicit `tree.root_person_id`, if valid
2. otherwise a person with no visible parents
3. otherwise the first sorted person

## Invariants and Constraints

### Same-tree constraints

Triggers ensure:
- parent and child belong to same tree
- partners belong to same tree
- person-media link stays inside same tree

### One tree per owner

Current v1 rule:
- one owner -> one tree

### Owner is special

Current v1 rule:
- ownership is not reassigned through normal UI flows

### Media is tree-scoped

Media belongs to a tree first, then gets linked to a person.

### Share links are read-only

They should not mutate memberships or create edit capabilities.

## Current V1 Product Rules

### What is intentionally simple

- child relationships remain basic `parent-child`
- no mass-market complexity like GEDCOM yet
- no duplicate merge flow yet
- no public SEO storytelling layer yet

### What is already architecturally correct

- relationship edges are separate records
- partnerships are separate records
- media is metadata + file access, not blobs in app server
- account access and share-link access are distinct models

## Known Friction Points

1. `parent_person_id + child_person_id` uniqueness limits future richer multi-edge semantics.
2. Some dev/runtime behavior has shown hydration sensitivity around the app shell.
3. Remote Supabase migration state may drift from local migration files.
4. Builder stress flows can expose timing-sensitive async snapshot expectations.

## Current Practical Reading Order

To understand the tree model in code, read:
1. `supabase/migrations/20260301193000_family_tree_v1.sql`
2. `lib/types.ts`
3. `lib/server/repository.ts`
4. `lib/tree/display.ts`
5. `supabase/migrations/20260306160000_tree_share_links_v1.sql`
6. `supabase/migrations/20260306173000_unified_media_v1.sql`
7. `supabase/migrations/20260306173100_unified_media_constraints_v1.sql`
