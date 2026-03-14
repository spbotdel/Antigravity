# Family Tree V1.0 "Slava Edition" Engineering Backlog (2026-03-06)

<!-- FRAMEWORK:ENGINEERING:START -->
## Current Engineering Sync

- Updated at (UTC): `2026-03-13 13:55:00Z`
- Treat the historical phases below as reference coverage. The execution order in this sync block is the current engineering queue.
- Active engineering stream: `Post-UAT launch hardening` inside `Media Upload Flow V2` (`in_progress`).

### Current Wave Order

1. `Wave 1` - access correctness, share-link reveal, and the builder/media/archive cleanup from the live pass.
2. `Wave 2` - hosted validation on `Vercel`, real staged UAT, and finalizing live invite email delivery through `Resend`.
3. `Wave 3` - `shadcn` / unified visual-system migration after launch-critical fixes and hosted validation.

### Current Immediate Order

1. Keep the local Wave 1 baseline green while switching validation to hosted `Vercel`.
2. Fix hosted env details:
- stable `NEXT_PUBLIC_SITE_URL`
- `DEV_IMPERSONATE_*` absent
- final `Resend` sender vars
3. Apply the new share-link reveal migration remotely.
4. Run staged `Owner EU / Helper RF / Relative RF` validation and record perceived speed from the hosted URL.
5. Complete backup/restore rehearsal and the final launch checklist before release decision.

### Current P0 Gaps

- Local `next dev` with `DEV_IMPERSONATE_*` is not a trustworthy surface for real invite-role or performance conclusions.
- Hosted `Vercel` is live, but generated hosted links still need the final stable `NEXT_PUBLIC_SITE_URL`.
- Remote Supabase still needs the reveal migration if hosted share-link reveal should work without fallback.
- `Resend` domain verification is still pending, so live email delivery is not fully closed.
- Hosted `EU + RF` UAT is still a launch gate.
- Backup/restore rehearsal and final launch checklist remain part of release readiness.

### Current Validation Baseline

- `.claude/*` files are auto-synced during `completion`; this is the canonical automatic state path.
- `README.md`, operational docs, and the main `Slava edition` plan docs reflect current runtime/launch state only if completion owns an explicit sync path for them; operational docs and plan docs are now covered by that sync.
- Local validation is green on `npm test`, `npm run build`, `npm run smoke:media`, `npm run smoke:auth`, and `npm run smoke:e2e`.
- Hosted `Vercel` deployment for the latest `main` commit is live at the branch alias:
  `https://antigravity-git-main-spbotdel-4945s-projects.vercel.app`
<!-- FRAMEWORK:ENGINEERING:END -->

## 1. Цель

1. Этот документ раскладывает `Slava edition` в инженерный backlog по текущему репозиторию.
2. Фокус - довести продукт до production-ready состояния для одной семьи:
- владелец в Европе,
- родственники в РФ,
- часть родственников только смотрит дерево по ссылке,
- часть родственников помогает редактировать и догружать медиа.
3. Бэклог ориентирован на текущую кодовую базу `Next.js + Supabase`, а не на greenfield-переписывание.

## 2. Подтвержденный baseline репозитория

### 2.1 Что уже есть

1. Схема дерева, персон, связей, участников, инвайтов, аудита и медиа: `supabase/migrations/20260301193000_family_tree_v1.sql`
2. Типы домена: `lib/types.ts`
3. Базовая permission model: `lib/permissions.ts`
4. Основная серверная логика: `lib/server/repository.ts`
5. API для дерева, участников, персон, связей, медиа и инвайтов: `app/api/**`
6. Viewer page: `app/tree/[slug]/page.tsx`
7. Builder page: `app/tree/[slug]/builder/page.tsx`
8. Members page: `app/tree/[slug]/members/page.tsx`
9. Settings page: `app/tree/[slug]/settings/page.tsx`
10. Панель участников: `components/members/member-management-panel.tsx`
11. Workspace редактора: `components/tree/builder-workspace.tsx`
12. Viewer UI: `components/tree/tree-viewer-client.tsx`
13. Tree-level media archive: `app/tree/[slug]/media/page.tsx` + `components/media/tree-media-archive-client.tsx`
14. Share-link API: `app/api/share-links/**`
15. Unified media routes and archive routes: `app/api/media/**`
16. `Cloudflare R2` rollout foundation in env/runtime config and smoke coverage

### 2.2 Что сейчас не закрывает V1

1. Обязательный `Cloudflare R2` rollout еще не активирован и не закрыт как steady-state upload path.
2. Post-activation regression для archive/viewer/builder/members и preview variants еще не закрыт.
3. Live UAT `EU + RF` еще не зафиксирован как complete.
4. Backup/restore rehearsal и launch checklist execution еще не закрыты.
5. Startup memory и operational docs должны оставаться синхронизированными с текущим launch path.

## 3. Ключевые инженерные решения V1

### 3.1 Access model

1. Не перегружать `trees.visibility`.
2. Не перегружать `tree_invites`.
3. Для V1 ввести отдельную сущность `tree_share_links` для read-only семейных ссылок.
4. `Invites` остаются identity-based доступом для ролей `admin/viewer`.
5. `Share links` становятся token-based read-only доступом без обязательного membership row.

### 3.2 Relationship model

1. Не усложнять child taxonomy в V1.
2. Оставить `parent-child` и `partnership`.
3. Поддержку нескольких партнерств сделать production-ready.
4. Вся логика связи остается edge-based.

### 3.3 Media model

1. Уйти от split-модели `photo private + video public link`.
2. Привести `photo/video/document` к одному upload/access contract.
3. Binary layer вынести в object storage через adapter.
4. `Cloudflare R2` rollout для новых upload считать обязательной частью `Slava edition`.
5. Yandex-backed path считать transitional compatibility/read path для already-uploaded assets до явного закрытия migration.

### 3.4 Текущий execution order из состояния репозитория

1. Wave 1 локально:
- исправить invite acceptance так, чтобы существующая membership не понижалась
- закрыть потерю owner-only вкладок после invite flow
- добавить reveal/copy UX для family share links
- применить согласованный builder/media/archive cleanup из живого прохода
2. Поднять hosted staging:
- `OpenNext -> Cloudflare Workers`
- без `DEV_IMPERSONATE_*`
- с отдельными тестовыми аккаунтами и staging URL как truth surface
3. Пройти hosted UAT:
- owner `EU`
- helper `RF`
- read-only relative `RF`
- зафиксировать реальные speed/auth observations именно с staging
4. Добавить email delivery:
- `Resend`
- текущие app-level invite URLs остаются source of truth
- manual-copy fallback остается обязательным
5. После staged validation выполнить backup/restore rehearsal и final launch checklist.

## 4. Бэклог по этапам

Phases `A-D` below are now largely implemented in the current repository. For the actual next-step execution order, use section `3.4` first.

## 4.1 Phase A - Access foundation

### A1. Ввести `tree_share_links`

**Что сделать**
1. Добавить новую таблицу `tree_share_links` в новой миграции.
2. Поля минимум:
- `id`,
- `tree_id`,
- `label` или `note`,
- `token_hash`,
- `created_by`,
- `expires_at`,
- `revoked_at`,
- `last_accessed_at`,
- `created_at`.
3. Добавить RLS/policies так, чтобы создавать и отзывать ссылки могли `owner/admin`.

**Файлы**
1. `supabase/migrations/*_tree_share_links.sql`
2. `lib/types.ts`

**Acceptance**
1. Таблица не смешивается с `tree_invites`.
2. Ссылки можно создавать и отзывать независимо от membership invite flow.

### A2. Расширить runtime actor для share-link access

**Что сделать**
1. Расширить `ViewerActor`, чтобы сервер различал:
- membership access,
- share-link access,
- anonymous access.
2. Не полагаться только на `tree.visibility === public`.
3. Описать capability-set для share-link viewer:
- читать дерево,
- читать разрешенные медиа,
- не редактировать,
- не управлять участниками,
- не читать аудит.

**Файлы**
1. `lib/types.ts`
2. `lib/permissions.ts`
3. `lib/server/repository.ts`

**Acceptance**
1. Share-link actor не создает membership row.
2. Share-link actor ведет себя как read-only viewer, но без edit privileges.

### A3. Добавить API и server-flow для share links

**Что сделать**
1. Добавить API для:
- создания share link,
- listing share links,
- revoke share link.
2. Выдавать готовый URL для родственников.
3. Поддержать в snapshot/server load валидный share token.

**Рекомендуемые новые route handlers**
1. `app/api/share-links/route.ts`
2. `app/api/share-links/[shareLinkId]/route.ts`

**Файлы**
1. `lib/server/repository.ts`
2. `app/api/share-links/route.ts`
3. `app/api/share-links/[shareLinkId]/route.ts`
4. `app/tree/[slug]/page.tsx`
5. `app/api/tree/[slug]/snapshot/route.ts`

**Acceptance**
1. Владелец может создать read-only ссылку.
2. Владелец может отозвать ссылку.
3. Read-only родственник открывает дерево по ссылке без login/invite flow.

## 4.2 Phase B - Family collaboration UI

### B1. Расширить экран участников

**Что сделать**
1. На `members` экране показать две отдельные секции:
- `Приглашения для участников`,
- `Ссылки для семейного просмотра`.
2. Для share links показать:
- label,
- срок действия,
- статус,
- кнопки `Скопировать`, `Отозвать`.
3. Не смешивать share links с membership invites в одном списке.

**Файлы**
1. `components/members/member-management-panel.tsx`
2. `app/tree/[slug]/members/page.tsx`
3. `app/globals.css`

**Acceptance**
1. Владелец понимает разницу между пригласить редактора и отправить read-only ссылку.
2. Все действия делаются с одного экрана без ручных обходов.

### B2. Привести terminology к семейному сценарию

**Что сделать**
1. Проверить, не слишком ли тяжело звучит `Администратор` для родственника-помощника.
2. При необходимости оставить внутреннюю роль `admin`, но показывать в UI более мягкий label.
3. Проверить copy на экранах `members`, `dashboard`, `builder`.

**Файлы**
1. `components/members/member-management-panel.tsx`
2. `components/dashboard/*`
3. `lib/ui-text.ts`
4. `app/globals.css` при необходимости

**Acceptance**
1. Тексты не звучат как B2B admin-panel.
2. Владелец легко понимает, кого и на каких правах он добавляет.

## 4.3 Phase C - Core tree editing hardening

### C1. Довести builder flow до owner/admin-ready состояния

**Что сделать**
1. Проверить CRUD персон.
2. Проверить быстрые действия:
- добавить родителя,
- добавить ребенка,
- добавить партнера.
3. Проверить удаление связей.
4. Проверить сценарии нескольких партнерств.
5. Убрать UX-шероховатости, которые мешают owner/admin use.

**Файлы**
1. `components/tree/builder-workspace.tsx`
2. `components/tree/family-tree-canvas.tsx`
3. `app/api/persons/route.ts`
4. `app/api/persons/[personId]/route.ts`
5. `app/api/relationships/parent-child/route.ts`
6. `app/api/relationships/parent-child/[linkId]/route.ts`
7. `app/api/partnerships/route.ts`
8. `app/api/partnerships/[id]/route.ts`
9. `lib/server/repository.ts`

**Acceptance**
1. Owner/admin могут вести дерево без участия разработчика.
2. Несколько партнерств не ломают UI и layout.
3. Ошибки валидации предсказуемы и объяснимы.

### C2. Зафиксировать V1 relationship constraints

**Что сделать**
1. Не добавлять child subtype taxonomy в текущий цикл.
2. Проверить, достаточно ли текущих constraints для нескольких партнерств.
3. Отдельно отметить будущую доработку, если uniqueness rules будут мешать расширению модели дальше.

**Файлы**
1. `supabase/migrations/20260301193000_family_tree_v1.sql`
2. `lib/types.ts`
3. `lib/validators/relationship.ts`

**Acceptance**
1. V1 не тащит лишнюю сложность.
2. При этом базовая relationship architecture не портится.

## 4.4 Phase D - Unified private media

### D1. Расширить media domain model

**Что сделать**
1. Добавить `document` в `MediaKind`.
2. Ослабить жесткую привязку `photo -> supabase_storage`, `video -> yandex_disk`.
3. Добавить более общую storage model:
- provider,
- object key / storage path,
- optional external url только как legacy/fallback, а не primary path.

**Файлы**
1. `supabase/migrations/*_unified_media_v1.sql`
2. `lib/types.ts`
3. `lib/validators/media.ts`

**Acceptance**
1. Схема БД допускает фото, видео и документы по одной модели.
2. Домен больше не требует public video link как основной сценарий.

### D2. Ввести generic upload pipeline

**Что сделать**
1. Спроектировать общий набор операций:
- `create-upload-intent`,
- `complete-upload`,
- `resolve-media`,
- `delete-media`.
2. Сохранить backward compatibility на время перехода или сразу перевести UI, если объем изменений разумный.
3. Вынести object-storage работу в adapter/helper слой.

**Файлы**
1. `lib/server/repository.ts`
2. `app/api/media/photos/upload-url/route.ts`
3. `app/api/media/photos/complete/route.ts`
4. `app/api/media/videos/route.ts`
5. `app/api/media/[mediaId]/route.ts`
6. новые generic routes при необходимости:
- `app/api/media/upload-intent/route.ts`
- `app/api/media/complete/route.ts`

**Acceptance**
1. Фото, видео и документы идут через одну архитектурную схему.
2. Viewer/share-link user получает только signed read access.
3. В UI нет обязательной формы "вставьте ссылку Яндекс Диска".

### D3. Перевести builder/viewer UI на unified media

**Что сделать**
1. В builder заменить split UX `фото upload + видео link` на единый media flow.
2. Поддержать отображение `photo/video/document` в viewer.
3. Ограничить допустимые mime types и file size для V1.

**Файлы**
1. `components/tree/builder-workspace.tsx`
2. `components/tree/tree-viewer-client.tsx`
3. `lib/ui-text.ts`
4. `app/globals.css`

**Acceptance**
1. Помощник семьи может сам догрузить файл.
2. Read-only родственник может только смотреть разрешенное.
3. Media UX в builder и viewer выглядит как одна система, а не три разных сценария.

## 4.5 Phase E - Production hardening

### E1. Audit и revoke semantics

**Что сделать**
1. Логировать создание и отзыв share links.
2. Логировать ключевые membership actions.
3. Проверить, нужно ли логировать чтение по share link как access-событие или достаточно `last_accessed_at`.

**Файлы**
1. `lib/server/repository.ts`
2. `lib/audit-presenter.ts`
3. `tests/audit-presenter.test.ts`

**Acceptance**
1. Владелец видит, кто и какой доступ открыл или отозвал.
2. Audit не превращается в шумовой поток.

### E2. Проверки EU + RF

**Что сделать**
1. Пройти реальный UAT:
- owner из Европы,
- helper из РФ,
- read-only relative из РФ.
2. Проверить:
- login/invite,
- share link,
- upload media,
- view media,
- builder/viewer.
3. Зафиксировать operational notes по фактической доступности.

**Файлы**
1. `tests/smoke-e2e.mjs`
2. `tests/auth-smoke-e2e.mjs`
3. возможно новые e2e:
- `tests/share-links-e2e.mjs`
- `tests/unified-media-e2e.mjs`

**Acceptance**
1. Основные сценарии подтверждены живой проверкой между двумя географиями.
2. Не остается неподтвержденных assumptions про доставку медиа.

### E3. Backup и launch checklist

**Что сделать**
1. Зафиксировать backup/restore процедуру.
2. Зафиксировать env checklist для production.
3. Зафиксировать owner playbook:
- как пригласить помощника,
- как создать ссылку для родственника,
- как отозвать доступ,
- как загрузить медиа.

**Файлы**
1. `docs/research/*` или новый operational doc
2. `README.md` при необходимости короткого operational supplement

**Acceptance**
1. У владельца есть понятная эксплуатационная инструкция.
2. Продукт можно реально запускать, а не только демонстрировать локально.

## 5. Тестовый план по репозиторию

### Unit / model

1. `tests/permissions.test.ts`
- добавить share-link actor cases
- пересмотреть `canViewTree` / `canSeeMedia`
2. `tests/validators.test.ts`
- добавить unified media validators
3. `tests/tree-display.test.ts`
- проверить отображение новых media kinds

### Integration / component

1. `tests/dashboard-overview.test.tsx`
- проверить family collaboration copy, если затронется dashboard
2. `tests/family-tree-canvas.test.tsx`
- проверить, что изменения relationship flows не ломают builder

### E2E / smoke

1. `tests/smoke-e2e.mjs`
- расширить на share-link flow
2. `tests/auth-smoke-e2e.mjs`
- обновить под unified media flow
3. новые e2e:
- share link create/open/revoke
- admin upload media
- read-only relative cannot edit/upload

## 6. Приоритеты

### P0 - блокирует запуск

1. `Cloudflare R2` rollout activation и подтверждение steady-state upload path
2. provider-aware legacy Yandex reads после activation
3. post-activation regression для archive/viewer/builder/members
4. live UAT `EU + RF`
5. backup/restore rehearsal и launch checklist

### P1 - желательно в том же цикле

1. UI-copy полировка для семейного сценария
2. audit polish
3. owner playbook

### P2 - после запуска Slava edition

1. GEDCOM
2. merge duplicates
3. story pages / public SEO sharing
4. contributor role, если `admin` окажется слишком широкой
5. field-level privacy engine

## 7. Предлагаемый порядок реализации

1. Сначала section `3.4` как текущий launch order
2. Затем использовать historical phases `A-E` только как reference для проверки покрытия

Примечание:
1. Historical phases ниже полезны для навигации по коду и тестам, но не как текущий day-to-day launch plan.
2. Текущий day-to-day plan теперь определяется Cloudflare activation, post-activation QA и live UAT.

## 8. Definition of Done

1. Владелец сам ведет дерево.
2. Владелец сам приглашает помощников.
3. Владелец сам отправляет родным read-only ссылки.
4. Помощник сам загружает медиа и помогает редактировать.
5. Read-only родственник не может случайно редактировать дерево.
6. Медиа не завязаны на public Yandex Disk workaround.
7. Новые upload идут через `Cloudflare R2`, а legacy Yandex-backed медиа остаются читаемыми в transition.
8. Основные сценарии подтверждены между Европой и РФ.
