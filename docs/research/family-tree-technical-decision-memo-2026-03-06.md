# Family Tree Technical Decision Memo (2026-03-06)

## 1. Scope и ограничения

1. Документ фиксирует технические решения для следующего этапа после исследования.
2. На текущем этапе runtime API/БД/типы/интерфейсы **не меняются**.
3. Цель: определить реализацию без UX-перегруза и с минимальными издержками.

## 2. Decision Summary

1. Расширенные связи: вводим двухслойный UX (быстрые действия + расширенный режим), тип связи хранится на ребре.
2. Медиа: целевая стратегия хранения - гибрид с external object storage (default) + наша metadata/access policy + signed URLs.
3. Приватность живых: field-level visibility + безопасные дефолты для living profiles.
4. Story pages: publish-модель с 3 режимами (`private`, `unlisted`, `public`) и контролем индексации.

## 3. Расширенные типы родства как UX-конструктор

### 3.1 Принципы

1. Сначала скорость, потом детализация: пользователь делает базовое действие в 1 клик.
2. Детализация только по запросу: advanced поля скрыты по умолчанию.
3. Тип связи принадлежит ребру (`personA <-> personB`), а не карточке персоны.
4. Визуализация должна быть читаемой на больших деревьях.

### 3.2 UX-паттерн

1. Базовые CTA: `Добавить родителя`, `Добавить ребенка`, `Добавить партнера`.
2. Доп.кнопка: `Расширенная связь` в том же popover/modal.
3. Для non-biological показываем:
- тип (`adopted`, `step`, `foster`, `guardian`, `biological`),
- флаг отображения в основной ветке,
- опциональный комментарий/основание.
4. Если у ребенка несколько наборов родителей - показываем один `primary display family`, остальные в боковой панели связей.

### 3.3 Визуальные правила (минимум перегруза)

1. `biological`: сплошная линия.
2. `adopted`: пунктир.
3. `foster`/`guardian`: штрих-пунктир.
4. `step`: тонкая пунктирная соединительная линия через партнерство.
5. Легенда фиксируется рядом с канвасом и не повторяется на каждом узле.

### 3.4 Валидации

1. Нельзя создавать дубли идентичных связей одного типа.
2. Нельзя циклически замкнуть родительскую цепочку.
3. Для `step` обязательна логическая опора на партнерство.
4. Для конфликтных изменений - soft warning + подтверждение.

### 3.5 Почему это не превращается в UX-кошмар

1. Большинство пользователей останется в базовом режиме (1-2 клика).
2. Advanced режим открывается только при необходимости.
3. Канвас не перегружается текстом типов, только визуальным кодом линий.
4. Второстепенные связи агрегируются в правой панели, а не на основном холсте.

### 3.6 Почему тип связи должен жить на ребре, а не в профиле персоны

1. Персона - это узел графа. Связь - это отдельное отношение между двумя конкретными узлами.
2. Тип родства почти всегда зависит не от человека "вообще", а от конкретной пары людей.
3. Один и тот же человек может одновременно иметь разные типы связей с разными людьми:
- ребенок для одних родителей,
- приемный ребенок для других,
- пасынок/падчерица по отношению к третьему человеку,
- текущий партнер одному человеку и бывший партнер другому.
4. Поэтому хранить `adopted`, `step`, `foster`, `guardian`, `biological`, `married`, `divorced` в карточке персоны концептуально неверно: эти значения не описывают человека как сущность, они описывают конкретную связь.
5. Правильная модель выглядит так:

```text
Elena -> Masha  relation_type=biological
Ivan  -> Masha  relation_type=biological
Anna  -> Masha  relation_type=adopted
Oleg  -> Masha  relation_type=adopted
```

6. Из этого следуют продуктовые преимущества:
- можно поддерживать blended families без поломки базовой модели,
- можно показывать разные типы линий на canvas без дублирования персон,
- можно хранить комментарий и display-приоритет на конкретной связи,
- можно позже добавить merge/normalization логики, не меняя person-card домен.
7. Для Antigravity это особенно важно, потому что текущая схема уже движется в эту сторону: `person_parent_links.relation_type` и `person_partnerships.status` являются edge-level полями, а не полями `persons`.
8. Ограничение текущей схемы: если на уровне БД сохраняется уникальность только по паре `parent_person_id + child_person_id`, то для одной и той же пары нельзя будет хранить несколько параллельных интерпретаций связи без изменения constraints. Семантически модель edge-based уже верная, но ее нужно будет довести до production-ready варианта отдельно.

## 4. Нормальная медиа-модель (photo/video/document)

### 4.1 Цель

1. Единый upload/access путь для всех типов медиа.
2. Приватный доступ по ролям без public-link костылей.
3. Минимизация инфраструктурных издержек и операционных рисков.

### 4.2 Сравнение вариантов

1. Собственный сервер хранения:
- плюс: полный контроль,
- минус: devops, бэкапы, масштаб, security на нас.

2. BYOS (Google Drive/Dropbox пользователя как primary):
- плюс: не храним байты,
- минус: сложный OAuth/compliance, квоты/отзывы токенов, нестабильный UX и доступ.

3. External object storage (S3-compatible) как primary:
- плюс: дешевле и устойчивее, presigned URL, lifecycle,
- минус: нужно аккуратно сделать metadata/policy слой.

### 4.3 Принятое решение

1. Primary storage: external object storage (рекомендовано: R2/B2/S3-compatible).
2. В Antigravity хранить только metadata:
- owner/tree/person linkage,
- object key,
- media kind,
- visibility,
- checksum/size/mime,
- audit fields.
3. Выдача медиа только через короткоживущие signed URL.
4. BYOS использовать как optional export/backup, не как основной рабочий поток.

### 4.4 Минимальный API-поток (концепт)

1. `create-upload-intent` -> возвращает presigned PUT + `media_id`.
2. Клиент грузит файл напрямую в object storage.
3. `complete-upload` -> финализирует metadata и привязку к персоне.
4. `resolve-media` -> выдает signed GET URL с учетом ACL.

### 4.5 Что это дает по издержкам

1. Нет хранения тяжёлых файлов на app-сервере.
2. Нет необходимости масштабировать дисковый слой приложения.
3. Управляемый cost per GB в object storage.
4. Снижение риска утечек через публичные постоянные ссылки.

### 4.6 Практические варианты object storage и ориентиры по цене

Срез цен: `2026-03-06`. Все цифры ниже требуют повторной проверки перед запуском production, но годятся как decision baseline.

| Вариант | Базовая цена | Минимум/подписка | Комментарий |
|---|---|---|---|
| Cloudflare R2 | `10 GB` free, далее `$0.015/GB-month`, egress `0` | нет fixed fee | Очень дешево для малого старта, хорошая S3-совместимость |
| Scaleway Object Storage | `One Zone €0.0075/GB-month`, `Multi-AZ €0.0146/GB-month`, первые `75 GB` egress free | нет fixed fee | Сильный EU-first вариант с низким входом |
| Yandex Object Storage | `1 GB` free, `standard 2.21 ₽/GB-month`, `cold 1.40 ₽`, `ice 0.97 ₽`; первые `100 GB/month` egress free | нет fixed fee | Практичный RF-first вариант |
| Selectel Object Storage | `standard` от `2.33 ₽/GB-month`, `cold` от `1.14 ₽`, `ice` от `0.81 ₽` | нет fixed fee | Тоже RF-first, S3 API, presigned URLs |
| Hetzner Object Storage | `€4.99/month` за `1 TB` storage + `1 TB` traffic | есть минимальный месячный чек | Выгоднее при выходе на заметный объем |
| Wasabi | `$6.99/TB-month` | фактически минимальный чек `1 TB/month` | Для tiny MVP обычно невыгодно |

Примеры rough order-of-magnitude для маленького MVP:
1. `50 GB` в Scaleway One Zone: около `€0.38/month` только за storage.
2. `50 GB` в Yandex Object Storage standard: около `108.29 ₽/month` только за storage.
3. `50 GB` в R2: около `$0.60/month` после free-tier.
4. Hetzner и Wasabi логичны уже не как "самый дешевый старт", а как более предсказуемый fixed-bucket вариант на больших объемах.

### 4.7 Требование доступности и доставки медиа в Европе и РФ

1. Для Antigravity важно не просто "где хранить байты", а чтобы дерево и медиа работали и в Европе, и в РФ.
2. Из этого следует, что нельзя строить primary media strategy на сервисах, которые могут блокироваться, деградировать или требовать публичный consumer-link UX.
3. YouTube, Vimeo, Yandex Disk public links и аналогичные consumer-hosting сценарии не должны быть primary-слоем для семейного архива.
4. Целевая модель:
- фото, документы и короткие видеофайлы лежат в object storage,
- клиент получает только short-lived signed URL,
- Antigravity контролирует metadata, ACL, audit и revoke semantics,
- storage vendor остается заменяемым.
5. Практический вывод по провайдерам:
- если главный критерий - минимальный cost в EU, сильный кандидат `Scaleway`,
- если главный критерий - устойчивость для РФ, сильные кандидаты `Yandex Object Storage` или `Selectel`,
- `Cloudflare R2` не стоит делать единственной critical dependency для РФ-сценария, даже если он очень дешевый.
6. Для production-ready реализации разумно закладывать vendor abstraction:
- один S3-compatible интерфейс в приложении,
- provider config в env,
- возможность заменить storage backend без миграции всей media-domain модели.
7. Для текущего Antigravity это означает, что существующую split-модель `photo -> private storage`, `video -> public external link` нужно считать промежуточной, а не целевой.

## 5. Приватность живых персон на уровне карточек/полей

### 5.1 Принципы

1. Safe-by-default для living persons.
2. Приватность карточки и приватность полей управляются отдельно.
3. Прозрачные роли доступа и аудит чувствительных просмотров.

### 5.2 Visibility-модель

1. Уровни: `public`, `members`, `editors`, `owner_only`.
2. Для living default:
- имя и ключевые поля скрыты для публичного доступа,
- в public-view отображается нейтральный placeholder.
3. Для deceased default можно оставлять мягче (`public`/`members` по настройке дерева).

### 5.3 UX-настройки

1. Переключатель на карточке: `Жив` / `Умер`.
2. Раздел `Приватность`: быстрые пресеты + тонкая настройка полей.
3. Индикатор рядом с полем, если оно скрыто от текущего пользователя.

## 6. Публичные story pages и распространение

### 6.1 Publish modes

1. `private`: доступ только участникам по роли.
2. `unlisted`: доступ по защищенной ссылке без индексации.
3. `public`: индексируемая страница на домене продукта.

### 6.2 Механика распространения

1. `Copy link` + share sheet (messengers/social).
2. QR-код для offline-sharing.
3. Ротация ссылки (invalidate token) в 1 клик.
4. Для living-персон данные в story фильтруются по privacy policy автоматически.

## 7. Риски и mitigation

1. Риск: перегрузка UX при множестве типов связи.
Mitigation: progressive disclosure + primary family display.
2. Риск: медиа-слой усложнит backend.
Mitigation: минимальный upload pipeline и единый metadata контракт.
3. Риск: ошибки доступа к living данным.
Mitigation: policy engine + server-side checks + audit.
4. Риск: share-link утечки.
Mitigation: expiring/signed links, revoke/rotate, watermarking опционально.

## 8. Next Stage Deliverables

1. UX-spec экранов `Add relationship` и `Relationship inspector`.
2. Data contract draft для media и privacy.
3. MVP roadmap с поэтапным rollout и метриками качества.

## 9. Источники для уточнений по storage pricing и regional delivery

1. Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
2. Cloudflare: throttling in Russia: https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/throttling-in-russia/
3. Scaleway pricing: https://www.scaleway.com/en/pricing/
4. Yandex Object Storage pricing: https://yandex.cloud/en/prices/object-storage
5. Selectel Object Storage pricing: https://selectel.ru/services/cloud/storage/
6. Selectel billing docs: https://docs.selectel.ru/en/cloud/object-storage/payments/
7. Selectel signed URLs: https://docs.selectel.ru/en/cloud/object-storage/how-to/signed-urls/
8. Hetzner Object Storage pricing: https://www.hetzner.com/storage/object-storage/
9. Wasabi pricing: https://wasabi.com/pricing/
10. Wasabi minimum charge FAQ: https://docs.wasabi.com/v1/docs/what-is-the-minimum-monthly-charge-for-wasabi-account
