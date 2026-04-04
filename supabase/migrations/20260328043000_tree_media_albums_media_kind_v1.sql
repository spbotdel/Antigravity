delete from public.tree_media_album_items;
delete from public.tree_media_albums;

drop index if exists public.tree_media_albums_uploader_unique;

alter table public.tree_media_albums
  add column if not exists kind text;

alter table public.tree_media_albums
  alter column kind drop default;

alter table public.tree_media_albums
  alter column kind set not null;

alter table public.tree_media_albums
  drop constraint if exists tree_media_albums_media_kind_check;

alter table public.tree_media_albums
  add constraint tree_media_albums_media_kind_check
  check (kind in ('photo', 'video'));

create unique index if not exists tree_media_albums_uploader_unique_by_kind
  on public.tree_media_albums (tree_id, uploader_user_id, kind)
  where album_kind = 'uploader' and uploader_user_id is not null;

create or replace function public.ensure_same_tree_media_album_item()
returns trigger
language plpgsql
as $$
declare
  album_tree uuid;
  media_tree uuid;
  album_media_kind text;
  media_kind public.media_kind;
begin
  select tree_id, kind into album_tree, album_media_kind
  from public.tree_media_albums
  where id = new.album_id;

  select tree_id, kind into media_tree, media_kind
  from public.media_assets
  where id = new.media_id;

  if album_tree is null or media_tree is null or album_tree <> media_tree then
    raise exception 'media album item must stay inside one tree';
  end if;

  if media_kind not in ('photo', 'video') then
    raise exception 'media album items support only photo and video media';
  end if;

  if album_media_kind <> media_kind::text then
    raise exception 'media album kind must match media kind';
  end if;

  return new;
end;
$$;
