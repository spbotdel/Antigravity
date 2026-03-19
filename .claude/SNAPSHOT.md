# SNAPSHOT — Antigravity

*Operational memory only. Not the canonical architecture document.*

*Last updated: 2026-03-20*

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
- [ ] Finish the remaining calm pass after migration: landing/dashboard rhythm, any last low-risk copy cleanup, and residual layout polish.
- [ ] Validate `Участники`, invites and share links as one coherent access-management flow in final hosted UAT, not only smoke.
- [ ] QA the reworked builder layout so the tree keeps visual priority on desktop and mobile.
- [ ] Keep startup context, task capsules and memory files aligned with the current sprint.

## Active Blockers

- [ ] Current media upload UX is smoke-green and hosted regression-green, but still needs explicit human QA close-out for archive album/mobile/end-to-end confidence.
- [ ] Cloudflare target foundations and explicit provider metadata are now green on hosted smoke, but the broader migration close-out is still incomplete while legacy reads and release/UAT hardening remain open.
- [ ] Preview variant foundations exist and the main surfaces now use them, but final rollout QA is still incomplete; originals should not leak back into archive/viewer/builder previews.
- [ ] The tree-level family archive now has sticky actions, large viewer/lightbox, calmer review flow, and visible tile copy, but broader album/mobile/end-to-end QA is still unfinished.
- [ ] Builder canvas resize and overlay inspector now pass the current smoke checkpoint, but still need practical QA on desktop, tablet and mobile widths.
- [ ] Members/invite/share-link flows are smoke-green and hosted route-green, but still need explicit live UAT against clipboard and perceived-speed behavior.
- [ ] Manual memory notes must stay aligned with the actual workstream after each `/fi`.
- [ ] Landing/dashboard cleanup is now the next visual follow-up, but it remains secondary to final access/UAT close-out.

## Next Steps

- [ ] Convert the Cloudflare target into an explicit migration sequence: rollout gating, direct upload, Stream, and Queues.
- [ ] Probe hosted invite-email readiness and pin down whether `Resend` sender/domain remains the next external blocker.
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
- PR1 high-confidence review fixes are closed:
  direct browser upload no longer retries through proxy on user abort or 4xx signed-URL responses.
- PR1 signed HTTP transport coverage now fixes the regression contract around `win32` PowerShell fallback and repository-level `503` degradation.
- Shared dialog primitive no longer leaks English `Close` labels into Russian dialogs.
- Detected foundation: tree-level `Медиа` route, archive client, archive upload endpoints, and persisted album model are present in the worktree.
- Detected archive upload review flow with pending batch state and discard confirmation.
- Detected variant-aware media delivery foundation for photo previews (`thumb/small/medium`).
- Detected Cloudflare R2 foundation in env/runtime config and supporting project files.
- Latest `smoke:media` artifact `media-storage-report-1773924934314.json` is green.
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

