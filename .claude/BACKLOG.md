# BACKLOG — Antigravity

*Operational task backlog only.*

*Updated: 2026-03-13*

## Wave 1 — Current Execution

- [x] Fix invite acceptance so an existing membership is never downgraded
- [x] Reproduce and close the owner-only tab loss after invite flow; add regression coverage
- [x] Add revealable family share links: encrypted token storage for new links, reveal/copy UX, and legacy fallback
- [x] Show the full absolute tree URL in `Настройки` and add copy action
- [ ] Finish the remaining local Wave 1 builder/media/archive cleanup from the live pass:
  calmer copy/labels, final affordance cleanup, and any last UI-only deltas that do not require hosted staging
- [ ] Keep video thumbnail generation out of scope for Wave 1

Status note:
- local `Wave 1` validation is currently green on `npm test`, `npm run build`, `npm run smoke:media`, `npm run smoke:auth`, and `npm run smoke:e2e`
- remaining next-step work has shifted from local correctness to hosted staging setup and real staged validation

## Wave 2 — Hosted Validation And Email

- [ ] Deploy hosted staging on `Vercel`
- [ ] Disable `DEV_IMPERSONATE_*` on staging and use hosted env as the truth surface for auth, invite/share-link behavior, and perceived speed
- [ ] Run hosted UAT for `Owner EU`, `Helper RF`, and `Relative RF`
- [x] Add invite email delivery via `Resend` with manual-copy fallback
- [ ] Review staged UAT findings and fix any release-blocking defects

Operational note:
- app hosting target is now `Vercel`
- `Cloudflare R2` is already client-owned and remains the storage plane
- `Resend` sender/domain should be prepared directly on client-owned data

## Launch-Critical

- [ ] Complete a full database backup/restore rehearsal on a machine or environment with `pg_dump` / `psql` or a safe staging target
- [ ] Update the final launch decision notes after staged UAT and recovery checks are complete
- [ ] Keep startup memory and launch docs aligned with the actual execution order

## Wave 3 — Visual System

- [ ] Add `Tailwind + shadcn/ui` foundation
- [ ] Migrate shared primitives: buttons, inputs, selects, textareas, dialogs, tabs, cards
- [ ] Bring the remaining custom builder/media/member surfaces to the same visual language without forcing the canvas onto stock components
