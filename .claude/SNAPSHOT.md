# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-03-13*

## Current State

- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS, and storage metadata
- Linked remote Supabase project: `untwxmiqqwepopeepzqe`
- Current workstream: `Media Upload Flow V2` has shifted into post-UAT launch hardening
- `Cloudflare R2` rollout is confirmed active for new uploads
- Legacy media paths remain readable as compatibility paths during transition
- Local validation baseline is green:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run smoke:media`
  - `npm run smoke:auth`
  - `npm run smoke:e2e`
- `smoke:auth` now degrades more safely through fallback-user handling when local auth signup is distorted by environment noise
- The legacy static viewer is preserved in `legacy/`, but it is not the primary runtime

## Current Active Task

- `tasks/active/media-upload-flow-v2` — `Post-UAT launch hardening inside Media Upload Flow V2` (`in_progress`, priority `high`)

## Working Assumptions

- One family tree per owner remains the current v1 scope
- `Cloudflare R2` is the intended steady-state upload path for new file-backed media
- Legacy Yandex-backed reads remain a compatibility path until migration is explicitly closed
- Tree pages should use specialized page-data loaders unless they truly need a full snapshot
- Server-side Supabase transport remains `native-first` with `PowerShell` fallback only for transport instability
- Local `next dev` with `DEV_IMPERSONATE_*` is not a trustworthy surface for real multi-user invite validation or perceived route-speed checks
- Hosted staging without `DEV_IMPERSONATE_*` becomes the truth surface after Wave 1
- Full `shadcn` migration is deferred to Wave 3
- Invite email delivery is planned for Wave 2 through `Resend`, while app-level invite URLs remain the source of truth
- Application hosting target is `Vercel`; Cloudflare remains the storage plane via `R2`, not the app runtime target

## Current Focus

- Local `Wave 1` hardening is largely complete and validated against unit/component/build plus local smoke flows
- The next execution step is hosted `Vercel` setup and real staged validation
- Keep operational docs aligned with the current ownership split:
  - app hosting on `Vercel`
  - storage on client-owned `Cloudflare R2`
  - email sending on client-owned `Resend`

## Active Blockers

- Hosted `Vercel` validation environment is not deployed yet
- Live UAT for `Owner EU`, `Helper RF`, and `Relative RF` is not completed yet
- Full database restore rehearsal is still pending on a machine or environment with `pg_dump` / `psql` or a safe staging target

## Next Steps

- Prepare `Vercel` project settings and production-like env mapping
- Deploy hosted `Vercel` environment and disable `DEV_IMPERSONATE_*` there
- Run live UAT from the hosted environment using the launch checklist
- Complete the full restore rehearsal in a suitable environment
- Review UAT and recovery findings and update launch decision docs
- Close the cycle with `/fi` after the next concrete operational pass
