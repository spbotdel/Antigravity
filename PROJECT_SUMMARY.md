# PROJECT_SUMMARY

Navigation and reading order live in `REPO_MAP.md`. This file explains what the product is, not how to traverse the repo.

## What This Project Is

`Antigravity` is a private family tree application built with:

- Next.js
- React
- TypeScript
- Supabase

It is **not** a generic social network or a public genealogy portal.

The near-term goal is a **production-ready private family archive** for a real first customer.

Current working phase:

**V1.0 — Slava edition**

Meaning:

- owner-led family archive
- a small number of invited relatives/helpers
- read-only family sharing by link
- reliability prioritized over mass-market features

---

# Current Product Shape

The current product supports:

- one family tree per owner (v1 constraint)
- roles: `owner`, `admin`, `viewer`
- invite-based account access
- family share links for read-only viewing
- tree builder and viewer canvas
- private file media with signed delivery
- owner audit log

Legacy static genealogy viewer files exist in `legacy/`, but they are **not part of the primary runtime**.

---

# Stack

Core stack:

- Next.js 16
- React 19
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Storage

Testing:

- Vitest
- Playwright-style smoke/e2e scripts

---

# High-Level Architecture

Application flow:

```text
Browser
→ Next.js pages / API routes
→ validators
→ repository layer
→ Supabase clients
→ database + RLS + storage
```
