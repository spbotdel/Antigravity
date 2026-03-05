# BACKLOG — Antigravity

*Updated: 2026-03-02*

## Active Sprint

### High Priority

- [ ] Упростить первый экран landing page: убрать перегруженный hero, сократить количество текста и снизить визуальный шум.
- [ ] Переделать верхний экран dashboard: убрать гигантские переносы заголовков, выровнять ритм текста и сделать действия очевидными.
- [ ] Завершить единый typographic pass: выбрать спокойную шрифтовую систему и привести заголовки, подписи, кнопки и формы к одной логике размеров.
- [ ] Подчистить иерархию CTA по всему продукту: первичные и вторичные кнопки должны быть визуально различимы и однозначно считываться как действия.
- [ ] Сохранить приоритет дерева в viewer/builder: рабочая область со схемой должна оставаться главным объектом экрана на desktop и mobile.

### Medium Priority

- [ ] Упростить landing ниже первого экрана: убрать лишние маркетинговые карточки и оставить только блоки, которые реально помогают понять продукт.
- [ ] Дожать visual density конструктора: сократить шум в инспекторе, полях, табах и служебных подписях.
- [ ] Проверить dashboard и landing на ширинах 1280px, 1440px и 1920px, чтобы не было агрессивных переносов и пустых зон.
- [ ] Продолжить polishing для `Участники`, `Настройки` и `Журнал`, чтобы они соответствовали обновленному светлому стилю.
- [ ] Пройтись по mobile layout ключевых экранов и убрать горизонтальные развалы, избыточные отступы и большие CTA.

### Low Priority

- [ ] Добавить аккуратные motion-акценты только после стабилизации layout и типографики.
- [ ] Вернуться к бренд-деталям интерфейса только после того, как решены читабельность и композиция.

## Product Backlog

### UX/UI System

- [ ] Финализировать визуальный язык продукта как "легкий редактор семейной памяти", а не "маркетинговый лендинг" и не "тяжелая админка".
- [ ] Сделать главную страницу короче и взрослее по тону.
- [ ] Привести viewer, builder, dashboard и settings к одной сетке, шкале отступов и радиусам.
- [ ] Упростить copywriting в интерфейсе: меньше декларативных слоганов, больше ясных объяснений и прямых действий.

### Core Product

- [ ] Довести owner/admin/viewer flow до production-ready состояния на dev Supabase проекте.
- [ ] Допроверить invite flow и сценарии приватного/публичного дерева после очередного UI рефактора.
- [ ] Сохранить понятный audit trail для обычного пользователя без технических полей и внутренних идентификаторов.
- [ ] Продолжить улучшение builder как основной рабочей среды проекта.

### Quality

- [ ] Поддерживать `npm run typecheck`, `npm test` и `npm run build` зелеными после каждого UI цикла.
- [ ] Держать smoke-проверку основных пользовательских сценариев в рабочем состоянии.
- [ ] Не допускать возврата к избыточной декоративности, крупным заголовкам и неочевидным CTA.

## Current Decision Log

- [x] Платформа переведена на `Next.js + TypeScript + Supabase`.
- [x] Старый статический viewer сохранен как legacy-артефакт, но не является runtime-базой продукта.
- [x] Базовый русский интерфейс внедрен на основных экранах.
- [x] Журнал владельца переведен на более человеческие формулировки.
- [x] Конструктор переведен из длинной страницы форм в layout с canvas и инспектором.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-05 14:08:00Z`
- Active branch: `main`
- Git status: `STATUS:0 files`
- Git diff: `DIFF:0 lines`

### Suggested Focus

- [ ] Review changed files summary (`0` files, `0` diff lines).
- [ ] Confirm manual notes in this file still match current sprint priorities.
- [ ] Close stale TODOs that are no longer relevant after the latest completion.

### Top Changed Paths

- `<none>`

### Detected Stack

- Node.js / npm

### Top-Level Structure Snapshot

- `.env.example`
- `.env.local`
- `.gitattributes`
- `.github/`
- `.gitignore`
- `.next/`
- `.next-dev.err.log`
- `.next-dev.log`
- `.next-start.err.log`
- `.next-start.log`
- `.tmp/`
- `3.ged`
- `AGENTS.md`
- `app/`
- `CHANGELOG.md`
- `check-ids.html`
- `CLAUDE.md`
- `components/`
- `css/`
- `FRAMEWORK_GUIDE.md`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-03-05 14:08:00Z`
- Branch: `main`
- Git status summary: `STATUS:0 files`
- Git diff summary: `DIFF:0 lines`

- Session summary: `0` changed files, `0` diff lines, `0` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:0 files`)
- `git_diff`: `success` (`DIFF:0 lines`)
<!-- FRAMEWORK:SESSION:END -->
