# Family Tree V1.0 "Slava Edition" Backup and Restore Runbook (2026-03-06)

<!-- FRAMEWORK:RECOVERY:START -->
## Current Recovery Sync

- Updated at (UTC): `2026-03-12 18:00:28Z`
- Active binary-plane assumptions:
  - new uploads must move to `Cloudflare R2` before release
  - legacy Yandex-backed media must remain readable until migration is explicitly closed
- Before any risky rollout step, capture a fresh backup before changing `CF_R2_ROLLOUT_AT`, storage policy, or bucket CORS.
- Restore rehearsal must verify both the active `Cloudflare R2` path and any still-readable legacy compatibility path.
- Runtime/config already exposes the `Cloudflare R2` foundation; backup notes must therefore track rollout state as operational data.
<!-- FRAMEWORK:RECOVERY:END -->

## 1. Цель

1. Этот документ фиксирует минимальную backup/restore дисциплину для `Slava edition`.
2. Цель не в enterprise DR, а в практической защите семейного архива.

## 2. Что нужно считать данными системы

1. Данные в базе:
- деревья,
- люди,
- связи,
- участники,
- приглашения,
- семейные ссылки,
- журнал действий,
- metadata медиа.
2. Файлы в storage:
- фото,
- видео,
- документы.
3. Во время текущего rollout учитывать два binary path:
- `Cloudflare R2` как целевой path для новых upload,
- legacy Yandex-backed path как transitional compatibility/read path для уже существующих объектов.
4. Конфигурация:
- `.env` / production secrets,
- настройки storage,
- URL продукта.

## 3. Минимальная стратегия backup для V1

### 3.1 База данных

1. Должен существовать регулярный экспорт или snapshot базы.
2. Хранить минимум:
- ежедневный backup,
- несколько последних точек восстановления,
- отдельную точку перед заметными миграциями.

### 3.2 Медиа-файлы

1. Storage-бакет должен считаться отдельным активом.
2. Backup метаданных без backup самих файлов недостаточен.
3. Для V1 достаточно:
- регулярной выгрузки списка объектов,
- проверки, что storage lifecycle не удаляет файлы неожиданно,
- отдельной процедуры восстановления бакета или его содержимого.
4. До полного закрытия migration нужно явно понимать:
- где лежит активный `Cloudflare R2` bucket,
- как читаются legacy Yandex-backed объекты,
- какой набор объектов еще не migrated и поэтому зависит от compatibility path.

### 3.3 Секреты и конфигурация

1. `SUPABASE_SERVICE_ROLE_KEY` и production env должны храниться отдельно от обычной пользовательской документации.
2. У владельца или оператора должен быть безопасный доступ к актуальным env values.

## 4. Когда делать контрольные точки

1. Перед миграциями БД.
2. Перед сменой storage-провайдера, bucket policy, CORS или rollout timestamp `CF_R2_ROLLOUT_AT`.
3. Перед крупными UI/permission changes.
4. Перед production rollout.

## 5. Что проверять после backup

1. Что backup действительно создается, а не только "должен создаваться".
2. Что файл/снимок можно открыть и он не пустой.
3. Что есть понятная дата backup.
4. Что хотя бы раз была проверена процедура restore на тестовом окружении.
5. Что покрыты оба актуальных media path:
- активный `Cloudflare R2`
- legacy compatibility path, если он еще нужен для чтения старых объектов

## 6. Минимальный restore-сценарий

### 6.1 Если потерялись записи в базе

1. Остановить спорные изменения и не усугублять состояние.
2. Определить точку, после которой данные стали неконсистентны.
3. Восстановить данные из ближайшего корректного backup.
4. Проверить:
- дерево открывается,
- люди и связи читаются,
- роли доступа сохранились,
- семейные ссылки в понятном состоянии,
- медиа metadata совпадают с ожидаемым количеством.

### 6.2 Если потерялись файлы, но база жива

1. Определить, затронута ли часть бакета или весь storage.
2. Восстановить файлы из backup storage.
3. Проверить выборочно:
- фото открываются,
- видео открываются,
- документы открываются,
- нет большого числа битых ссылок `/api/media/...`.
4. Если rollout еще смешанный, проверить и новые `Cloudflare R2` объекты, и legacy Yandex-backed чтение.

### 6.3 Если потерялись и база, и storage

1. Восстановить сначала базу.
2. Затем восстановить storage.
3. Проверить, что metadata и реальные файлы совпадают.

## 7. Минимальный post-restore checklist

1. Открывается viewer дерева.
2. Открывается builder для владельца.
3. Работает invite flow.
4. Работает хотя бы одна семейная ссылка.
5. Фото открываются через signed delivery.
6. Загрузка нового файла проходит успешно.
7. После загрузки новый объект приходит в активный `Cloudflare R2` path.
8. Legacy Yandex-backed объект, если еще есть в данных, тоже читается.

## 8. Что нужно сделать до production launch

1. Зафиксировать, где именно лежат backup базы.
2. Зафиксировать, где именно лежат backup storage или как они восстанавливаются.
3. Проверить одну тестовую restore-процедуру на dev/staging-подобной среде.
4. Убедиться, что ключи доступа к backup не завязаны на одного случайного человека.
5. Зафиксировать текущий rollout state:
- `MEDIA_STORAGE_BACKEND`
- `CF_R2_BUCKET`
- `CF_R2_ENDPOINT`
- `CF_R2_ROLLOUT_AT`
- описание legacy compatibility path, если он еще нужен

## 9. Практический вывод для V1

1. Для `Slava edition` важно не "идеальное disaster recovery", а рабочая и проверенная минимальная схема.
2. Самое опасное состояние - это когда backup вроде бы "есть", но restore ни разу не проверялся.
