create table if not exists public.tree_share_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  label text not null default 'Семейный просмотр',
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists tree_share_links_tree_id_idx on public.tree_share_links (tree_id, created_at desc);

alter table public.tree_share_links enable row level security;

drop policy if exists tree_share_links_select_editor on public.tree_share_links;
create policy tree_share_links_select_editor on public.tree_share_links
for select using (public.can_edit_tree(tree_id));

drop policy if exists tree_share_links_insert_editor on public.tree_share_links;
create policy tree_share_links_insert_editor on public.tree_share_links
for insert with check (public.can_edit_tree(tree_id));

drop policy if exists tree_share_links_update_editor on public.tree_share_links;
create policy tree_share_links_update_editor on public.tree_share_links
for update using (public.can_edit_tree(tree_id))
with check (public.can_edit_tree(tree_id));

drop policy if exists tree_share_links_delete_editor on public.tree_share_links;
create policy tree_share_links_delete_editor on public.tree_share_links
for delete using (public.can_edit_tree(tree_id));
