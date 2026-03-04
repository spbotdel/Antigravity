# Antigravity

Antigravity is now a `Next.js + TypeScript + Supabase` family tree platform.

## What is in this repo

The active app supports:

- owner, admin, viewer, and anonymous access modes
- one family tree per owner in v1
- public and private tree visibility
- secure invite links
- photo storage in private Supabase Storage with signed delivery
- public Yandex Disk video links for public trees
- owner-only audit log

The old static genealogy viewer is preserved in [`legacy/`](./legacy).

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage`
- `Vitest`

## Main app structure

- `app/` - App Router pages and API routes
- `components/` - UI and client-side workspaces
- `lib/` - auth, permissions, validators, Supabase clients, server repository
- `supabase/migrations/` - schema, constraints, RLS, storage bucket bootstrap
- `supabase/seed.sql` - optional local seed data
- `legacy/` - preserved static HTML/CSS/JS viewer

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
- `NEXT_PUBLIC_STORAGE_BUCKET` optional, defaults to `tree-photos`

3. Apply SQL from [`supabase/migrations/20260301193000_family_tree_v1.sql`](./supabase/migrations/20260301193000_family_tree_v1.sql) in your Supabase project.

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
- Yandex video is public-only
- private video hosting is out of scope
- no realtime collaborative editing
- no ownership transfer

## Verification status

Implemented and verified locally:

- `npm run typecheck`
- `npm test`
- `npm run build`
