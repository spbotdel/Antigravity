alter table public.media_assets
  drop constraint if exists media_assets_provider_kind_check;

alter table public.media_assets
  add constraint media_assets_provider_kind_check check (
    (provider = 'supabase_storage' and kind in ('photo', 'video', 'document'))
    or (provider = 'object_storage' and kind in ('photo', 'video', 'document'))
    or (provider = 'yandex_disk' and kind = 'video')
  );
