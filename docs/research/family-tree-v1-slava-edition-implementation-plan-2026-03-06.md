# Family Tree V1.0 "Slava Edition" Implementation Plan (2026-03-06)

<!-- FRAMEWORK:IMPLEMENTATION:START -->
## Current Implementation Sync

- Updated at (UTC): `2026-03-12 18:00:28Z`
- Workstreams `A-D` are largely materialized in the repo; the active launch-critical sequence is now rollout + regression + UAT + recovery rehearsal.
- Active implementation stream: `Media Upload Flow V2` from `tasks/active/media-upload-flow-v2` (`in_progress`).
- Tree-level archive foundation is present in the repo.
- Preview-variant delivery foundation is present in the repo.
- `Cloudflare R2` rollout foundation is present in env/runtime config and smoke coverage.

### Current Launch Gaps

- Mandatory `Cloudflare R2` rollout still needs gated verification, activation, and post-activation close-out.
- Live `EU + RF` UAT is still a launch gate.
- Backup/restore rehearsal and final launch checklist remain part of release readiness.
- Archive/viewer/builder/members regression after rollout activation still needs explicit close-out.
- Preview-variant rollout still needs regression confirmation across archive/viewer/builder.

### Current Execution Order

1. Verify gated `Cloudflare R2` readiness: `CF_R2_*`, bucket CORS, upload-intent metadata, `smoke:media`, and `smoke:media:direct`.
2. Activate rollout and confirm `resolvedUploadBackend=cloudflare_r2` for new uploads.
3. Run post-activation regression for archive/viewer/builder/members, preview variants, and legacy Yandex-backed reads.
4. Run live UAT for owner `EU`, helper `RF`, and read-only relative `RF`.
5. Complete backup/restore rehearsal and the final launch checklist before release decision.
<!-- FRAMEWORK:IMPLEMENTATION:END -->

## 1. Цель документа

1. Этот документ переводит `Slava edition` из product-рамки в исполнимый план.
2. Фокус - production-ready family product для одного владельца и его родственников.
3. План не пытается закрыть весь будущий mass-market scope.

## 2. Целевой сценарий V1

### 2.1 Кто и как пользуется продуктом

1. `Slava` - владелец дерева.
2. Часть родственников получает read-only доступ по ссылке.
3. Часть родственников получает приглашение и может помогать редактировать дерево и догружать медиа.
4. Все это должно работать между Европой и РФ.

### 2.2 Что V1 должен уметь в реальной жизни

1. Владелец заводит и правит дерево сам.
2. Владелец отправляет родственнику ссылку на просмотр без ручного участия разработчика.
3. Владелец приглашает 1-2 помощников, которые могут редактировать дерево и загружать семейные фото/видео/документы.
4. Медиа не завязаны на публичные consumer-links.
5. Владелец может поддерживать систему после запуска без постоянной техподдержки.

## 3. Текущая база проекта

### 3.1 Что уже есть

1. `Next.js + TypeScript + Supabase`.
2. Модель `one tree per owner`.
3. Роли `owner/admin/viewer`.
4. Invite flow и family share-link flow.
5. Builder, viewer, members, settings и audit как отдельные рабочие экраны.
6. Unified private media foundation для `photo/video/document`.
7. Tree-level `Медиа` archive с albums, sticky actions и large viewer/lightbox.
8. Preview-variant foundation для `thumb/small/medium`.
9. `Cloudflare R2` env/runtime foundation с rollout metadata и отдельным `smoke:media:direct` path.

### 3.2 Что сейчас является gap для V1

1. Обязательный `Cloudflare R2` rollout для новых upload еще не активирован и не закрыт как steady-state production path.
2. Post-activation regression для archive/viewer/builder/members и preview variants еще не закрыт.
3. Live UAT между Европой и РФ еще не зафиксирован как complete.
4. Backup/restore rehearsal и финальный launch checklist еще не закрыты.

## 4. Архитектурные решения для исполнения

### 4.1 Access model

1. Оставляем роли `owner/admin/viewer`.
2. Вводим два канала доступа:
- `invite-based collaboration` для аккаунтов с ролями,
- `share-link access` для read-only family viewing.
3. `admin` в V1 покрывает сценарий "родственник помогает и догружает медиа".
4. Если термин `admin` слишком тяжелый для UI, его можно показать как "Помощник", не меняя внутреннюю роль.

### 4.2 Relationship model

1. Оставляем `parent-child` и `partnership`.
2. Поддержку нескольких партнерств делаем production-ready уже сейчас.
3. Сложные subtype родства в V1 не добавляем.
4. Связь остается отдельной сущностью, а не полем карточки персоны.

### 4.3 Media model

1. Цель V1 - единый приватный pipeline для `photo/video/document`.
2. Хранение:
- object storage как binary layer,
- metadata и ACL в приложении,
- signed URL для выдачи.
3. Для текущего `Slava edition` обязательный launch path для новых upload - `Cloudflare R2`.
4. Текущий Yandex-backed path остается transitional compatibility/read path для уже загруженных объектов до явного завершения migration.
5. Storage должен быть скрыт за adapter-слоем.
6. `Cloudflare Stream`, `Queues` и self-managed `FFmpeg/HLS` остаются deferred, пока `R2/private delivery` не упирается в реальные проблемы.

### 4.4 Privacy model

1. В V1 главная защита - private-by-default.
2. Доступ выдается только по ролям или управляемой ссылке.
3. Public SEO и массовая индексация в V1 отсутствуют.
4. Revoke links и revoke invites входят в обязательный scope.

## 5. Workstreams

## 5.1 Workstream A - Scope freeze и access policy

### Что нужно сделать

1. Зафиксировать в документации distinction:
- `invite link` для входа в роль,
- `share link` для read-only доступа.
2. Зафиксировать, кто именно может:
- просматривать,
- редактировать дерево,
- загружать медиа,
- приглашать других.
3. Определить UI-copy для ролей:
- оставить `admin`,
- или показать `Помощник` поверх текущей роли.

### Результат

1. Нет путаницы между публичным шарингом и семейным доступом.
2. Нет путаницы между read-only родственником и родственником-редактором.

## 5.2 Workstream B - Family collaboration core

### Что нужно сделать

1. Довести owner dashboard до ясного центра управления:
- кто имеет доступ,
- кого пригласить,
- какие ссылки активны.
2. Довести invite flow для `admin/viewer`.
3. Добавить share-link flow для read-only доступа.
4. Добавить revoke для share links.
5. Проверить audit trail на ключевые действия доступа.

### Acceptance criteria

1. Владелец за 1-2 минуты приглашает помощника.
2. Владелец за 1 клик копирует read-only ссылку.
3. Владелец может отозвать доступ без участия разработчика.

## 5.3 Workstream C - Core tree editing

### Что нужно сделать

1. Довести создание/редактирование/удаление персон.
2. Довести быстрые действия:
- добавить родителя,
- добавить ребенка,
- добавить партнера.
3. Довести работу с несколькими партнерствами.
4. Проверить валидации против циклов, дублей и очевидно битых структур.
5. Довести relation inspector и tree canvas до стабильного owner/admin UX.

### Acceptance criteria

1. Владелец может собрать дерево своей семьи без обходных путей.
2. Помощник с ролью `admin` может править дерево без непонятных состояний UI.
3. Несколько партнерств не ломают layout и логику данных.

## 5.4 Workstream D - Unified private media

### Что нужно сделать

1. Спроектировать единый media contract:
- media kind,
- storage key,
- mime,
- size,
- visibility/access,
- owner/uploader,
- person attachment.
2. Уйти от split-модели `photo private + video public link`.
3. Сделать единый flow:
- create upload intent,
- direct upload,
- complete upload,
- resolve media.
4. Ограничить допустимые размеры и типы для V1.
5. Продумать удаление файлов и orphan cleanup.
6. Проверить загрузку и просмотр из Европы и РФ.

### Acceptance criteria

1. И владелец, и помощник могут сами загружать файлы.
2. Read-only родственник не может загружать и редактировать.
3. Приватные медиа не светятся постоянными публичными URL.
4. Фото, видео и документы идут по одной архитектурной схеме.

## 5.5 Workstream E - Mandatory Cloudflare rollout

### Что нужно сделать

1. Проверить gated-конфигурацию:
- `CF_R2_*`,
- bucket CORS,
- upload-intent metadata,
- dev origin для `smoke:media:direct`.
2. Пройти `smoke:media` и `smoke:media:direct` перед activation.
3. Активировать rollout через `CF_R2_ROLLOUT_AT`.
4. Подтвердить, что новые upload идут в `cloudflare_r2`.
5. Подтвердить, что legacy Yandex-backed reads остаются рабочими.
6. Зафиксировать rollout state и recovery notes в operational docs.

### Acceptance criteria

1. Новые upload больше не зависят от legacy Yandex path.
2. Legacy Yandex-backed media остается читаемой в transition.
3. Rollout state наблюдаем в upload-intent и smoke artifacts, а не через ручные догадки.

## 5.6 Workstream F - Production hardening

### Что нужно сделать

1. Подготовить production env.
2. Проверить backup/restore процедуры.
3. Настроить минимум operational visibility:
- error logging,
- health visibility,
- smoke checks.
4. Пройти UAT:
- владелец из Европы,
- помощник из РФ,
- read-only родственник по ссылке.
5. Подготовить owner playbook:
- как приглашать,
- как отзывать доступ,
- как добавлять людей,
- как загружать медиа,
- что делать при ошибке.

### Acceptance criteria

1. Есть рабочий launch checklist.
2. Есть понятный сценарий recovery.
3. Есть подтвержденная работа основных флоу в двух географиях.

## 6. Текущий порядок выполнения из состояния репозитория

1. Синхронизировать startup memory, operational docs и launch criteria вокруг обязательного `Cloudflare R2` rollout.
2. Закрыть gated verification для `Cloudflare R2`:
- env,
- CORS,
- upload-intent metadata,
- `smoke:media`,
- `smoke:media:direct`.
3. Активировать rollout и подтвердить `resolvedUploadBackend=cloudflare_r2`.
4. Пройти post-activation regression для archive/viewer/builder/members, variant delivery и legacy reads.
5. Пройти live UAT `EU + RF`.
6. Выполнить backup/restore rehearsal и финальный launch checklist.

Примечание:
1. Workstreams `A-D` уже в основном материализованы в текущем репозитории.
2. Текущая launch-critical последовательность теперь фактически `E -> F`.
3. `Cloudflare Stream` и `Queues` не должны размывать текущий execution order, пока `R2/private delivery` не доказан недостаточным.

## 7. Backlog по приоритетам

### P0 - must have до запуска

1. `Cloudflare R2` rollout активирован и подтвержден как steady-state upload path.
2. Legacy Yandex-backed reads продолжают работать в transition.
3. Owner/admin/viewer и invite/share-link flows стабилизированы на live API.
4. Archive/viewer/builder/members regression закрыт после activation.
5. Backup/restore rehearsal и UAT `EU + RF` завершены.

### P1 - желательно до запуска, но можно добивать в конце цикла

1. Улучшение copy и onboarding-подсказок для владельца.
2. Улучшение audit trail для действий доступа и медиа.
3. Полировка ошибок загрузки и пустых состояний.

### P2 - после запуска Slava edition

1. GEDCOM.
2. Merge duplicates.
3. Story pages.
4. Более тонкая privacy-модель.
5. Массовый customer onboarding.

## 8. Основные риски

1. Роль `admin` может оказаться слишком широкой для родственника, который должен только догружать медиа.
Mitigation: в V1 оставить модель как есть, но проверить в UAT; если боль подтверждается, следующим шагом проектировать `contributor`.

2. Share links могут создать риск лишнего распространения.
Mitigation: делать их read-only, revocable и unlisted-by-default.

3. Media migration может оказаться сложнее из-за текущей split-модели.
Mitigation: сначала выровнять media contract, затем переносить provider logic.

4. Кросс-региональная доступность может упереться не только в storage, но и в весь app stack.
Mitigation: проводить реальную проверку EU/RF до финального запуска.

## 9. Definition of Done для V1

1. Slava сам управляет деревом и доступами.
2. Родственники по ссылке читают дерево без техподдержки.
3. Выбранные помощники сами догружают медиа и помогают редактировать.
4. Приватные медиа больше не опираются на public-link workaround.
5. Новые upload идут через `Cloudflare R2`, а legacy Yandex-backed медиа остаются читаемыми в transition.
6. Система предсказуемо работает между Европой и РФ.
7. Есть эксплуатационный минимум для реального запуска.

## 10. Следующий практический шаг

1. Следующий практический шаг из текущего состояния репозитория:
- закрыть gated verification для `Cloudflare R2`
- активировать rollout
- пройти post-activation QA
- затем закрыть `EU + RF` UAT и backup/restore rehearsal
