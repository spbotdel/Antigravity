create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('owner', 'admin', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'tree_visibility') then
    create type public.tree_visibility as enum ('public', 'private');
  end if;
  if not exists (select 1 from pg_type where typname = 'media_visibility') then
    create type public.media_visibility as enum ('public', 'members');
  end if;
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('photo', 'video');
  end if;
  if not exists (select 1 from pg_type where typname = 'media_provider') then
    create type public.media_provider as enum ('supabase_storage', 'yandex_disk');
  end if;
  if not exists (select 1 from pg_type where typname = 'invite_method') then
    create type public.invite_method as enum ('link', 'email');
  end if;
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum ('active', 'revoked');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  visibility public.tree_visibility not null default 'private',
  root_person_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists trees_one_tree_per_owner_idx on public.trees (owner_user_id);

create table if not exists public.tree_memberships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  unique (tree_id, user_id)
);

create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  full_name text not null,
  gender text,
  birth_date date,
  death_date date,
  birth_place text,
  death_place text,
  bio text,
  is_living boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.trees
  drop constraint if exists trees_root_person_id_fkey;

alter table public.trees
  add constraint trees_root_person_id_fkey
  foreign key (root_person_id) references public.persons(id) on delete set null;

create table if not exists public.person_parent_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  parent_person_id uuid not null references public.persons(id) on delete cascade,
  child_person_id uuid not null references public.persons(id) on delete cascade,
  relation_type text not null default 'biological',
  created_at timestamptz not null default timezone('utc', now()),
  unique (tree_id, parent_person_id, child_person_id)
);

create table if not exists public.person_partnerships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  person_a_id uuid not null references public.persons(id) on delete cascade,
  person_b_id uuid not null references public.persons(id) on delete cascade,
  status text not null default 'married',
  start_date date,
  end_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  kind public.media_kind not null,
  provider public.media_provider not null,
  visibility public.media_visibility not null default 'public',
  storage_path text,
  external_url text,
  title text not null,
  caption text,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint media_assets_provider_kind_check check (
    (provider = 'supabase_storage' and kind = 'photo')
    or (provider = 'yandex_disk' and kind = 'video')
  ),
  constraint media_assets_members_only_photos_check check (
    visibility = 'public' or kind = 'photo'
  )
);

create table if not exists public.person_media (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  is_primary boolean not null default false,
  unique (person_id, media_id)
);

create table if not exists public.tree_invites (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  email text,
  role public.user_role not null,
  invite_method public.invite_method not null default 'link',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.ensure_same_tree_link()
returns trigger
language plpgsql
as $$
declare
  parent_tree uuid;
  child_tree uuid;
begin
  select tree_id into parent_tree from public.persons where id = new.parent_person_id;
  select tree_id into child_tree from public.persons where id = new.child_person_id;

  if parent_tree is distinct from new.tree_id or child_tree is distinct from new.tree_id then
    raise exception 'parent and child must belong to the same tree';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_same_tree_partnership()
returns trigger
language plpgsql
as $$
declare
  tree_a uuid;
  tree_b uuid;
begin
  select tree_id into tree_a from public.persons where id = new.person_a_id;
  select tree_id into tree_b from public.persons where id = new.person_b_id;

  if tree_a is distinct from new.tree_id or tree_b is distinct from new.tree_id then
    raise exception 'partners must belong to the same tree';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_same_tree_person_media()
returns trigger
language plpgsql
as $$
declare
  person_tree uuid;
  media_tree uuid;
begin
  select tree_id into person_tree from public.persons where id = new.person_id;
  select tree_id into media_tree from public.media_assets where id = new.media_id;

  if person_tree is distinct from media_tree then
    raise exception 'person and media must belong to the same tree';
  end if;

  return new;
end;
$$;

drop trigger if exists set_trees_updated_at on public.trees;
create trigger set_trees_updated_at before update on public.trees for each row execute function public.set_updated_at();

drop trigger if exists set_persons_updated_at on public.persons;
create trigger set_persons_updated_at before update on public.persons for each row execute function public.set_updated_at();

drop trigger if exists validate_same_tree_link on public.person_parent_links;
create trigger validate_same_tree_link before insert or update on public.person_parent_links for each row execute function public.ensure_same_tree_link();

drop trigger if exists validate_same_tree_partnership on public.person_partnerships;
create trigger validate_same_tree_partnership before insert or update on public.person_partnerships for each row execute function public.ensure_same_tree_partnership();

drop trigger if exists validate_same_tree_person_media on public.person_media;
create trigger validate_same_tree_person_media before insert or update on public.person_media for each row execute function public.ensure_same_tree_person_media();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.active_membership_role(tree_uuid uuid)
returns public.user_role
language sql
stable
as $$
  select role
  from public.tree_memberships
  where tree_id = tree_uuid
    and user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function public.is_active_tree_member(tree_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tree_memberships
    where tree_id = tree_uuid
      and user_id = auth.uid()
      and status = 'active'
  )
$$;

create or replace function public.can_view_tree(tree_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.trees
    where id = tree_uuid
      and (
        visibility = 'public'
        or public.is_active_tree_member(id)
      )
  )
$$;

create or replace function public.can_edit_tree(tree_uuid uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.active_membership_role(tree_uuid) in ('owner', 'admin'), false)
$$;

create or replace function public.is_tree_owner(tree_uuid uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.active_membership_role(tree_uuid) = 'owner', false)
$$;

alter table public.profiles enable row level security;
alter table public.trees enable row level security;
alter table public.tree_memberships enable row level security;
alter table public.persons enable row level security;
alter table public.person_parent_links enable row level security;
alter table public.person_partnerships enable row level security;
alter table public.media_assets enable row level security;
alter table public.person_media enable row level security;
alter table public.tree_invites enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (auth.uid() = id);

drop policy if exists trees_select_visible on public.trees;
create policy trees_select_visible on public.trees for select using (public.can_view_tree(id));

drop policy if exists trees_insert_owner on public.trees;
create policy trees_insert_owner on public.trees for insert with check (auth.uid() = owner_user_id);

drop policy if exists trees_update_owner on public.trees;
create policy trees_update_owner on public.trees for update using (public.is_tree_owner(id)) with check (public.is_tree_owner(id));

drop policy if exists trees_delete_owner on public.trees;
create policy trees_delete_owner on public.trees for delete using (public.is_tree_owner(id));

drop policy if exists memberships_select_admin_or_self on public.tree_memberships;
create policy memberships_select_admin_or_self on public.tree_memberships
for select using (public.can_edit_tree(tree_id) or auth.uid() = user_id);

drop policy if exists memberships_insert_admin_owner on public.tree_memberships;
create policy memberships_insert_admin_owner on public.tree_memberships
for insert with check (public.can_edit_tree(tree_id));

drop policy if exists memberships_update_admin_owner on public.tree_memberships;
create policy memberships_update_admin_owner on public.tree_memberships
for update using (public.can_edit_tree(tree_id))
with check (public.can_edit_tree(tree_id));

drop policy if exists persons_select_visible on public.persons;
create policy persons_select_visible on public.persons for select using (public.can_view_tree(tree_id));

drop policy if exists persons_mutate_editor on public.persons;
create policy persons_mutate_editor on public.persons for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

drop policy if exists parent_links_select_visible on public.person_parent_links;
create policy parent_links_select_visible on public.person_parent_links for select using (public.can_view_tree(tree_id));

drop policy if exists parent_links_mutate_editor on public.person_parent_links;
create policy parent_links_mutate_editor on public.person_parent_links for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

drop policy if exists partnerships_select_visible on public.person_partnerships;
create policy partnerships_select_visible on public.person_partnerships for select using (public.can_view_tree(tree_id));

drop policy if exists partnerships_mutate_editor on public.person_partnerships;
create policy partnerships_mutate_editor on public.person_partnerships for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

drop policy if exists media_select_visible on public.media_assets;
create policy media_select_visible on public.media_assets
for select using (
  public.can_view_tree(tree_id)
  and (
    visibility = 'public'
    or public.is_active_tree_member(tree_id)
  )
);

drop policy if exists media_mutate_editor on public.media_assets;
create policy media_mutate_editor on public.media_assets for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

drop policy if exists person_media_select_visible on public.person_media;
create policy person_media_select_visible on public.person_media
for select using (
  exists (
    select 1
    from public.media_assets
    where id = person_media.media_id
      and public.can_view_tree(tree_id)
      and (
        visibility = 'public'
        or public.is_active_tree_member(tree_id)
      )
  )
);

drop policy if exists person_media_mutate_editor on public.person_media;
create policy person_media_mutate_editor on public.person_media
for all using (
  exists (
    select 1
    from public.media_assets
    where id = person_media.media_id
      and public.can_edit_tree(tree_id)
  )
)
with check (
  exists (
    select 1
    from public.media_assets
    where id = person_media.media_id
      and public.can_edit_tree(tree_id)
  )
);

drop policy if exists invites_select_editor on public.tree_invites;
create policy invites_select_editor on public.tree_invites for select using (public.can_edit_tree(tree_id));

drop policy if exists invites_insert_editor on public.tree_invites;
create policy invites_insert_editor on public.tree_invites for insert with check (public.can_edit_tree(tree_id));

drop policy if exists invites_update_editor on public.tree_invites;
create policy invites_update_editor on public.tree_invites for update using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

drop policy if exists invites_delete_editor on public.tree_invites;
create policy invites_delete_editor on public.tree_invites for delete using (public.can_edit_tree(tree_id));

drop policy if exists audit_select_owner on public.audit_log;
create policy audit_select_owner on public.audit_log for select using (public.is_tree_owner(tree_id));

drop policy if exists audit_insert_editor on public.audit_log;
create policy audit_insert_editor on public.audit_log for insert with check (public.can_edit_tree(tree_id));

insert into storage.buckets (id, name, public)
values ('tree-photos', 'tree-photos', false)
on conflict (id) do nothing;
