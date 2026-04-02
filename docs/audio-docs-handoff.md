# Audio, Documents, and Audio Playlists — Handoff

Branch: `feat/audio-docs-experiment`
Worktree: `C:\Antigravity\Antigravity-audio-docs-experiment`
Updated: `2026-04-02`

## 1. Context

This worktree now contains three related archive surfaces:

- `audio` media kind
- `document` media kind
- server-backed audio playlists for archive audio

The important correction relative to older notes is:

- audio playlists are no longer a client-only filtered view
- they are stored in Supabase as `tree_audio_playlists` and `tree_audio_playlist_items`
- the archive page receives playlist data from repository page loading

## 2. Architecture Invariants

These rules still hold and should not be broken while extending audio/document support:

- Photo/video archive grid stays separate from audio/document list surfaces.
- Photo/video albums stay photo/video-only.
- `TreeMediaAlbumMediaKind` must remain `Extract<MediaKind, "photo" | "video">`.
- Audio/document do not participate in the photo/video lightbox.
- Upload still uses the existing `upload-intent -> file -> complete` flow.
- Repository remains the business-logic layer. Routes stay thin.
- Photo variants stay photo-only. Audio/document do not generate `thumb/small/medium`.

## 3. Current Data Model

### Media kinds

`lib/types.ts`

- `MediaKind = "photo" | "video" | "document" | "audio"`
- `AudioPlaybackSource = { type: "archive" } | { type: "playlist"; playlistId: string }`

### Audio playlist records

`lib/types.ts`

- `TreeAudioPlaylistRecord`
- `TreeAudioPlaylistItemRecord`

These are tree-scoped records, not per-user local preferences.

### Validation

`lib/validators/media.ts`

- `createTreeAudioPlaylistSchema`
- `addAudioMediaToPlaylistSchema`

## 4. Database Layer

### Audio kind migrations

- `supabase/migrations/20260401120000_add_audio_media_kind.sql`
- `supabase/migrations/20260401120100_audio_provider_constraints.sql`

These are still required so `audio` is accepted by the media enum and provider constraint.

### Playlist migration

- `supabase/migrations/20260401123000_tree_audio_playlists_v1.sql`

This migration adds:

- `public.tree_audio_playlists`
- `public.tree_audio_playlist_items`
- cascade delete from playlist to items
- same-tree enforcement
- audio-only enforcement for playlist items
- RLS for visible/readable playlists and editor mutations

Important constraint behavior from the migration:

- a playlist item must reference media from the same tree
- only `kind = 'audio'` can be inserted into playlist items
- `(playlist_id, media_id)` is unique
- `(playlist_id, position)` is unique

## 5. Repository and API

### Repository

`lib/server/repository.ts`

Implemented server behavior:

- `listTreeAudioPlaylistsForTree(treeId)`
- `createTreeAudioPlaylist({ treeId, name })`
- `deleteTreeAudioPlaylist(playlistId)`
- `addAudioMediaToTreeAudioPlaylist({ treeId, playlistId, mediaId })`
- `removeAudioMediaFromTreeAudioPlaylistItem(itemId)`

Current behavior:

- archive page loading now returns `audioPlaylists`, `audioPlaylistItems`, and `audioPlaylistsAvailable`
- if playlist tables are not available remotely yet, repository degrades to:
  - `audioPlaylists = []`
  - `audioPlaylistItems = []`
  - `audioPlaylistsAvailable = false`
- duplicate track insert into the same playlist returns conflict
- non-audio media is rejected for playlists

### API routes

- `app/api/media/playlists/route.ts`
- `app/api/media/playlists/[playlistId]/route.ts`
- `app/api/media/playlists/items/route.ts`
- `app/api/media/playlists/items/[itemId]/route.ts`

Current route surface:

- `POST /api/media/playlists`
- `DELETE /api/media/playlists/:playlistId`
- `POST /api/media/playlists/items`
- `DELETE /api/media/playlists/items/:itemId`

Routes only validate input and delegate to repository functions.

## 6. UI Integration

### Archive client integration

`components/media/tree-media-archive-client.tsx`

Current integration is:

- archive mode includes `audio` and `document`
- `mode === "audio"` renders `AudioArchiveView`
- `mode === "document"` renders `DocumentArchiveView`
- photo/video grid, albums, lightbox, selection, and thumb logic stay in the non-audio branch

Audio props passed into `AudioArchiveView`:

- `media`
- `playlists`
- `playlistItems`
- `playlistsAvailable`

### Page integration

`app/tree/[slug]/media/page.tsx`

Current page behavior:

- resolves `?mode=audio` and `?mode=document`
- collects `audioMedia` and `documentMedia`
- passes `audioPlaylists`, `audioPlaylistItems`, and `audioPlaylistsAvailable` into the archive client

## 7. Audio UI Behavior

### Audio archive view

`components/media/audio-archive-view.tsx`

Implemented behavior:

- tab inside audio section:
  - `Все аудио`
  - `Плейлисты`
- upload audio files from the audio tab
- drag and drop upload
- delete audio from archive
- open playlist detail
- create playlist
- add track to existing playlist
- create playlist from the add-to-playlist modal and immediately add the current track
- remove track from playlist without deleting the audio file itself
- delete playlist

Important UI/runtime details:

- playlist track order is based on stored `position`
- playlist detail playback uses playlist order, not full archive order
- if playlist tables are unavailable, playlist UI shows unavailable state and disables playlist actions
- edit actions are guarded by `canEdit`

### Sticky player

`components/media/audio-player.tsx`

Implemented behavior:

- sticky bottom player
- play/pause
- prev/next
- seek
- duration/current time display
- auto-advance on `ended`
- playback source label switches between archive mode and selected playlist

Important current limitation:

- player state still lives inside `AudioArchiveView`
- switching away from the audio tab remounts the component and resets active track / playback state

## 8. Document UI Behavior

`components/media/document-archive-view.tsx`
`components/media/document-preview-dialog.tsx`

Document support remains separate from playlists:

- list-based archive surface
- upload and delete
- preview dialog for PDF/text-like formats
- fallback to download for unsupported preview formats

No audio-playlist behavior is shared with documents.

## 9. Tests That Exist

### UI tests

- `tests/audio-document-v2.test.ts`
- `tests/audio-playlists-v1.test.ts`

Current coverage includes:

- `audio` and `document` media kinds
- archive filtering for audio/document
- playlist track ordering by `position`
- prev/next playback within playlist source
- create playlist from modal and immediately add current track
- unavailable-playlists fallback state

### Repository tests

- `tests/repository-audio-playlists.test.ts`

Current coverage includes:

- create playlist
- add audio to playlist with next explicit position
- reject non-audio media
- reject cross-tree references
- prevent duplicate audio inside one playlist
- remove playlist item
- delete playlist
- confirm migration cascade delete declaration

### Validator coverage

- `tests/validators.test.ts`

Includes payload validation for playlist creation and add-to-playlist requests.

## 10. What Was Outdated Before This Update

Older notes in this handoff incorrectly said:

- audio playlist should remain client-only
- no playlist entities should be created in DB for audio

That is no longer true for the current worktree.

The current implementation is:

- DB-backed playlists
- repository-backed page loading
- API-backed create/delete/add/remove flows
- UI fallback when remote playlist schema is missing

## 11. Remaining Work

### Still needed for the feature to work end-to-end

1. Apply remote Supabase migrations:
   - `20260401120000_add_audio_media_kind.sql`
   - `20260401120100_audio_provider_constraints.sql`
   - `20260401123000_tree_audio_playlists_v1.sql`

2. Run end-to-end QA for:
   - create playlist
   - add track to playlist
   - remove track from playlist
   - delete playlist
   - read-only viewing when `canEdit = false`
   - playlist unavailable fallback when remote schema is missing

3. Verify upload + playback against real remote state:
   - upload MP3/WAV/OGG
   - confirm `kind = audio`
   - add uploaded track to playlist
   - play from playlist and verify `prev/next` order

### Reasonable next improvements, not blockers

4. Persist player state across tab switches by lifting playback state above `AudioArchiveView`.
5. Add playlist rename if product wants it.
6. Add playlist reorder if manual ordering should become editable after insert.

## 12. What Must Not Be Done

- Do not expand photo/video album model to include audio/document.
- Do not route audio/document into the photo/video lightbox.
- Do not move playlist business logic into components.
- Do not bypass repository permission checks with client-only playlist mutations.
- Do not treat missing remote playlist tables as a UI-only bug; repository fallback is intentional until migration is applied.

## 13. File Map

Core files for this feature:

- `lib/types.ts`
- `lib/validators/media.ts`
- `lib/server/repository.ts`
- `app/api/media/playlists/route.ts`
- `app/api/media/playlists/[playlistId]/route.ts`
- `app/api/media/playlists/items/route.ts`
- `app/api/media/playlists/items/[itemId]/route.ts`
- `components/media/audio-player.tsx`
- `components/media/audio-archive-view.tsx`
- `components/media/document-archive-view.tsx`
- `components/media/document-preview-dialog.tsx`
- `components/media/tree-media-archive-client.tsx`
- `app/tree/[slug]/media/page.tsx`
- `supabase/migrations/20260401120000_add_audio_media_kind.sql`
- `supabase/migrations/20260401120100_audio_provider_constraints.sql`
- `supabase/migrations/20260401123000_tree_audio_playlists_v1.sql`
- `tests/audio-document-v2.test.ts`
- `tests/audio-playlists-v1.test.ts`
- `tests/repository-audio-playlists.test.ts`
