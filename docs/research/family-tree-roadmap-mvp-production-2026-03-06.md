# Family Tree Roadmap (MVP 4-6 weeks + Production 8-12 weeks)

## 1. Scope

1. Roadmap описывает внедрение решений из decision memo.
2. Этапы идут после отдельного согласования изменений API/БД/архитектуры.

## 2. MVP (4-6 недель)

### 2.1 Epic A: Expanded Relationships (minimal safe UX)

1. Базовые + расширенные типы в одном flow.
2. Тип связи хранится на ребре.
3. Визуальные линии по типам + легенда.
4. Primary display family для ребенка.

**Acceptance criteria**
1. Пользователь может добавить `biological/adopted/step/foster/guardian` без перехода по 3+ экранам.
2. На канвасе читаемо различаются типы связей.
3. Конфликтные/циклические связи блокируются серверно.

### 2.2 Epic B: Unified Media v1

1. Единый upload pipeline для `photo/video/document`.
2. External object storage + signed URL delivery.
3. Удаление `video-only public link` как обязательного пути.

**Acceptance criteria**
1. Один и тот же UX-поток для всех медиа-типов.
2. Нет постоянных публичных URL по умолчанию.
3. Медиа выдаются только при успешной проверке ACL.

### 2.3 Epic C: Living Privacy v1

1. Поле `living/deceased` + safe defaults.
2. Field-level visibility presets (`public/members/editors/owner_only`).
3. Серверная policy-проверка на каждый read.

**Acceptance criteria**
1. Living-персона не раскрывает чувствительные поля в public-view.
2. Роли корректно ограничивают чтение полей.
3. Есть аудит доступа к защищенным полям.

## 3. Production (8-12 недель)

### 3.1 Epic D: Data Quality

1. Merge duplicates + conflict resolution wizard.
2. Улучшенные подсказки по конфликтам структуры.

### 3.2 Epic E: Story Pages

1. Publish modes: `private/unlisted/public`.
2. Share links + rotate/revoke.
3. SEO controls (index/noindex) и canonical settings.

### 3.3 Epic F: Media Hardening

1. Lifecycle policies (retention/delete).
2. AV scanning pipeline (опционально).
3. Background processing (thumbnails/transcoding).

### 3.4 Epic G: BYOS (optional add-on)

1. Экспорт/backup в пользовательские облака (Dropbox/Google Drive/Yandex).
2. Не primary storage, а дополнительный канал.

## 4. Приоритеты по бизнес-эффекту

1. P0: Expanded relationships + Unified media + Living privacy.
2. P1: Merge duplicates + Story pages.
3. P2: BYOS backup and premium extensions.

## 5. Метрики успеха

1. Relationship edit error rate.
2. Доля успешных media upload (first attempt).
3. Количество privacy incidents (целевое: 0).
4. Time-to-complete типичных задач в builder.
5. Weekly active collaborators per tree.

## 6. Риски сроков

1. Перенасыщение MVP функционалом.
Mitigation: строгий feature freeze на core-scope.
2. Сложность migration для текущих данных.
Mitigation: backfill scripts + dual-read/dual-write окна.
3. Производительность канваса при множественных типах линий.
Mitigation: progressive rendering + caching layout.

## 7. Предлагаемый порядок запуска

1. Internal alpha (команда + тестовые деревья).
2. Private beta (ограниченная группа пользователей).
3. Gradual rollout 10% -> 50% -> 100%.
4. После стабилизации - запуск Story Pages и marketing layer.
