# Antigravity

Antigravity is now a `Next.js + TypeScript + Supabase` family tree platform.

## What is in this repo

The active app supports:

- owner, admin, viewer, and anonymous access modes
- one family tree per owner in v1
- public and private tree visibility
- secure invite links
- family share links for read-only viewing
- private file media with signed delivery
- S3-compatible object storage for private media, currently verified with `Yandex Object Storage`
- file-backed video and external video-link flows
- owner-only audit log

The old static genealogy viewer is preserved in [`legacy/`](./legacy).

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage / S3-compatible Object Storage`
- `Vitest`

## Main app structure

- `app/` - App Router pages and API routes
- `components/` - UI and client-side workspaces
- `lib/` - auth, permissions, validators, object-storage/Supabase clients, server repository
- `supabase/migrations/` - schema, constraints, RLS, storage bucket bootstrap
- `supabase/seed.sql` - optional local seed data
- `legacy/` - preserved static HTML/CSS/JS viewer

## Project documentation

The repository includes a set of structured documentation files that describe the architecture, domain model, algorithms, and operational behavior of the system.

These documents are primarily intended to help:

- developers quickly understand the project
- AI coding agents safely modify the system
- avoid accidental architectural regressions

The source code remains the ultimate source of truth, but these documents explain how the system is intended to work.

## Documentation files

The runtime startup-context list for Codex is defined in [`.codex/config/framework-adapter.json`](./.codex/config/framework-adapter.json) under `startup_context_paths`.

### [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)

High-level overview of the Antigravity project.

Describes:

- the product purpose
- the current development phase (`Slava edition`)
- the technology stack
- the current scope and constraints
- overall system architecture

Recommended starting point for understanding the project.

### [REPO_MAP.md](./REPO_MAP.md)

Navigation map of the repository.

Explains:

- the purpose of each major directory
- where the core runtime logic lives
- where the most important files are located
- which parts of the repo are legacy artifacts

Useful for quickly locating relevant code.

### [TREE_MODEL.md](./TREE_MODEL.md)

Defines the core domain model of the family tree.

Explains:

- trees
- persons
- parent-child links
- partnerships
- media
- memberships and share links

Important rule:

The family tree is modeled as a graph, not a strict binary tree.

This document describes the canonical domain structure stored in the database.

### [TREE_ALGORITHMS.md](./TREE_ALGORITHMS.md)

Describes how the application converts domain data into visual tree structures.

Covers:

- viewer tree projection
- builder tree projection
- shared-child grouping
- display node generation
- canvas layout algorithms
- selection and interaction behavior

Important distinction:

Domain data is stored in the database, while display structures are derived projections.

### [DATA_FLOW.md](./DATA_FLOW.md)

Explains how data moves through the runtime.

Covers:

- page rendering flow
- snapshot loading
- mutation flow
- builder interaction flow
- media upload and delivery across object storage and external video links
- invite and share link flows
- permission enforcement
- audit logging

This document describes the runtime request pipeline.

### [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md)

Defines practical architectural constraints for the system.

Examples:

- repository layer owns domain mutations
- API routes should remain thin
- permission logic must be centralized
- domain model must remain separate from display model

These rules help prevent architectural drift during development.

### [DECISIONS.md](./DECISIONS.md)

Long-lived architectural decisions and constraints.

Covers decisions such as:

- graph-based family model
- separation of domain model and display model
- thin API routes
- repository-owned mutations
- snapshot-based rendering
- media and share-link constraints

Use this file to understand why important architectural constraints exist and what must not be accidentally refactored.

### [COMMON_BUGS.md](./COMMON_BUGS.md)

Operational debugging guide for recurring issues.

Covers common failure patterns such as:

- missing Supabase migrations
- schema cache mismatches
- builder state bugs
- hydration errors
- network issues with Supabase or GitHub
- test fixture pollution

The file helps diagnose issues before modifying production code.

## Recommended reading order

For understanding the project:

1. [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)
2. [REPO_MAP.md](./REPO_MAP.md)
3. [TREE_MODEL.md](./TREE_MODEL.md)
4. [TREE_ALGORITHMS.md](./TREE_ALGORITHMS.md)
5. [DATA_FLOW.md](./DATA_FLOW.md)
6. [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md)
7. [DECISIONS.md](./DECISIONS.md)
8. [COMMON_BUGS.md](./COMMON_BUGS.md)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill values:

```bash
cp .env.example .env.local
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `MEDIA_STORAGE_BACKEND` optional, defaults to `supabase`
- `NEXT_PUBLIC_STORAGE_BUCKET` optional for Supabase Storage, defaults to `tree-photos`
- `OBJECT_STORAGE_BUCKET` required when `MEDIA_STORAGE_BACKEND=object_storage`
- `OBJECT_STORAGE_ENDPOINT` optional, defaults to `https://storage.yandexcloud.net`
- `OBJECT_STORAGE_REGION` optional, defaults to `ru-central1`
- `OBJECT_STORAGE_ACCESS_KEY_ID` required for object storage
- `OBJECT_STORAGE_SECRET_ACCESS_KEY` required for object storage

Current verified object-storage path:

- `MEDIA_STORAGE_BACKEND=object_storage`
- `OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- `OBJECT_STORAGE_REGION=ru-central1`
- backend validated with `Yandex Object Storage`

3. Apply the current SQL migrations in `supabase/migrations/` to your Supabase project.

For the current media/object-storage path this includes at least:

- [`supabase/migrations/20260301193000_family_tree_v1.sql`](./supabase/migrations/20260301193000_family_tree_v1.sql)
- [`supabase/migrations/20260306173000_unified_media_v1.sql`](./supabase/migrations/20260306173000_unified_media_v1.sql)
- [`supabase/migrations/20260306173100_unified_media_constraints_v1.sql`](./supabase/migrations/20260306173100_unified_media_constraints_v1.sql)
- [`supabase/migrations/20260307111500_object_storage_provider_v1.sql`](./supabase/migrations/20260307111500_object_storage_provider_v1.sql)
- [`supabase/migrations/20260307111600_object_storage_provider_constraints_v1.sql`](./supabase/migrations/20260307111600_object_storage_provider_constraints_v1.sql)

4. Optionally run [`supabase/seed.sql`](./supabase/seed.sql) after at least one auth user exists.

5. Start the app:

```bash
npm run dev
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm test`
- `npm run smoke:media`

## Product routes

- `/` - landing page
- `/auth/login`
- `/auth/register`
- `/auth/accept-invite`
- `/dashboard`
- `/tree/[slug]`
- `/tree/[slug]/builder`
- `/tree/[slug]/members`
- `/tree/[slug]/settings`
- `/tree/[slug]/audit`

## Important v1 constraints

- only one tree per owner
- no GEDCOM import/export
- media storage is sized for a small private family archive, not for terabyte-scale workloads
- no realtime collaborative editing
- no ownership transfer

## Verification status

Implemented and verified locally:

- `npm run typecheck`
- `npm test`
- `npm run smoke:media`
- `npm run build`
