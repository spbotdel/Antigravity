# TREE_ALGORITHMS

## Purpose

This document describes the main algorithms that turn database-backed family graph data into:
- viewer tree projections
- builder tree projections
- canvas layout
- interactive selection and relation affordances

The goal is to explain how the current tree renderer works without treating the renderer as the source of truth.

This document explains the algorithms used by the current implementation.
The code in the repository remains the source of truth.

## Primary Algorithm Sources

Read these files first:
1. `lib/tree/display.ts`
2. `components/tree/family-tree-canvas.tsx`
3. `lib/server/repository.ts`

## Input Model

All rendering algorithms start from `TreeSnapshot`.

The snapshot contains:
- `tree`
- `actor`
- `people`
- `parentLinks`
- `partnerships`
- `media`
- `personMedia`

Important:
- rendering uses snapshot data
- rendering should not query the database during traversal

## Snapshot Filtering

TreeSnapshot data is assumed to already be filtered according to the current actor.

This includes:

- media visibility filtering
- share-link access filtering
- membership access filtering

Display algorithms must assume snapshot data is authoritative and should not reimplement permission filtering.

## Algorithm Group 1: Display Tree Construction

Implemented in:
- `lib/tree/display.ts`

### 1.1 Viewer projection: `buildDisplayTree(snapshot)`

Purpose:
- derive the richer display tree for viewer-like rendering
- emit both `person` nodes and `couple` nodes

High-level algorithm:
1. Index people by id.
2. Build:
- `childrenByParent`
- `parentLinksByChild`
- `partnershipsByPerson`
3. Compute `sharedChildrenByPartnership` by intersecting child sets of both partners.
4. Resolve root person.
5. Walk the graph recursively from the root.
6. For each person:
- add couple branches for partnerships with shared children
- add solo child branches for non-shared children

Output shape:
- `DisplayTreeNode`
- node type is either:
  - `person`
  - `couple`

### 1.2 Builder projection: `buildBuilderDisplayTree(snapshot)`

Purpose:
- derive a simpler tree for builder editing
- emit only `person` nodes

Difference from viewer projection:
- no couple nodes
- no partnership-based grouping in the rendered tree structure
- simpler descendant-oriented traversal for editing

High-level algorithm:
1. Index people.
2. Build `childrenByParent` and `parentLinksByChild`.
3. Resolve root person.
4. Walk recursively through child links only.
5. Emit a pure person-node tree.

### 1.3 Root selection algorithm

Both display builders use the same root selection strategy:

1. Use `tree.root_person_id` if it exists and points to a valid person.
2. Otherwise choose a person with no parent links.
3. Otherwise choose the first sorted person.

This means:
- the tree can still render even if root is not configured
- incomplete ancestry is supported

### 1.4 Sort order

People and links are sorted by:
1. birth date if available
2. full name
3. id

Effect:
- traversal and display become deterministic
- sibling ordering is stable

### 1.5 Shared-child grouping

Viewer projection creates a `couple` node when:
- a partnership exists
- both partners share at least one child through parent links

Algorithm:
1. gather children of partner A
2. gather children of partner B
3. intersect the sets
4. render those children under one couple node

Children of a person that are not shared with the visible partner stay as solo branches.

### 1.6 Cycle prevention during traversal

The display builders use visited sets:
- `seenPeople`
- `seenPartnerships`

Purpose:
- avoid infinite recursion
- avoid repeating the same person/partnership branch

This is important because the domain is a graph, not a strict tree.

## Algorithm Complexity Notes

Display tree construction is approximately:

`O(P + L + R)`

Where:
- `P` = number of persons
- `L` = number of parent-child links
- `R` = number of partnerships

Traversal is linear with respect to the snapshot size.

Canvas layout adds additional recursive measurement but remains bounded by the size of the visible subtree.

## Algorithm Group 2: Media Projection

Implemented in:
- `lib/tree/display.ts`

### 2.1 `collectPersonMedia(snapshot, personId)`

Purpose:
- derive all media attached to a person

Algorithm:
1. collect `media_id` values from `personMedia` rows for the person
2. filter `snapshot.media` by those ids

### 2.2 `buildPersonPhotoPreviewUrls(snapshot)`

Purpose:
- choose one preview photo URL per person for canvas/avatar display

Algorithm:
1. collect photo media ids only
2. sort `personMedia` so primary links win
3. assign first matching photo to each person
4. expose URL as `/api/media/:id`

Effect:
- preview selection is derived
- display does not need to know storage details

## Algorithm Group 3: Canvas Layout

Implemented in:
- `components/tree/family-tree-canvas.tsx`

The canvas renderer has two different modes:
- builder
- viewer

The most sophisticated layout logic lives in builder mode.

### 3.1 Builder layout entry point

Core function:
- `buildBuilderCanvasLayout(...)`

Purpose:
- take person-tree projection plus relationship records
- compute positioned nodes and SVG links

Outputs include:
- positioned person nodes
- overlay nodes for invisible parents/partners
- child links
- shared child links
- partnership labels

### 3.2 Local graph indexing for layout

Before measuring the layout, the builder constructs:
- `childrenByParent`
- `parentIdsByChild`
- `partnershipsByPerson`
- partnership date labels

Purpose:
- make recursive measurement and edge generation cheap
- avoid repeated full-array scans during layout

### 3.3 Partnership date resolution

Function:
- `resolvePartnershipDateLabel`

Strategy:
1. if `start_date` exists, use it
2. otherwise infer a label from earliest shared child birth date
3. otherwise no meaningful label

This is a display algorithm, not domain truth.

### 3.4 Recursive subtree measuring

Function:
- `measure(personId)`

Purpose:
- compute vertical space needed by:
  - children
  - partners
  - overlays

Each measured subtree tracks:
- person id
- child measures
- partner specs
- top/bottom padding
- partner reach

This recursive measure is the basis for later absolute placement.

### 3.5 Partner placement

Functions:
- `getPartnerOffsets`
- `getPartnerPlacementY`
- `getPreferredPartnerOffset`

Purpose:
- position partner nodes around the anchor person
- reduce collisions
- keep readable spacing between multiple partners

Important heuristics:
- alternate above/below directions
- penalize overlap with occupied y positions
- penalize moving outside local bounds
- keep partners near the anchor when possible

### 3.6 Parent placement

Functions:
- `getParentVerticalOffset`
- `getParentSlot`

Purpose:
- place multiple visible parents to the left side in a readable way

The algorithm does not assume:
- exactly two parents
- father first
- mother second

It just computes slots and offsets.

### 3.7 Invisible parent overlays

Function:
- `getInvisibleParentIdsForPerson`

Purpose:
- when some parents are not visible in the rendered descendant projection,
  show overlay nodes or link hints so relationships are still legible

This keeps the editing model richer than the visible builder tree.

### 3.8 Link generation

Main helper functions:
- `buildHorizontalChildLinkPath`
- `buildSharedChildLinkPath`
- `buildSideLinkPath`
- `buildPreviewLinkPath`

These produce SVG path strings for:
- ordinary child links
- couple/shared-child links
- parent/partner overlays
- create-preview scaffolding

### 3.9 Couple midpoint child links

When a child is shared by two partners, the canvas uses a midpoint-based link path.

Meaning:
- the child visually belongs to the pair, not just to one visible parent

This is one of the key legibility rules in the builder/viewer.

## Layout Determinism

Canvas layout attempts to produce stable node placement across renders.

Determinism comes from:

- stable sort order of people
- deterministic traversal order
- consistent partner placement heuristics

Small layout shifts may still occur when:
- new partners are added
- children are inserted between existing siblings
- ancestor branches change shape

## Algorithm Group 4: Canvas Selection And Interaction

Implemented in:
- `components/tree/family-tree-canvas.tsx`
- `components/tree/builder-workspace.tsx`

### 4.1 Selection mapping

Core helpers:
- `matchesSelection`
- `getFocusedPersonId`
- `selectPreferredCanvasItem`

Purpose:
- map domain person selection to either:
  - a person node
  - a couple node that includes the selected person

This lets the renderer keep one person selected even when the visible node is a couple projection.

### 4.2 Node actions

Canvas actions:
- `add-parent`
- `add-child`
- `add-partner`
- `delete`

The canvas itself only emits the action.
The builder workspace owns mutation flow.

### 4.3 Optimistic builder creation

Builder workspace uses optimistic temporary nodes:
- temporary person ids
- temporary relation ids

Flow:
1. optimistic node/link appears
2. repository/API request runs
3. temporary ids are replaced with persisted ids
4. on failure, optimistic records are rolled back

This makes canvas editing feel immediate while still using server-side persistence.

### 4.4 Selection after mutation

When a temporary person becomes a real persisted person:
- selection is rewritten
- references in snapshot are replaced
- builder continues editing the real record

This avoids losing focus after create flows.

## Algorithm Group 5: Delete-Related Behavior

The renderer itself does not decide deletion semantics.

But the algorithms depend on the repository producing a clean post-delete snapshot.

Important practical behavior:
- stale form state after person deletion must not survive selection changes
- builder forms must remount when selected person changes
- display/layout should always be recomputed from fresh snapshot state after deletion

## Domain vs Display Reminder

Canonical domain model:
- people
- parent-child links
- partnerships

Derived display model:
- couple nodes
- shared child grouping
- parent overlays
- partner overlays
- canvas branch geometry

Display algorithms must never persist visual nodes back into domain tables.

## Current Known Friction Points

1. Builder regression scenarios can expose timing-sensitive snapshot updates after create/delete.
2. Complex branch creation may need retry-aware regression scripts because builder state is optimistic and async.
3. Viewer and builder use related but intentionally different tree projections.

## Practical Reading Order

For algorithm work:
1. `lib/tree/display.ts`
2. `components/tree/family-tree-canvas.tsx`
3. `components/tree/builder-workspace.tsx`
4. `tests/tree-display.test.ts`
5. `tests/family-tree-canvas.test.tsx`
6. `tests/builder-left-branches-e2e.mjs`
