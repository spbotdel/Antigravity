# Chrome Android Video Handoff (2026-04-14)

## Final Status
This incident is considered stabilized on preview after the last site-path fix:

- `7f61192` — `fix(media): keep chrome android player on late errors`

Practical result:

1. `Chrome Android` playback on the real `Медиа` surface for `popovi` no longer falls into the previous false-negative/fallback loop.
2. The temporary debug page served its purpose and was removed during cleanup.
3. Keep this file as the historical investigation log for future regressions.

## Цель
Передать новому агенту текущее состояние расследования и фиксов по проблеме воспроизведения видео в `Chrome Android`, чтобы не поднимать контекст заново из логов, Vercel deploy history и случайных заметок.

## Коротко
1. Проблема была не в полном отказе `/api/media/:id`.
2. Debug page доказала, что тот же `source` может играть в нативном `<video>` на `Chrome Android`.
3. Основной сбой находится в реальном site path:
   `Медиа` и карточка человека используют общий `PersonMediaGallery`, и именно в этой интеграции был хрупкий startup/fallback flow.
4. После серии патчей большинство видео на preview уже играют.
5. Остался сложный asset-specific edge case:
   `2b65bed0-8397-4de1-a601-9d44a194c69f` (`видео 1.mp4`, `1:53`) в `Медиа` ведет себя нестабильно:
   - может стартовать,
   - может упасть на повторном запуске,
   - на скриншотах видно, что метаданные и duration уже есть, а потом приходит поздний сбой.

## Где проверять
Основной preview alias:

`https://antigravity-git-feature-ux-media-update-spbotdel-4945s-projects.vercel.app`

Реальная surface, по которой пользователь вчера и сегодня проверял:

`https://antigravity-git-feature-ux-media-update-spbotdel-4945s-projects.vercel.app/tree/popovi/media?mode=video`

Viewer / карточка человека на том же preview:

`https://antigravity-git-feature-ux-media-update-spbotdel-4945s-projects.vercel.app/tree/popovi`

Историческая debug page была временно создана в ходе расследования и позже удалена в cleanup-цикле. Не пытаться использовать `/debug/video-test` как текущий runtime entrypoint.

## Что уже доказано
1. На временной минимальной debug page видео `3508fdcf-e2fc-4a34-8586-b2f503a12c7c` (`Урок №1 (Telegram).mp4`) на `Chrome Android` играло.
2. Это доказало, что `/api/media/:id` может дойти до playable state без gallery/lightbox/custom-player шума.
3. На реальном URL `/tree/popovi/media?mode=video` после патчей видео в целом уже стали играть.
4. Asset `2b65bed0-8397-4de1-a601-9d44a194c69f` долго оставался нестабильным именно в archive/lightbox path.
5. Этот же asset на debug page играл, что доказало file-level viability и сузило причину до site integration path.
6. После commit `7f61192` реальный preview-path стабилизировался и этот asset перестал падать в том же режиме.

## Дерево и видео-asset’ы
Tree:

- `slug`: `popovi`
- `tree_id`: `504ab9d2-f011-4330-8ed8-db6a08d8ec8f`

Video assets по дереву `popovi`:

1. `3508fdcf-e2fc-4a34-8586-b2f503a12c7c`
   `Урок №1 (Telegram).mp4`
   `provider=cloudflare_r2`
   `visibility=public`
   `size_bytes=73081327`

2. `1c3195c7-b684-4cfc-8ce7-14055b576261`
   `1.mp4`
   `provider=cloudflare_r2`
   `visibility=members`
   `size_bytes=40071034`

3. `2b65bed0-8397-4de1-a601-9d44a194c69f`
   `видео 1.mp4`
   `provider=cloudflare_r2`
   `visibility=members`
   `size_bytes=14675979`
   `duration ≈ 113s`
   Это тот самый проблемный ролик `1:53`.

## Что уже проверено у проблемного asset
Локально через `ffprobe`:

1. Файл не выглядит битым.
2. `codec_name=h264`
3. `profile=Constrained Baseline`
4. `pix_fmt=yuv420p`
5. `audio=AAC LC`
6. `moov` atom в начале файла
7. То есть это не банальный кейс:
   - не `bad codec`,
   - не `no faststart`,
   - не `metadata only in tail`.

## Что видно по Vercel логам
Через `Vercel MCP` runtime logs видно:

1. По `/api/media/2b65bed0-8397-4de1-a601-9d44a194c69f` стабильно приходят `206`.
2. Для некоторых прогонов есть клиентские `POST`-события:
   - `loadedmetadata`
   - `canplay`
   - `play`
   - поздний `error`
3. По последним неудачным прогонам видно последовательность примерно такого вида:
   - `GET 206`
   - видео показывает `0:00 / 1:53`
   - потом прилетает поздний `error`
4. Это согласуется со скриншотами пользователя:
   сначала native player успевает показать duration и прогресс,
   потом UI падает.

## Какие файлы уже трогались
Основные:

- [components/tree/person-media-gallery.tsx](C:/Antigravity/Antigravity-audio-docs-experiment/components/tree/person-media-gallery.tsx)
- [tests/person-media-gallery.test.tsx](C:/Antigravity/Antigravity-audio-docs-experiment/tests/person-media-gallery.test.tsx)
Места, где общий path реально используется:

- [components/tree/tree-viewer-client.tsx](C:/Antigravity/Antigravity-audio-docs-experiment/components/tree/tree-viewer-client.tsx)
- [components/media/tree-media-archive-client.tsx](C:/Antigravity/Antigravity-audio-docs-experiment/components/media/tree-media-archive-client.tsx)

## Последние важные коммиты
Актуальная ветка:

- `feature/ux-media-update`

Последние релевантные коммиты:

1. `7f61192`
   `fix(media): keep chrome android player on late errors`

2. `07fefb5`
   `fix(media): use native expanded video path on chrome android`

3. `4555503`
   `fix(media): relax chrome android video fallback`

4. `6af9ec1`
   `chore(debug): send video timeline events from test page`

5. `a1af30a`
   `chore(debug): preload video test page with public asset`

## Что именно уже поменяли в коде
1. Для `Chrome Android` был ослаблен ранний fallback в `PersonMediaGallery`.
2. Для `Chrome Android` expanded/lightbox video path был максимально приближен к debug page:
   native `<video controls playsInline preload="metadata">`.
3. Для `Chrome Android` поздний `error` после уже достигнутого playable state больше не должен мгновенно заменять player на placeholder.
4. В ходе расследования на временной debug page и в runtime были включены клиентские timeline-логи; после стабилизации этот diagnostic code можно считать историческим этапом, а не действующим runtime contract.

## Что уже не надо делать заново
1. Не надо заново доказывать, что `/api/media/:id` жив в принципе.
2. Не надо первым же шагом воссоздавать generic debug page.
3. Не надо заново проверять “это просто codec?” для `2b65...` — базовая media structure уже выглядит нормальной.
4. Не надо заново копать `Cloudflare R2` как единственную причину: для других video assets тот же delivery path уже доходит до playback.

## Что надо проверить первым делом в новом чате
1. Если баг вернется, начинать с того же preview-path:
   `https://antigravity-git-feature-ux-media-update-spbotdel-4945s-projects.vercel.app/tree/popovi/media?mode=video`
2. Проверять именно:
   - повторный запуск,
   - поведение после обновления страницы,
   - исчезает ли player или остается видимым,
   - касается ли регресс только одного asset или всей surface.
3. Сразу перечитать этот файл и раздел в `COMMON_BUGS.md`, а не перебирать заново `codec / head / signed-url / public-link` гипотезы.

## Наиболее вероятный следующий шаг, если проблема у `2b65...` останется
1. Если похожий регресс вернется только на одном asset, не делать сразу новый общий UI-патч.
2. Сначала проверить:
   - late-error path после уже загруженных метаданных,
   - сохраняется ли native player на экране,
   - есть ли file-specific pattern.
3. Если баг окажется строго asset-specific, следующим кандидатом остаётся `remux` этого MP4 без перекодирования.

## Если нужен быстрый старт в новом чате
Вставить этот блок:

"""
Прими контекст из файла:
- C:\\Antigravity\\Antigravity-audio-docs-experiment\\docs\\research\\chrome-android-video-handoff-2026-04-14.md

Сначала:
1. Прочитай handoff полностью.
2. Не пересобирай общую теорию заново.
3. Проверь, действительно ли регресс повторяется на реальном preview URL `/tree/popovi/media?mode=video`.
4. Если баг вернулся только на одном asset, переходи не к новому общему UI-патчу, а к file-specific remediation: remux этого MP4 и повторная проверка.

Важно:
- Не трогай unrelated `.claude/*` memory files из прошлого crash-состояния.
- Держись за реальные preview URL и Vercel runtime logs, а не за локальную эмуляцию Android.
"""

## Дополнительное предупреждение
В worktree есть старые грязные `.claude/*` и `docs/research/*` файлы из crash/recovery-контекста. Они не относятся напрямую к текущему Chrome Android fix cycle. Не надо их случайно включать в новый коммит, если задача касается только media playback.
