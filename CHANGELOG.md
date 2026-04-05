# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Initial framework baseline created.

### `fix/media-hardening`

- Media downloads were hardened:
  bulk archive download no longer assembles the whole ZIP in memory, PDF proxy now rejects oversized files above `100 MB`, and server-side Supabase PowerShell fallback is explicitly disabled on non-Windows.
- Media upload UX was unified:
  top upload buttons were removed, upload access now relies on bottom dropzones plus sticky upload buttons, and audio/document tabs keep their dedicated upload flows.
- Album creation entry moved into the album grid:
  the top `Создать альбом` action was removed from generic media tabs and replaced with a first-card `Создать альбом` entrypoint in `Альбомы`.
- Dedicated audio/document upload triggers were stabilized:
  native file-input labels replaced brittle programmatic clicks, and the audio `mountedRef` false-unmount regression after `upload-intent` was fixed.

### Merge `feat/audio-docs-experiment` into `main`

- Key changes:
  audio and document media are now first-class archive types; audio playlists and the sticky player were added; Word `.doc/.docx` preview was added through the Microsoft viewer path when a public R2 base is available; `Все медиа` was narrowed to photo and video only instead of mixing every file type; archive/video preview recovery and missing-object fallback behavior were hardened.
- System docs updated:
  `ARCHITECTURE_RULES.md`, `SYSTEM_INVARIANTS.md`, and `DECISIONS.md`.
- Important env:
  `CF_R2_PUBLIC_BASE_URL` enables Office Word preview through the Microsoft viewer; without it documents fall back to open/download behavior.
  `MEDIA_STORAGE_BACKEND=cloudflare_r2`, `CF_ACCOUNT_ID`, `CF_R2_BUCKET`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_ENDPOINT`, optional `CF_R2_REGION`, and optional `CF_R2_ROLLOUT_AT` control the Cloudflare R2 rollout path already wired into the repo.
- User-facing effects:
  Word docs may open in the Microsoft viewer instead of downloading immediately when preview preconditions are met.
  Audio and documents no longer pollute the combined `Все медиа` grid, but remain available in their own archive tabs and flows.
  Missing thumbs/originals should fail soft instead of taking down the archive surface.
