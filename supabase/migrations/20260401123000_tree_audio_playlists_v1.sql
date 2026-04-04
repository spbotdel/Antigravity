create table if not exists public.tree_audio_playlists (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tree_audio_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.tree_audio_playlists(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tree_audio_playlist_items_unique_media unique (playlist_id, media_id),
  constraint tree_audio_playlist_items_unique_position unique (playlist_id, position),
  constraint tree_audio_playlist_items_position_positive check (position > 0)
);

create index if not exists tree_audio_playlists_tree_created_idx
  on public.tree_audio_playlists (tree_id, created_at desc);

create index if not exists tree_audio_playlist_items_playlist_position_idx
  on public.tree_audio_playlist_items (playlist_id, position asc);

create or replace function public.ensure_same_tree_audio_playlist_item()
returns trigger
language plpgsql
as $$
declare
  playlist_tree uuid;
  media_tree uuid;
  media_kind public.media_kind;
begin
  select tree_id into playlist_tree
  from public.tree_audio_playlists
  where id = new.playlist_id;

  select tree_id, kind into media_tree, media_kind
  from public.media_assets
  where id = new.media_id;

  if playlist_tree is null or media_tree is null or playlist_tree <> media_tree then
    raise exception 'audio playlist item must stay inside one tree';
  end if;

  if media_kind <> 'audio' then
    raise exception 'audio playlists support only audio media';
  end if;

  return new;
end;
$$;

drop trigger if exists set_tree_audio_playlists_updated_at on public.tree_audio_playlists;
create trigger set_tree_audio_playlists_updated_at
before update on public.tree_audio_playlists
for each row execute function public.set_updated_at();

drop trigger if exists validate_same_tree_audio_playlist_item on public.tree_audio_playlist_items;
create trigger validate_same_tree_audio_playlist_item
before insert or update on public.tree_audio_playlist_items
for each row execute function public.ensure_same_tree_audio_playlist_item();

alter table public.tree_audio_playlists enable row level security;
alter table public.tree_audio_playlist_items enable row level security;

drop policy if exists tree_audio_playlists_select_visible on public.tree_audio_playlists;
create policy tree_audio_playlists_select_visible on public.tree_audio_playlists
for select using (public.can_view_tree(tree_id));

drop policy if exists tree_audio_playlists_mutate_editor on public.tree_audio_playlists;
create policy tree_audio_playlists_mutate_editor on public.tree_audio_playlists
for all using (public.can_edit_tree(tree_id))
with check (public.can_edit_tree(tree_id));

drop policy if exists tree_audio_playlist_items_select_visible on public.tree_audio_playlist_items;
create policy tree_audio_playlist_items_select_visible on public.tree_audio_playlist_items
for select using (
  exists (
    select 1
    from public.tree_audio_playlists
    where tree_audio_playlists.id = tree_audio_playlist_items.playlist_id
      and public.can_view_tree(tree_audio_playlists.tree_id)
  )
);

drop policy if exists tree_audio_playlist_items_mutate_editor on public.tree_audio_playlist_items;
create policy tree_audio_playlist_items_mutate_editor on public.tree_audio_playlist_items
for all using (
  exists (
    select 1
    from public.tree_audio_playlists
    where tree_audio_playlists.id = tree_audio_playlist_items.playlist_id
      and public.can_edit_tree(tree_audio_playlists.tree_id)
  )
)
with check (
  exists (
    select 1
    from public.tree_audio_playlists
    where tree_audio_playlists.id = tree_audio_playlist_items.playlist_id
      and public.can_edit_tree(tree_audio_playlists.tree_id)
  )
);
