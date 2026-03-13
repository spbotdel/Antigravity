# Family Tree V1.0 "Slava Edition" Launch and UAT Checklist (2026-03-06)

<!-- FRAMEWORK:LAUNCH:START -->
## Current Launch Sync

- Updated at (UTC): `2026-03-13 07:30:00Z`
- Launch is currently blocked by post-UAT hardening, hosted validation, and recovery checks.
- Current execution order:
1. Implement Wave 1 fixes locally: access correctness, share-link reveal, and the main builder/media/archive blockers from the live pass.
2. Deploy hosted staging and disable `DEV_IMPERSONATE_*` there.
3. Run staged UAT for owner `EU`, helper `RF`, and read-only relative `RF`, including perceived speed observations from staging.
4. Add invite email delivery via `Resend` with manual-copy fallback.
5. Complete backup/restore rehearsal and the final launch checklist before release decision.

### Current Validation Signal

- `.claude/*` files are auto-synced during `completion`; this is the canonical automatic state path.
- `README.md`, operational docs, and the main `Slava edition` plan docs reflect current runtime/launch state only if completion owns an explicit sync path for them; operational docs and plan docs are now covered by that sync.
- Latest `smoke:media` artifact `media-storage-report-1773322585848.json` is green.
- Broad `smoke:e2e` still needs a clean confirmation cycle in the current environment.
<!-- FRAMEWORK:LAUNCH:END -->

## 1. Цель

1. Этот документ нужен перед private production launch.
2. Его задача - собрать минимальный checklist запуска без лишнего process overhead.
3. Для текущего состояния проекта launch считается заблокированным, пока не закрыты post-UAT hardening, hosted validation и recovery checks.

## 2. Технический pre-launch

### 2.1 Базовая конфигурация

1. Проверены production env values.
2. Проверен `NEXT_PUBLIC_SITE_URL`.
3. Проверен server role key.
4. Проверены storage credentials для активного production path.

### 2.1.1 Hosted validation surface

1. Реальные invite/share-link/auth проверки должны оцениваться с hosted staging, а не с локального `next dev`.
2. На staging `DEV_IMPERSONATE_*` должен быть выключен.
3. Perceived speed и route latency для release decision фиксируются со staging URL, а не с `localhost:3000`.

### 2.2 Cloudflare rollout readiness

1. `MEDIA_STORAGE_BACKEND=cloudflare_r2`.
2. Проверены:
- `CF_ACCOUNT_ID`
- `CF_R2_BUCKET`
- `CF_R2_ACCESS_KEY_ID`
- `CF_R2_SECRET_ACCESS_KEY`
- `CF_R2_ENDPOINT`
3. Bucket CORS настроен для browser direct upload.
4. До activation подтвержден gated state:
- `configuredBackend=cloudflare_r2`
- `resolvedUploadBackend=object_storage`
- `rolloutState=cloudflare_rollout_gated`
5. Перед activation зеленые:
- `npm run smoke:media`
- `npm run smoke:media:direct`

### 2.3 Rollout activation / steady-state confirmation

1. `CF_R2_ROLLOUT_AT` переведен в текущее UTC-время или убран.
2. После activation подтвержден active state:
- `resolvedUploadBackend=cloudflare_r2`
- `rolloutState=cloudflare_rollout_active`
3. Новые upload действительно идут в `cloudflare_r2`.
4. Legacy Yandex-backed media продолжает читаться.

### 2.4 База и миграции

1. Все нужные миграции применены.
2. Есть backup перед launch.
3. Таблицы для:
- `tree_memberships`,
- `tree_invites`,
- `tree_share_links`,
- `media_assets`,
- `person_media`,
- `tree_media_albums`
  находятся в ожидаемом состоянии.

### 2.5 Smoke на код

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run smoke:auth`
5. `npm run smoke:media`
6. Широкий `smoke:e2e` либо зеленый, либо его отсутствие зафиксировано как отдельный operational risk с понятной заменой coverage.

## 3. Product UAT

### 3.1 Владелец из Европы

1. Входит в систему.
2. Открывает builder.
3. Добавляет человека.
4. Добавляет связь.
5. Загружает фото через вкладку `Фото`.
6. Загружает видео через вкладку `Видео`.
7. Загружает документ через вкладку `Инфо`.
8. Открывает tree-level раздел `Медиа`, создает или выбирает альбом и загружает файл в архив.
9. Создает приглашение.
10. Создает семейную ссылку.
11. Отзывает семейную ссылку.

### 3.2 Помощник из РФ

1. Принимает приглашение.
2. Входит в дерево.
3. Открывает builder.
4. Может редактировать дерево.
5. Может загружать person media.
6. Может загружать в tree-level archive.
7. Не может управлять тем, что не должен по роли.

### 3.3 Read-only родственник из РФ

1. Открывает семейную ссылку.
2. Видит дерево без логина.
3. Видит разрешенные файлы.
4. Может открыть archive/media view, но без edit affordances.
5. Не попадает в builder как editor.
6. После revoke ссылки больше не открывает дерево.

### 3.4 Practical UAT Packet

Использовать как один короткий ручной сценарий, а не как свободную прогулку по продукту.

#### Подготовка

1. Нужны три отдельные сессии:
- `Owner EU`
- `Helper RF`
- `Relative RF`
2. Лучше использовать три отдельных browser profile / incognito window, чтобы не смешивать cookies.
3. До старта зафиксировать:
- URL дерева,
- кто в какой роли входит,
- UTC-время начала UAT,
- какой device/browser используется.
4. Если шаг падает, фиксировать сразу:
- actor,
- точный URL,
- что нажали,
- что ожидали,
- что реально произошло,
- screenshot или screen recording.
5. Для финального UAT не использовать локальный `next dev`, если там включен `DEV_IMPERSONATE_*`.

#### Packet A — Owner EU

1. Войти в аккаунт владельца.
Ожидается: открывается `dashboard`, видно свое дерево.
2. Открыть viewer дерева.
Ожидается: дерево и текущие разрешенные media открываются без ошибки.
3. Открыть builder.
Ожидается: builder открывается как editor, можно выбрать человека и работать со схемой.
4. Добавить нового человека.
Ожидается: новый блок появляется в дереве и остается после refresh.
5. Добавить хотя бы одну связь через canvas (`родитель`, `ребенок` или `партнер`).
Ожидается: связь видна сразу и сохраняется после reload.
6. Во вкладке `Фото` загрузить фото.
Ожидается: review flow, успешное сохранение, фото видно в карточке и во viewer.
7. Во вкладке `Видео` загрузить локальное видео.
Ожидается: review flow, успешное сохранение, видео открывается.
8. Во вкладке `Инфо` загрузить документ.
Ожидается: документ появляется в списке и открывается отдельной ссылкой.
9. Открыть tree-level `Медиа`, создать или выбрать альбом и загрузить файл в архив.
Ожидается: файл появляется в archive surface, альбом/плитка открываются корректно.
10. В `Участники` создать приглашение для helper.
Ожидается: появляется invite link.
11. В `Участники` создать семейную ссылку для relative.
Ожидается: появляется share link.
12. Отозвать семейную ссылку.
Ожидается: link card показывает revoked state.
13. Открыть owner-only surfaces:
- `Журнал`
- `Настройки`
Ожидается: обе страницы доступны владельцу.
14. Проверить журнал.
Ожидается: видны события invite/share-link/media/person changes из этого же прохода.
15. Если invitation отправляется по email, проверить один из двух ожидаемых исходов:
- письмо ушло через `Resend`, или
- invite URL остался доступен для ручного copy/send fallback.

#### Packet B — Helper RF

1. Открыть invite link и принять приглашение.
Ожидается: после accept helper попадает в дерево.
2. Войти под helper account и открыть viewer.
Ожидается: дерево доступно по роли.
3. Открыть builder.
Ожидается: helper может редактировать дерево.
4. Изменить существующего человека или добавить нового.
Ожидается: изменение сохраняется и видно владельцу после reload.
5. Загрузить photo/video/document в person media.
Ожидается: upload проходит без owner workarounds.
6. Открыть tree-level `Медиа` и загрузить файл в archive.
Ожидается: archive upload проходит, файл виден в archive surface.
7. Проверить owner-only ограничения.
Ожидается:
- `Журнал` недоступен helper,
- `Настройки` недоступны, если в текущей role model это owner-only,
- helper не видит edit affordances сверх своей роли.

#### Packet C — Relative RF

1. Открыть семейную ссылку без логина.
Ожидается: viewer открывается как read-only.
2. Проверить дерево и несколько media.
Ожидается: разрешенные фото/видео/документы открываются.
3. Открыть tree-level `Медиа`.
Ожидается: archive surface читается, но без edit affordances.
4. Попробовать попасть в builder напрямую.
Ожидается: relative не получает editor access.
5. После revoke ссылки со стороны owner открыть тот же URL заново.
Ожидается: дерево больше не открывается по этой ссылке.

#### Правило завершения

1. UAT считается `pass`, если все три packet-сценария закрыты без необъяснимых сбоев.
2. Если сбой вызван сетью, это надо пометить отдельно как `operational issue`, а не смешивать с product bug.
3. После завершения сохранить короткий итог:
- кто проходил,
- из каких регионов,
- что прошло,
- что не прошло,
- какие URL/screenshots приложены.

### 3.5 One-Screen UAT Card

Использовать как короткую шпаргалку во время живого прохода.

#### Owner EU

- Войти в `dashboard` и открыть свое дерево.
- Открыть viewer и builder.
- Добавить человека и одну связь.
- Загрузить:
  `Фото` -> фото,
  `Видео` -> локальное видео,
  `Инфо` -> документ.
- Открыть tree-level `Медиа`, загрузить файл в архив или альбом.
- В `Участники`:
  создать invite,
  создать share link,
  отозвать share link.
- Открыть `Журнал` и `Настройки`.
- Проверить, что в журнале появились события текущего прохода.

#### Helper RF

- Открыть invite link и принять приглашение.
- Войти в дерево и открыть builder.
- Изменить человека или добавить нового.
- Загрузить хотя бы один файл в person media.
- Загрузить хотя бы один файл в tree-level archive.
- Проверить ограничения:
  нет owner-only действий,
  нет лишних edit affordances.

#### Relative RF

- Открыть семейную ссылку без логина.
- Проверить viewer дерева.
- Открыть несколько разрешенных media.
- Открыть tree-level `Медиа` в read-only режиме.
- Попробовать открыть builder напрямую.
  Ожидается: edit доступа нет.
- После revoke ссылки открыть тот же URL снова.
  Ожидается: дерево больше не открывается.

#### Pass / Fail

- `Pass`: все три роли проходят свой сценарий без необъяснимых сбоев.
- `Operational issue`: проблема вызвана сетью, регионом, DNS или сторонним сервисом.
- `Product bug`: повторяемая ошибка UI, access logic, media flow или tree behavior.

## 4. Access and privacy check

1. `viewer` не может редактировать.
2. `share-link` пользователь не может редактировать.
3. `admin` может помогать с деревом и файлами.
4. `owner` видит журнал и управляет доступами.
5. Person media и archive media не светятся неподходящим получателям.

## 5. Media and archive check

1. Фото открываются.
2. Видео открываются.
3. Документы открываются.
4. Tree-level archive открывается и фильтруется по режимам.
5. После activation новые upload приходят через `cloudflare_r2`.
6. Legacy Yandex-backed media по-прежнему читается.
7. Удаление файла работает.
8. После удаления не остается явно битого состояния в UI.

## 6. Audit and operational check

1. В журнале видно:
- создание приглашения,
- принятие приглашения,
- изменение роли,
- отзыв доступа,
- создание семейной ссылки,
- отзыв семейной ссылки,
- создание/удаление файла.
2. `last_accessed_at` по семейным ссылкам обновляется.
3. Ошибки на ключевых действиях отображаются пользователю.
4. При email-invite ошибке UI явно показывает fallback через ручное копирование ссылки.
5. Backup/restore rehearsal выполнен и задокументирован.

## 7. Network and geography check

1. Viewer и builder работают из Европы.
2. Viewer, invite flow и media reading работают из РФ.
3. Upload person media и archive media работает в требуемых сценариях.
4. Speed observations снимаются со staging, а не с локального dev runtime.
5. Если automated smoke не проходит из-за сети, это фиксируется как operational note, а не скрывается.

## 8. Launch decision rule

Запуск разрешен, если:
1. `Cloudflare R2` rollout активирован и подтвержден как steady-state upload path.
2. Владелец может сам вести дерево.
3. Помощник может реально помогать.
4. Родственник может читать дерево по ссылке.
5. Файлы работают по private delivery.
6. Email invite delivery либо работает через `Resend`, либо честно отрабатывает через ручной fallback без потери invite URL.
7. Есть backup/restore дисциплина.

Запуск откладывается, если:
1. `Cloudflare R2` rollout не активирован или не подтвержден.
2. Не подтвержден доступ из одной из географий.
3. Семейные ссылки ведут себя нестабильно.
4. Upload/read media ломается в реальном сценарии.
5. Hosted staging не подтверждает реальные auth/speed user paths.
6. Нет понятного recovery path.
