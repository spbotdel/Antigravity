alter table public.tree_media_albums
  add column if not exists access text not null default 'members';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tree_media_albums_access_check'
  ) then
    alter table public.tree_media_albums
      add constraint tree_media_albums_access_check
      check (access in ('members', 'public'));
  end if;
end
$$;
