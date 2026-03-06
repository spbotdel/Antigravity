# Family Tree Feature Matrix (Snapshot: 2026-03-06)

Статусы:
- `Yes` — подтверждено официальной документацией и/или live-проверкой.
- `Partial` — подтверждено частично (ограничено планом, типом аккаунта, регионом или только косвенным сигналом).
- `No` — явное отсутствие в публично заявленном функционале.
- `Unknown/Blocked` — не удалось достоверно подтвердить (доступ/anti-bot/нет публичного описания).

Покрытие: `Antigravity`, `Ancestry`, `MyHeritage`, `FamilySearch`, `Geni`, `Family Echo`, `Geneanet`, `Familio`, `Famiry`.

## 1) Базовые операции с родством

| Функция | Antigravity | Ancestry | MyHeritage | FamilySearch | Geni | Family Echo | Geneanet | Familio | Famiry |
|---|---|---|---|---|---|---|---|---|---|
| Создание дерева | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Добавление персоны | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Связь родитель-ребенок | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial | Yes |
| Связь партнер/супруг | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial | Yes |
| Типы связей beyond biological (adopted/step/foster и т.д.) | Partial | Yes | Partial | Yes | Yes | Yes | Partial | Unknown/Blocked | Unknown/Blocked |
| Поддержка сложных семей (несколько родителей/партнеров, blended) | Partial | Yes | Partial | Partial | Yes | Yes | Partial | Unknown/Blocked | Partial |
| Удаление/переназначение связей | Partial | Yes | Partial | Partial | Partial | Partial | Partial | Unknown/Blocked | Partial |
| Merge/объединение дублей персон | No | Yes | Partial | Partial | Partial | Unknown/Blocked | Partial | Unknown/Blocked | Unknown/Blocked |

## 2) Коллаборация, роли, приватность

| Функция | Antigravity | Ancestry | MyHeritage | FamilySearch | Geni | Family Echo | Geneanet | Familio | Famiry |
|---|---|---|---|---|---|---|---|---|---|
| Приглашения в дерево | Yes | Yes | Yes | Partial | Yes | Yes | Yes | Unknown/Blocked | Yes |
| Роли/права (viewer/editor/admin и экв.) | Yes | Yes | Partial | No | Partial | No | Partial | Unknown/Blocked | Partial |
| История изменений / аудит | Partial | Partial | Partial | Partial | Partial | No | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked |
| Приватность живых персон | No | Yes | Partial | Yes | Yes | Partial | Partial | Partial | Yes |
| Публичный/приватный режим дерева | Yes | Yes | Yes | Partial | Partial | Yes | Yes | Yes | Yes |

## 3) Медиа и переносимость

| Функция | Antigravity | Ancestry | MyHeritage | FamilySearch | Geni | Family Echo | Geneanet | Familio | Famiry |
|---|---|---|---|---|---|---|---|---|---|
| Фото | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial | Yes |
| Видео | Partial | Yes | Yes | Partial | Partial | No | Partial | Unknown/Blocked | Yes |
| Документы/файлы | No | Partial | Partial | Yes | Partial | Partial | Yes | Partial | Yes |
| Публично описанные лимиты | Partial | Yes | Yes | Yes | Yes | Unknown/Blocked | Yes | Unknown/Blocked | Partial |
| Импорт GEDCOM | No | Yes | Yes | Partial | Partial | Yes | Yes | Yes | Yes |
| Экспорт (GEDCOM/PDF/др.) | No | Yes | Yes | Partial | Partial | Yes | Yes | Unknown/Blocked | Yes |
| Mobile (app/web-mobile) | Partial | Yes | Yes | Yes | Partial | Partial | Partial | Partial | Partial |

## 4) Хранение медиа

| Параметр | Antigravity | Ancestry | MyHeritage | FamilySearch | Geni | Family Echo | Geneanet | Familio | Famiry |
|---|---|---|---|---|---|---|---|---|---|
| Встроенное хранилище (platform-managed) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Внешние ссылки как first-class сценарий | Yes (видео: Yandex public link) | Partial | Unknown/Blocked | Partial | Partial | No | Unknown/Blocked | Unknown/Blocked | Partial |
| Экспорт для офлайн-архива | No | Yes | Yes | Partial | Partial | Yes | Yes | Unknown/Blocked | Yes |
| Интеграция backup в сторонние облака | No | No evidence | No evidence | No evidence | No evidence | No evidence | No evidence | No evidence | Yes (маркетингово заявлено) |
| Подписанные/временные URL для приватной выдачи | Yes (photo signed URL) | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked | Unknown/Blocked |
| Явно описанный retention/delete policy | Partial | Partial | Partial | Partial | Partial | Partial | Partial | Yes | Unknown/Blocked |

## Ключевые заметки по источникам (на 2026-03-06)

- **Antigravity (локальный код/доки):** роли `owner/admin/viewer`, `public/private`, фото в private Supabase Storage + signed delivery, видео только `yandex_disk` public-link, `one tree per owner`, `no GEDCOM import/export`.
- **Ancestry:** есть роли при shared tree (`Guest/Contributor/Editor`), настройка privacy дерева, описаны типы отношений и лимиты медиа (15MB фото, 100MB аудио/видео), поддержка загрузки/выгрузки GEDCOM.
- **MyHeritage:** базовые ограничения Basic (250 персон / 500 MB), управление family site members, материалы по добавлению родственников/медиа/экспорту; часть help-статей отдается через динамический help-center и не всегда доступна для детального парсинга без браузерной интеракции.
- **FamilySearch:** статьи по relationship types, privacy living vs deceased, memory limits; collaborative модель и приватность отличаются от private-tree подхода.
- **Geni:** статьи по relation types, privacy visibility, family group managers/permissions, лимит фото 15MB.
- **Family Echo:** богатые типы родства (adopted/foster/step/godparent), приглашения, импорт/экспорт (`GEDCOM/CSV/FamilyScript`), политика приватности и возможность локального архивирования.
- **Geneanet:** часть страниц доступна, часть блокируется Cloudflare; подтверждены FAQ по медиа-лимиту (до 100MB) и статьи по созданию/приглашениям/импорту дерева.
- **Familio:** из публичного FAQ/лендинга подтверждены GEDCOM-перенос, хранение на Tier III в РФ, HTTPS+SSL, удаление аккаунта по запросу (до 10 дней), режим приватности страниц.
- **Famiry:** на публичных страницах заявлены unlimited tree, медиа (фото/аудио/видео), шаринг всего дерева или отдельных карточек, экспорт GEDCOM/PDF и backup в Dropbox/Google Drive/Yandex/Mail Cloud.

## Ссылки (основные)

- Antigravity локально: `/README.md`, `/supabase/migrations/20260301193000_family_tree_v1.sql`.
- Ancestry:
  - https://support.ancestry.com/s/article/Sharing-a-Family-Tree
  - https://support.ancestry.com/s/article/Family-Tree-Privacy
  - https://support.ancestry.com/s/article/Uploading-Media-to-Ancestry-Trees
  - https://support.ancestry.com/s/article/Uploading-and-Downloading-Trees
  - https://support.ancestry.com/s/article/Adding-Relationships-to-a-Tree
- MyHeritage:
  - https://www.myheritage.com/help/en/articles/12851305-what-is-the-difference-between-a-myheritage-account-and-a-family-site
  - https://www.myheritage.com/help/en/articles/12851590-what-can-i-do-for-free-on-myheritage
  - https://www.myheritage.com/help/en/articles/12852066-what-are-my-photo-upload-limits-in-the-basic-plan
  - https://www.myheritage.com/help/en/collections/17065201-family-tree-research
  - https://www.myheritage.com/help/en/collections/17309299-photos-media-prints
- FamilySearch:
  - https://www.familysearch.org/en/help/helpcenter/article/how-do-i-edit-a-couple-relationship-in-family-tree
  - https://www.familysearch.org/en/help/helpcenter/article/what-is-the-difference-between-relationship-type-options-in-family-tree
  - https://www.familysearch.org/en/help/helpcenter/article/how-do-i-know-if-my-photos-and-stories-are-private
  - https://www.familysearch.org/en/help/helpcenter/article/how-many-memories-can-i-add-to-familysearch
- Geni:
  - https://help.geni.com/hc/en-us/articles/229705387-Adding-Relationships
  - https://help.geni.com/hc/en-us/articles/229705667-Privacy
  - https://help.geni.com/hc/en-us/articles/229705247-Project-Permissions
  - https://help.geni.com/hc/en-us/articles/229705947-Photos-on-Geni
- Family Echo:
  - https://www.familyecho.com/
  - https://www.familyecho.com/?page=policies
  - https://www.familyecho.com/?page=import
  - https://www.familyecho.com/?page=download
- Geneanet:
  - https://en.geneanet.org/genealogyblog/post/2024/02/how-to-create-your-geneanet-family-tree
  - https://en.geneanet.org/forum/viewtopic.php?t=750998
  - https://en.geneanet.org/help/wiki/tips-for-starting-a-genealogical-search
  - https://en.geneanet.org/help/wiki/category/family-tree
- Familio:
  - https://familio.org/
  - https://familio.org/help
  - https://familio.org/privacy
  - https://familio.org/terms
- Famiry:
  - https://famiry.ru/
  - https://www.famiry.ru/
  - https://famiry.com/
  - https://help.famiry.ru/

## Live-check статус регистрации (2026-03-06)

- Проверка временной почты: `mail.tm` доступен, но при повторных автоматизированных попытках регистрации получен `429 Too Many Requests`.
- Проверка URL регистрации:
  - `ancestry.com` и `geneanet.org` давали `403`/anti-bot на прямых запросах.
  - `familysearch.org/register`, `geni.com/register`, `famiry.ru/tree`, `familio.org` отдают контент, но полноценный scripted signup упирается в динамические фронтенд-потоки/anti-abuse и не считается достоверным live-подтверждением всех функций без интерактивной браузерной сессии.
