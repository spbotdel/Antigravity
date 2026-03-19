# BACKLOG — Antigravity

*Operational task backlog only.*

*Updated: 2026-03-19*

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
- remaining next-step work has shifted from local correctness to hosted validation on `Vercel`

## Wave 2 — Hosted Validation And Email

- [x] Deploy hosted staging on `Vercel`
- [ ] Disable `DEV_IMPERSONATE_*` on staging and use hosted env as the truth surface for auth, invite/share-link behavior, and perceived speed
- [x] Update hosted `NEXT_PUBLIC_SITE_URL` to the actual stable `Vercel` URL used for UAT links
- [x] Apply the new share-link reveal migration remotely so hosted reveal works without fallback
- [ ] Run hosted UAT for `Owner EU`, `Helper RF`, and `Relative RF`
- [x] Add invite email delivery via `Resend` with manual-copy fallback
- [ ] Finish `Resend` sender/domain setup and add `RESEND_FROM_EMAIL` plus optional `INVITE_EMAIL_REPLY_TO` to hosted env
- [ ] Review staged UAT findings and fix any release-blocking defects

Operational note:
- app hosting target is now `Vercel`
- `Cloudflare R2` is already client-owned and remains the storage plane
- `Resend` sender/domain should be prepared directly on client-owned data
- hosted validation URL is currently the `main` branch alias on `Vercel`
- for real unauthenticated/manual UAT use the public production alias:
  `https://antigravity-zeta-two.vercel.app`
- hosted smoke signal is already green on:
  - `SMOKE_BASE_URL=https://antigravity-zeta-two.vercel.app npm run smoke:auth`
  - `SMOKE_BASE_URL=https://antigravity-zeta-two.vercel.app npm run smoke:e2e`
  - hosted `smoke:e2e` now covers reveal/copy of an already created family share link after the remote migration

## Launch-Critical

- [ ] Complete a full database backup/restore rehearsal on a machine or environment with `pg_dump` / `psql` or a safe staging target
- [ ] Update the final launch decision notes after staged UAT and recovery checks are complete
- [ ] Keep startup memory and launch docs aligned with the actual execution order

## Wave 3 — Visual System

- [ ] Add `Tailwind + shadcn/ui` foundation
- [ ] Migrate shared primitives: buttons, inputs, selects, textareas, dialogs, tabs, cards
- [ ] Bring the remaining custom builder/media/member surfaces to the same visual language without forcing the canvas onto stock components

## Active Sprint

### High Priority

- [x] Закрыть `docs/FIX_PLAN_PR1.md`: direct upload fallback сузить до network/timeout-only, закрепить signed-URL fallback contract тестами и локализовать shared dialog `Close`.
- [ ] Подтвердить, что единый upload для фото и видео с устройства, multi-file, progress и limits copy работают без остаточных регрессий.
- [ ] Дожать Cloudflare migration plan поверх уже добавленного R2 foundation: rollout, direct upload, `Stream` для видео и `Queues` для async jobs.
- [ ] Довести уже созданный tree-level раздел `Медиа`: sticky actions, большой viewer/lightbox, upload/album QA и спокойные empty states.
- [ ] Довести variant architecture до green regression: `thumb/small/medium` должны стабильно использоваться в archive/viewer/builder, а оригинал открываться только явно.
- [ ] Довести текущий media UX pass: спокойнее copy, чище empty states, понятнее gallery/viewer в builder и viewer.
- [ ] Завершить текущий pass по `family-tree-canvas`: age-aware avatars, fallback badge states, читаемость карточек и стабильное выделение выбранного узла в viewer и builder.
- [ ] Стабилизировать layout конструктора: resizable canvas shell, overlay inspector на desktop и предсказуемое поведение на tablet/mobile без потери приоритета дерева.
- [ ] Довести экран `Участники`: приглашения по аккаунту и read-only share links должны быть самодостаточными, с понятными подсказками, копированием ссылок и безопасным отзывом доступа.
- [ ] Провести целевой QA для builder/viewer/members, чтобы не было регрессий в партнерах, родителях, действиях над узлами и режимах доступа.
- [ ] Держать startup context, task capsules и memory-файлы актуальными: `.claude/BACKLOG.md` и `.claude/SNAPSHOT.md` должны отражать реальный workstream текущего цикла.

### Medium Priority

- [ ] После закрытия `FIX_PLAN_PR1` не расширять scope review-правок: следующий шаг только QA/archive/member flows, а не новый transport refactor.
- [ ] Вернуться к calm pass для landing и dashboard после стабилизации builder/members: сократить лишний copy, выровнять ритм заголовков и CTA.
- [ ] Добить единый light visual system для `Настройки`, `Журнал`, `Участники`, builder и viewer.
- [ ] Проверить аватары и карточки дерева на кейсах без фото, с кириллицей в gender, с детьми и пожилыми, чтобы визуальные fallback-и были предсказуемыми.
- [ ] Уточнить, какие из новых проектных документов должны оставаться обязательным startup context, а какие достаточно держать как справочные.
- [ ] Подготовить следующий smoke cycle после текущих UI правок и обновления memory-файлов.

### Low Priority

- [ ] Добавлять motion-акценты только после стабилизации canvas/layout/access flows.
- [ ] Возвращаться к бренд-деталям landing только если это не конфликтует с коротким utilitarian тоном продукта.

