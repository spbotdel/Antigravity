# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-03-19*

## Current State

- Framework mode: active
- Active branch: `fix/builder-inspector-desktop-align-final`
- Runtime application: `Next.js 16 + React 19 + TypeScript`
- Backend/data layer: `Supabase` auth, database, RLS + S3-compatible object storage
- Dev environment: linked to Supabase project `untwxmiqqwepopeepzqe`
- Legacy static viewer: preserved in `legacy/` and old `index.html`, but no longer the main runtime
- Current workstream: the main tree-scoped visual-system migration has now passed through archive, utility surfaces, builder/viewer media, and tree nav/canvas framing; current effort should shift from broad migration to consolidated QA, access/UAT validation, and calm follow-up polish
- Target media platform: `Cloudflare` for the next binary/media delivery stage, while the current Yandex path remains transitional compatibility.

## Current Active Task

- `tasks/active/media-upload-flow-v2` — `Media Upload Flow V2` (`in_progress`, priority `high`)
- Latest `smoke:media`: `media-storage-report-1773924934314.json` (`green`)

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
- The current hosted validation URL is the `main` branch alias:
  `https://antigravity-git-main-spbotdel-4945s-projects.vercel.app`
- The current public hosted validation surface is the production alias:
  `https://antigravity-zeta-two.vercel.app`

## Current Focus

- [x] Unified local-file upload now covers photos and videos from device in one flow.
- [x] Multi-file batches, visible limits copy, and human-readable progress feedback are in place in the builder.
- [x] Tree-scoped visual-system migration is now materially in place across `Медиа`, `Участники`, `Настройки`, `Журнал`, builder/viewer media surfaces, and tree nav/canvas framing.
- [x] Hosted preview regression is green after the migration passes on `smoke:auth`, `smoke:e2e`, `smoke:media`, and a logged-in route sweep.
- [x] Cloudflare rollout metadata now persists explicitly as `provider: cloudflare_r2` after remote schema update, not only in upload-intent transport fields.
- [x] Hosted invite-email readiness is now verified: the flow succeeds with graceful manual-link fallback when `Resend` is not configured.
- [x] Current engineering baseline is green on `npm run typecheck`, `npm run build`, `npm run smoke:auth`, `npm run smoke:e2e`, and `npm run smoke:media:direct`.
- [x] PR1 browser upload transport fix is in place: direct upload now falls back to server proxy only on network/timeout-style failures, not on abort or 4xx signed-URL errors.
- [x] PR1 signed-URL fallback regression coverage is in place for `win32`, non-`win32`, and repository-level `503` degradation scenarios.
- [x] Shared dialog close labels are localized to Russian in the shared primitive.
- [x] Viewer and builder now expose an in-app media gallery with inline playback for file-backed video.
- [x] `smoke:media` now persists a JSON report artifact in `tests/artifacts/`.
- [x] Tree-level `/tree/[slug]/media` archive foundation is in place with navigation, page shell, and archive client.
- [x] Archive album persistence exists for manual albums and uploader albums.
- [x] Archive upload review flow exists with batch confirmation and discard guard.
- [x] Archive surface now includes a large in-app viewer/lightbox and sticky bottom actions for the current context.
- [x] Variant-aware media delivery foundation exists for `thumb/small/medium` photo previews.
- [x] Cloudflare R2 runtime/config foundation is present for the next media storage stage.
- [x] Calm landing/dashboard pass is now done: shorter copy, steadier CTA rhythm, and a fresh local visual check are in place.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow in final hosted UAT, not only smoke.
- [x] Builder layout now has a fresh green QA pass on the current canvas-first UI, including viewport screenshots and delete-path verification.
- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.

## Active Blockers

- [ ] Current media upload UX is smoke-green and hosted regression-green, and the hosted browser-emulation pass now covers album/mobile states too, but explicit human QA close-out is still open.
- [ ] Cloudflare target foundations, direct upload, and explicit provider metadata are now green on local and hosted smoke, but final release/UAT hardening remains open.
- [ ] Preview variant foundations and focused regression are green, but final hosted/UAT close-out is still incomplete; originals should not leak back into archive/viewer/builder previews.
- [ ] The tree-level family archive now has sticky actions, large viewer/lightbox, calmer review flow, visible tile copy, quieter empty states, and a green hosted mobile album-view pass, but broader human end-to-end QA is still unfinished.
- [ ] Builder canvas resize and overlay inspector now pass smoke and the refreshed QA pass, but final live UAT on tablet/mobile widths is still open.
- [ ] Members/invite/share-link flows are smoke-green and hosted route-green, but still need explicit live UAT against clipboard and perceived-speed behavior.
- [x] Targeted hosted access-management pass is now green on production alias: invite creation, clipboard copy, share-link create/reveal/revoke, and invite acceptance all pass in browser-emulated UAT.
- [ ] Hosted invite-email path itself is healthy, but `Resend` sender/domain is still not configured; delivery currently degrades to manual-copy fallback by design and is intentionally deferred for now.
- [x] For the current milestone, `backup/restore rehearsal` is removed from launch blockers; the accepted operational baseline is manual database export discipline plus Cloudflare-backed media retention.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Remaining visual follow-up is now concentrated in archive/mobile/end-to-end QA rather than landing/dashboard.

## Next Steps

- [ ] Keep the active Cloudflare rollout stable as the steady-state upload path and avoid widening transport scope unless a real regression appears.
- [ ] Leave `Resend` sender/domain setup for the later external close-out; it is no longer the current engineering task.
- [ ] Decide whether branch-specific UAT should keep using the current stable main alias in invite URLs or whether a preview-specific base URL is needed for branch testing.
- [ ] Finish archive album/mobile QA now that sticky actions and the large viewer/lightbox are in place.
- [ ] Switch tree cards, side rails, archive tiles, and media galleries to preview variants by default and confirm legacy fallbacks.
- [ ] Run targeted QA for viewer, builder and members after the completed migration checkpoint.
- [ ] Review `Участники` end-to-end with invite, copy and revoke flows.
- [ ] Revisit landing and dashboard now as the next calm visual pass, but keep it below final access/UAT close-out if the two conflict.
- [ ] Close each concrete work cycle with `/fi`; completion now needs to keep manual memory sections current as well.

## Completion Capture

- Primary captured workstream: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Main tree-scoped visual-system migration checkpoint is now materially complete:
  archive, utility surfaces, builder/viewer media surfaces, and tree nav/canvas framing have all passed through the current visual pass.
- Hosted preview checkpoint is green on:
  `smoke:auth`,
  `smoke:e2e`,
  `smoke:media`,
  plus a logged-in route sweep across `viewer`, `builder`, `media`, `members`, `settings`, and `audit`.
- Cloudflare rollout checkpoint is stronger now:
  after remote migrations `20260320093000` and `20260320093100`, hosted `smoke:media:direct` confirms new file-backed media persist as `provider: cloudflare_r2`.
- Hosted invite-email checkpoint is now explicit:
  the hosted production alias returns `deliveryStatus=skipped` with `Resend пока не настроен...` while still creating a valid invite URL and surfacing it for manual copy.
- Current hosted invite URLs still point at the configured main alias rather than the branch preview URL, so branch-UAT should treat that as current env behavior, not as a runtime mystery.
- PR1 high-confidence review fixes are closed:
  direct browser upload no longer retries through proxy on user abort or 4xx signed-URL responses.
- PR1 signed HTTP transport coverage now fixes the regression contract around `win32` PowerShell fallback and repository-level `503` degradation.
- Shared dialog primitive no longer leaks English `Close` labels into Russian dialogs.
- Detected foundation: tree-level `Медиа` route, archive client, archive upload endpoints, and persisted album model are present in the worktree.
- Detected archive upload review flow with pending batch state and discard confirmation.
- Detected variant-aware media delivery foundation for photo previews (`thumb/small/medium`).
- Detected Cloudflare R2 foundation in env/runtime config and supporting project files.
- Latest `smoke:media:direct` artifact `media-storage-report-1773931536758.json` is green.
- Latest builder QA artifact `builder-qa-report-1773935157900.json` is green on the current canvas-first builder UI.
- Latest hosted browser-emulation UAT artifact `hosted-uat-report-1773940288310.json` is green for `builder`, `media`, `members`, and `viewer-share` on desktop/tablet/mobile.
- Latest hosted archive album/mobile artifact `archive-album-query-qa-1773942573971.json` is green for selected-album mobile view and mode switching.
- Latest hosted access-management artifact `hosted-access-uat-1773989564546.json` is green for `members`, invite/share-link clipboard flows, and invite acceptance.
- Latest local landing/dashboard calm-pass artifact `landing-dashboard-qa-pass/report.json` is green after the copy cleanup.
- Targeted regression signal is green on:
  `tests/upload-transport-contract.test.ts`,
  `tests/repository-signed-http.test.ts`,
  `tests/tree-media-archive-client.test.tsx`,
  `tests/builder-workspace.test.tsx`,
  `tests/person-media-gallery.test.tsx`.

## Runtime Rules

- Server-side Supabase transport is `native-first`: `lib/supabase/admin-rest.ts` and `lib/supabase/server-fetch.ts` should prefer native Node fetch and use the PowerShell bridge only as fallback or explicit override.
- Tree pages should not default to `getTreeSnapshot(...)`: `audit`, `members`, `media`, and `settings` now rely on specialized repository page-data loaders, while full snapshots remain for real snapshot consumers such as viewer and snapshot APIs.
- Project helper commands under `.codex/commands/*.sh` require a real Bash runtime; on Windows this means Git Bash or WSL with an installed distro, not the bare WSL stub.
- Tree pages should prefer specialized repository page-data loaders over full snapshots unless rendering truly needs the whole snapshot contract.
- Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.

