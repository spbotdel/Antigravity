# GPT-5.4 Handoff Context (2026-03-06)

## Цель
Продолжить работу после конкурентного исследования family-tree продуктов, без внесения runtime-изменений на исследовательском этапе.

## Текущий статус
1. Исследование завершено.
2. Runtime/API/БД/UI проекта не изменялись в рамках этапа исследования.
3. Подготовлены отчеты и техдоки для следующего этапа планирования.

## Ключевые файлы (открывать в первую очередь)
1. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-competitive-research-2026-03-06.md
2. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-feature-matrix-2026-03-06.md
3. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-technical-decision-memo-2026-03-06.md
4. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-roadmap-mvp-production-2026-03-06.md
5. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-plan-2026-03-06.md
6. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-implementation-plan-2026-03-06.md
7. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md
8. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-owner-playbook-2026-03-06.md
9. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-backup-restore-runbook-2026-03-06.md
10. C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-launch-checklist-2026-03-06.md

## Ключевые выводы исследования
1. Главные functional gaps Antigravity: нет GEDCOM import/export, нет merge дублей, ограниченная media-модель (video через public link), слабая модель расширенных родственных связей в UX.
2. Рекомендуемая стратегия хранения: гибрид (external object storage + metadata/access policy у нас + signed URL).
3. Privacy minimum для роста доверия: field-level приватность для living persons с safe-by-default.
4. Важное уточнение по relationship model: тип родства должен храниться на конкретной связи между двумя персонами, а не в профиле человека, иначе blended/adoptive/step/foster сценарии ломают модель.
5. Важное уточнение по infra: дерево и медиа должны работать и в Европе, и в РФ, поэтому public video-hosting и region-sensitive consumer platforms нельзя брать как primary media strategy.
6. Текущий shortlist для дешевого storage:
- `Scaleway` как сильный low-cost EU-first кандидат,
- `Yandex Object Storage` и `Selectel` как сильные RF-first кандидаты,
- `Cloudflare R2` не использовать как единственную critical media dependency для РФ-сценария.
7. Ближайший приоритет не mass-market MVP, а `V1.0 Slava edition`: owner-led collaborative family product с owner/admin/viewer flow, link-sharing для родственников и unified private media.
8. В `Slava edition` не вводится обязательная типизация ребенка как `adopted` против `biological`; для V1 ребенок = ребенок, а сложные taxonomy переносятся за пределы первой версии.
9. В V1 входят два канала доступа:
- invite-based collaboration для тех, кто помогает редактировать и загружать медиа,
- read-only family sharing по ссылке.
10. Для исполнения уже зафиксирован engineering backlog по репозиторию: отдельная сущность `tree_share_links`, unified private media, members screen rework, UAT EU+RF.
11. Для `Phase E` уже подготовлены operational docs: owner playbook, backup/restore runbook и launch/UAT checklist.

## Жесткие ограничения, которые нужно помнить
1. На этапе исследования не менять runtime API/БД/типы/UI.
2. Изменения архитектуры/контрактов только после отдельного согласования.

## Что пользователь хочет дальше
1. Перенести контекст в GPT-5.4.
2. Ближайший этап - довести `V1.0 Slava edition` как production-ready family product для владельца и его родственников.
3. После этого уже возвращаться к массовой версии.
4. Учитывать новое уточнение: unified media strategy должна учитывать кросс-региональную доступность EU + RF и минимальный recurring cost.
5. На operational уровне важно различать: код готов к launch и automated smoke готовы к прогону, но live Supabase network path из текущего окружения может оставаться нестабильным.

## Рекомендуемый next step в новом чате GPT-5.4
Вставить этот блок:

"""
Прими контекст проекта из файлов:
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-competitive-research-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-feature-matrix-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-technical-decision-memo-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-roadmap-mvp-production-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-plan-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-implementation-plan-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-owner-playbook-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-backup-restore-runbook-2026-03-06.md
- C:\Users\Acer\OneDrive\Документы\Playground\reports\family-tree-v1-slava-edition-launch-checklist-2026-03-06.md

Дата среза: 2026-03-06.
Сначала: переведи engineering backlog `Slava edition` в конкретный execution plan по репозиторию.
Нужно:
1. Разбить работу на маленькие PR-sized шаги.
2. Для каждого шага указать миграции, API, UI, тесты и риски.
3. Начать с семейного access layer (`tree_share_links` + share-link access), затем перейти к unified private media.
Важно: не возвращайся к mass-market roadmap, пока не закрыт `Slava edition`.
"""

## Новое рабочее правило

1. Если возникает конфликт между общим market roadmap и `Slava edition`, ближайшим source of truth считать:
- `family-tree-v1-slava-edition-plan-2026-03-06.md`,
- `family-tree-v1-slava-edition-implementation-plan-2026-03-06.md`,
- `family-tree-v1-slava-edition-engineering-backlog-2026-03-06.md`,
- operational docs `owner-playbook`, `backup-restore-runbook`, `launch-checklist`.
