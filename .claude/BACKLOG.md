# BACKLOG — Antigravity

*Updated: 2026-03-07*

## Active Sprint

### High Priority

- [ ] Пересобрать media upload flow под реальный архивный сценарий: единый upload для фото и видео с устройства, multi-file, прогресс, лимиты и устранение `spawn ENAMETOOLONG`.
  Capsule: `tasks/active/media-upload-flow-v2/`
- [ ] Поднять thumbnail/variant architecture в ближайший следующий этап: `thumb/small/medium` для preview, оригинал только для full view, CDN позже.
  Capsule: `tasks/active/media-upload-flow-v2/`
- [ ] Завершить текущий pass по `family-tree-canvas`: age-aware avatars, fallback badge states, читаемость карточек и стабильное выделение выбранного узла в viewer и builder.
- [ ] Стабилизировать layout конструктора: resizable canvas shell, overlay inspector на desktop и предсказуемое поведение на tablet/mobile без потери приоритета дерева.
- [ ] Довести экран `Участники`: приглашения по аккаунту и read-only share links должны быть самодостаточными, с понятными подсказками, копированием ссылок и безопасным отзывом доступа.
- [ ] Провести целевой QA для builder/viewer/members, чтобы не было регрессий в партнерах, родителях, действиях над узлами и режимах доступа.
- [ ] Держать startup context и memory-файлы актуальными: `startup_context_paths`, structured docs, `.claude/BACKLOG.md` и `.claude/SNAPSHOT.md` должны отражать реальный workstream текущего цикла.

### Medium Priority

- [ ] Дожать UX-polish media panel в viewer и builder: спокойнее copy, понятнее источники медиа, лучше пустые состояния и иерархия карточек.
- [ ] Подготовить отдельный exploratory stream для `Cloudflare R2`, не ломая текущий `Yandex Object Storage` path.
- [ ] Вернуться к calm pass для landing и dashboard после стабилизации builder/members: сократить лишний copy, выровнять ритм заголовков и CTA.
- [ ] Добить единый light visual system для `Настройки`, `Журнал`, `Участники`, builder и viewer.
- [ ] Проверить аватары и карточки дерева на кейсах без фото, с кириллицей в gender, с детьми и пожилыми, чтобы визуальные fallback-и были предсказуемыми.
- [ ] Уточнить, какие из новых проектных документов должны оставаться обязательным startup context, а какие достаточно держать как справочные.
- [ ] Подготовить следующий smoke cycle после текущих UI правок и обновления memory-файлов.

### Low Priority

- [ ] Добавлять motion-акценты только после стабилизации canvas/layout/access flows.
- [ ] Возвращаться к бренд-деталям landing только если это не конфликтует с коротким utilitarian тоном продукта.

## Product Backlog

### UX/UI System

- [ ] Финализировать интерфейс как рабочий семейный редактор, а не маркетинговый лендинг и не тяжелую админку.
- [ ] Свести landing, dashboard, viewer, builder, members, settings и audit к одной системе плотности, типографики и CTA.
- [ ] Держать дерево главным объектом экрана, а служебные панели и статусные блоки вторичными.
- [ ] Упростить copywriting: меньше деклараций, больше понятных действий, состояний доступа и рабочих сценариев.

### Core Product

- [ ] Довести owner/admin/viewer flow вместе с invite/share-link сценариями до production-ready состояния на dev Supabase.
- [ ] Укрепить builder как основную рабочую среду: родители, партнеры, дети, удаление, выделение, preview, resize и focus не должны требовать обходных действий.
- [ ] Сохранить понятный audit trail для обычного пользователя без технических полей и внутренних идентификаторов.
- [ ] Дожать media и tree interaction flows так, чтобы фотографии, ссылки и доступы оставались рядом с деревом, а не уводили в обходные UI-процессы.

### Quality

- [ ] Поддерживать `npm run typecheck`, `npm test` и `npm run build` зелеными после каждого UI цикла.
- [ ] Держать targeted tests для `family-tree-canvas` и access-management сценариев в рабочем состоянии.
- [ ] Держать startup context и memory-файлы свежими, чтобы `start` показывал текущий план, а не исторический backlog.
- [ ] Не допускать возврата к избыточной декоративности, крупным заголовкам и неочевидным CTA.

## Current Decision Log

- [x] Платформа переведена на `Next.js + TypeScript + Supabase`.
- [x] Старый статический viewer сохранен как legacy-артефакт, но не является runtime-базой продукта.
- [x] Базовый русский интерфейс внедрен на основных экранах.
- [x] Журнал владельца переведен на более человеческие формулировки.
- [x] Конструктор переведен из длинной страницы форм в layout с canvas и инспектором.
- [x] Startup context для `start` перенесен в `.codex/config/framework-adapter.json` (`startup_context_paths`).
- [x] Structured docs подключены к startup context вместе с `.claude/*`.
- [x] Карточки дерева используют фото, а при отсутствии фото — age/gender avatars с нормализацией кириллических значений пола.
- [x] Inspector в builder остается вторичным слоем над canvas на desktop и складывается в обычный поток на меньших ширинах.
- [x] Экран участников явно разделяет account invites и read-only family share links.
- [x] Единый media flow завершен для photo, file-backed video и external video links.
- [x] `Yandex Object Storage` подключен как текущий рабочий S3-compatible backend для private media.
- [x] Focused regression `smoke:media` покрывает object-storage photo/video и external video links.
- [x] Следующий media stream выделен в отдельный active capsule `tasks/active/media-upload-flow-v2/`.

<!-- FRAMEWORK:AUTO:START -->
## Framework Auto Sync

- Updated at (UTC): `2026-03-07 13:48:38Z`
- Active branch: `main`
- Git status: `STATUS:57 files`
- Git diff: `DIFF:8744 lines`

### Suggested Focus

- [ ] Review changed files summary (`57` files, `8744` diff lines).
- [ ] Confirm manual notes in this file still match current sprint priorities.
- [ ] Close stale TODOs that are no longer relevant after the latest completion.

### Top Changed Paths

- `.claude/ARCHITECTURE.md`
- `.claude/BACKLOG.md`
- `.claude/SNAPSHOT.md`
- `.codex/commands/start.md`
- `.codex/commands/start.sh`
- `.codex/config/framework-adapter.json`
- `.codex/utils/backlog-start-hint.py`
- `.env.example`
- `AGENTS.md`
- `README.md`

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
- `ARCHITECTURE_RULES.md`
- `CHANGELOG.md`
- `check-ids.html`
- `CLAUDE.md`
- `COMMON_BUGS.md`
- `components/`
<!-- FRAMEWORK:AUTO:END -->

<!-- FRAMEWORK:SESSION:START -->
## Latest Completion Session

- Completed at (UTC): `2026-03-07 13:48:38Z`
- Branch: `main`
- Git status summary: `STATUS:57 files`
- Git diff summary: `DIFF:8744 lines`

- Session summary: `57` changed files, `8744` diff lines, `10` tracked changed paths.

### Key Task Statuses

- `config_init`: `success` (`CONFIG:exists`)
- `project_baseline`: `success` (`BASELINE:created:0:updated:0`)
- `security_cleanup`: `success` (`SECURITY:skipped:dialogs_disabled`)
- `dialog_export`: `success` (`EXPORT:skipped:disabled`)
- `git_status`: `success` (`STATUS:57 files`)
- `git_diff`: `success` (`DIFF:8744 lines`)
<!-- FRAMEWORK:SESSION:END -->
