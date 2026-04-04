-- Expand the provider-kind constraint to allow audio files via file-backed storage.
-- This replaces the constraint from 20260320093100.

alter table public.media_assets drop constraint if exists media_assets_provider_kind_check;

alter table public.media_assets
  add constraint media_assets_provider_kind_check check (
    (provider = 'supabase_storage' and kind in ('photo', 'video', 'document', 'audio'))
    or (provider = 'object_storage' and kind in ('photo', 'video', 'document', 'audio'))
    or (provider = 'cloudflare_r2' and kind in ('photo', 'video', 'document', 'audio'))
    or (provider = 'yandex_disk' and kind = 'video')
  );
