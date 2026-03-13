create table if not exists public.tree_media_albums (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  title text not null,
  description text,
  album_kind text not null default 'manual',
  uploader_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tree_media_albums_kind_check check (album_kind in ('manual', 'uploader'))
);

create unique index if not exists tree_media_albums_uploader_unique
  on public.tree_media_albums (tree_id, uploader_user_id)
  where album_kind = 'uploader' and uploader_user_id is not null;

create table if not exists public.tree_media_album_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.tree_media_albums(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (album_id, media_id)
);

create or replace function public.ensure_same_tree_media_album_item()
returns trigger
language plpgsql
as $$
declare
  album_tree uuid;
  media_tree uuid;
begin
  select tree_id into album_tree from public.tree_media_albums where id = new.album_id;
  select tree_id into media_tree from public.media_assets where id = new.media_id;

  if album_tree is null or media_tree is null or album_tree <> media_tree then
    raise exception 'media album item must stay inside one tree';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_same_tree_media_album_item on public.tree_media_album_items;
create trigger validate_same_tree_media_album_item
before insert or update on public.tree_media_album_items
for each row execute function public.ensure_same_tree_media_album_item();

alter table public.tree_media_albums enable row level security;
alter table public.tree_media_album_items enable row level security;

drop policy if exists tree_media_albums_select_visible on public.tree_media_albums;
create policy tree_media_albums_select_visible on public.tree_media_albums
for select using (public.can_view_tree(tree_id));

drop policy if exists tree_media_albums_mutate_editor on public.tree_media_albums;
create policy tree_media_albums_mutate_editor on public.tree_media_albums
for all using (public.can_edit_tree(tree_id))
with check (public.can_edit_tree(tree_id));

drop policy if exists tree_media_album_items_select_visible on public.tree_media_album_items;
create policy tree_media_album_items_select_visible on public.tree_media_album_items
for select using (
  exists (
    select 1
    from public.tree_media_albums
    where tree_media_albums.id = tree_media_album_items.album_id
      and public.can_view_tree(tree_media_albums.tree_id)
  )
);

drop policy if exists tree_media_album_items_mutate_editor on public.tree_media_album_items;
create policy tree_media_album_items_mutate_editor on public.tree_media_album_items
for all using (
  exists (
    select 1
    from public.tree_media_albums
    where tree_media_albums.id = tree_media_album_items.album_id
      and public.can_edit_tree(tree_media_albums.tree_id)
  )
)
with check (
  exists (
    select 1
    from public.tree_media_albums
    where tree_media_albums.id = tree_media_album_items.album_id
      and public.can_edit_tree(tree_media_albums.tree_id)
  )
);
