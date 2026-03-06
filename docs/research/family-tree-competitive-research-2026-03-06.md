# Competitive Research Report: Family Tree Platforms (Snapshot 2026-03-06)

## 1. Executive Summary

1. Рынок family tree в 2026 году ожидает от продукта не только базовые связи, но и стабильные сценарии совместной работы, медиахранилище, импорт/экспорт GEDCOM и прозрачную приватность живых/умерших персон.
2. Antigravity уже имеет сильный фундамент для v1: роли (`owner/admin/viewer`), private/public дерево, invite flow, аудиторский лог, signed URL для фото в приватном бакете.
3. Критический функциональный gap относительно конкурентов: отсутствие GEDCOM import/export, слабая модель сложного родства (adopted/step/foster как UX-first сценарий), отсутствие merge duplicates и ограниченная медиа-модель (видео только публичной ссылкой).
4. По хранению файлов конкурентный паттерн чаще всего такой: platform-managed storage + механики приватности + экспорт/архив; только часть игроков отдельно подчеркивает backup во внешние облака.
5. Рекомендуемая стратегия для следующего этапа: **гибрид** (external object storage + наша metadata/access policy + signed delivery), как компромисс между UX, масштабируемостью, контролем и юридической нагрузкой.

## 2. Сравнительная таблица функций

Подробная матрица вынесена отдельно: `reports/family-tree-feature-matrix-2026-03-06.md`.

Короткий срез по самым важным пунктам:

| Функция | Лидеры рынка | Статус Antigravity |
|---|---|---|
| Явные типы родства (biological/adopted/foster/step/...) | Ancestry, Geni, FamilySearch, Family Echo | Partial |
| Роли и приглашения | Ancestry, Antigravity, MyHeritage (частично) | Yes |
| Merge/объединение дублей | Ancestry (+частично у других) | No |
| GEDCOM import/export | Ancestry, MyHeritage, Family Echo, Geneanet, Famiry | No |
| Фото/видео/документы как единая медиа-модель | Большинство крупных платформ | Partial |
| Прозрачная приватность living/deceased | Ancestry, FamilySearch, Geni | Partial/No |
| Backup/export для «данные пользователя всегда забираемы» | Family Echo, Ancestry, MyHeritage, Famiry | No |

## 3. Gap-анализ для Antigravity

### Что уже есть (сильные стороны)

1. RBAC и membership-модель в базе и RLS (`owner/admin/viewer`, `active/revoked`).
2. Public/private visibility дерева.
3. Invite flow (link/email), secure token acceptance.
4. Аудит событий (owner-only просмотр).
5. Фото в private storage с signed delivery.
6. Чистая модель родственных ребер (`parent-child`, `partnership`) и валидаторы целостности по дереву.

### Чего нет и что критично добавить (логика/UX first)

1. **GEDCOM import/export**.
Причина: блокер миграции пользователей и слабая обратимость данных.
Эффект: снижает барьер входа и повышает доверие.

2. **Расширенные типы родства как UX-конструктор**.
Причина: пользователи ожидают explicit опции adopted/step/foster/guardian и визуальные отличия в графе.
Эффект: меньше ошибок в структуре и выше точность.

3. **Merge duplicates + conflict resolution**.
Причина: при коллаборации дубли почти неизбежны.
Эффект: удержание качества дерева при росте.

4. **Нормальная медиа-модель (photo/video/document) без «video only public link»**.
Причина: текущий подход видео ограничивает приватность и создает UX-фрагментацию.
Эффект: единый пользовательский путь и снижение утечек.

5. **Приватность живых персон на уровне карточек/полей**.
Причина: конкурентный и юридический минимум для семейных сервисов.
Эффект: доверие семей и рост collaborative usage.

### Что добавлять из маркетинговых целей (вторично)

1. Публичные «story pages» и shareable family narrative.
2. Экспортные артефакты «для подарка» (PDF-книга, printable tree).
3. Value-added функции discovery/search hints.
4. Внешние backup-интеграции (Dropbox/Google Drive/Яндекс) как premium differentiator.

## 4. Приоритизация следующих фич

Ограничение текущего этапа соблюдено: **runtime API/БД/типы не менялись**.

Предложенный порядок (после согласования):

1. **P0**: GEDCOM import/export + duplicate detection/merge.
Сильный UX/retention эффект и прямое конкурентное выравнивание.

2. **P0**: Медиаконтур v2 (единый upload/access для photo+video+document, приватность по правилам доступа).
Критично для доверия и роста collaborative use-cases.

3. **P1**: Расширенный relationship model + UI сценарии для blended families.
Повышает корректность данных и снижает ручные workaround.

4. **P1**: Living-person privacy policy + field-level controls.
Важный safety/compliance фактор.

5. **P2**: Маркетинговые надстройки (story pages, books, premium backup integrations).
Делать после закрытия core data/model пробелов.

## 5. Анализ хранения файлов и рекомендуемый вариант

### 5.1 Что видно у конкурентов

1. Основной паттерн: **встроенное хранение в платформе** + права доступа + экспорт (Ancestry/MyHeritage/FamilySearch/Geni/Geneanet/Family Echo).
2. У части RU-игроков коммуникация про инфраструктурную надежность и регион размещения (Familio).
3. Отдельные игроки продвигают **backup во внешние облака пользователя** как value-add (Famiry).

### 5.2 Текущее состояние Antigravity

1. Фото: приватный Supabase Storage + signed URLs.
2. Видео: только внешняя публичная ссылка (Yandex Disk).
3. Документы: отсутствуют.
4. Единая policy-модель media lifecycle/retention пока не завершена.

### 5.3 Варианты для следующего этапа

1. **Усилить текущий подход**.
Плюсы: минимум изменений.
Минусы: остается фрагментация, видео-приватность не закрыта.

2. **Полностью external object storage** (S3/R2/B2 и т.п.).
Плюсы: масштаб и переносимость.
Минусы: выше сложность доступа, lifecycle и observability; больше рисков на интеграции.

3. **Гибрид (рекомендуемый default)**.
Модель: бинарники во внешнем object storage, у нас metadata + ACL policy + audit + signed URL orchestration.
Плюсы: снижает нагрузку и часть ответственности за файловый слой, сохраняет контроль продукта над доступом/UX.
Минусы: нужна аккуратная проработка API-контрактов и lifecycle delete/retention.

### 5.4 Рекомендация

1. Для этапа 2 принять **гибридную стратегию** как целевую.
2. Сначала унифицировать media-domain и политику доступа, затем подключать внешний storage-провайдер.
3. В roadmap отдельно зафиксировать: delete semantics, retention window, signed URL TTL, disaster recovery.

## 6. Риски, ограничения, confidence

### Ограничения исследования (на 2026-03-06)

1. Часть help/registration потоков закрыта anti-bot/Cloudflare/динамическими SPA-механиками.
2. Не все платные/региональные функции можно подтвердить без полностью интерактивного сценария в браузере.
3. По отдельным продуктам (особенно Familio/Famiry) часть данных взята с лендингов/FAQ и требует дополнительной продуктовой валидации в личном кабинете.

### Live-check регистрации

1. Temporary mail: сервис `mail.tm` доступен, но повторные автоматизированные попытки дали `429 Too Many Requests`.
2. `ancestry.com` и часть `geneanet.org` endpoints: `403` при прямых запросах.
3. `familysearch.org/register`, `geni.com/register`, `famiry.ru/tree`, `familio.org`: контент доступен, но end-to-end scripted signup не подтвержден из-за динамических клиентских потоков/anti-abuse.

### Confidence-level

1. **High**: Antigravity текущие функции (локальный код/миграции/README), Family Echo, Ancestry базовые help-функции, FamilySearch relationship/privacy limits, Geni relationship/privacy/media limits.
2. **Medium**: MyHeritage детализация (из-за динамического help center), Geneanet часть фич (часть страниц недоступна), Famiry/Familio коммерческие и UX-детали.
3. **Low**: точные детали некоторых paid-tier или region-specific ограничений без интерактивного live-аккаунта.

## 7. Источники и дата верификации

Дата среза и верификации: **2026-03-06**.

См. полный список URL в `reports/family-tree-feature-matrix-2026-03-06.md` (раздел «Ссылки»).

Ключевые ссылки:

1. Antigravity локально: `/README.md`, `/supabase/migrations/20260301193000_family_tree_v1.sql`.
2. Ancestry: `support.ancestry.com` (sharing/privacy/media/upload-download/relationships).
3. MyHeritage: `myheritage.com/help` (free limits/account-site/media/export/family-tree collections).
4. FamilySearch: `familysearch.org/en/help/helpcenter/article/*` (relationship/privacy/memory limits).
5. Geni: `help.geni.com/hc/en-us/articles/*`.
6. Family Echo: `familyecho.com` (`home`, `policies`, `import`, `download`).
7. Geneanet: `en.geneanet.org` (help/wiki/blog/forum pages).
8. Familio: `familio.org` (`/`, `/help`, `/privacy`, `/terms`).
9. Famiry: `famiry.ru`, `famiry.com`, `help.famiry.ru`.

---

Ограничение этапа соблюдено: **исследование выполнено без изменений runtime API/БД/типов/интерфейсов проекта**.
