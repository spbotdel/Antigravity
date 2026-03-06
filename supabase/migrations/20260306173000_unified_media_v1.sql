do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'media_kind' and e.enumlabel = 'document'
  ) then
    null;
  else
    alter type public.media_kind add value 'document';
  end if;
end
$$;

alter table public.media_assets
  drop constraint if exists media_assets_provider_kind_check;

alter table public.media_assets
  add constraint media_assets_provider_kind_check check (
    (provider = 'supabase_storage' and kind in ('photo', 'video', 'document'))
    or (provider = 'yandex_disk' and kind = 'video')
  );

alter table public.media_assets
  drop constraint if exists media_assets_members_only_photos_check;
