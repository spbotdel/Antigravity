create table if not exists public.media_asset_variants (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_assets(id) on delete cascade,
  variant text not null,
  storage_path text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (media_id, variant),
  constraint media_asset_variants_variant_check check (variant in ('thumb', 'small', 'medium'))
);

alter table public.media_asset_variants enable row level security;

drop policy if exists media_asset_variants_select_visible on public.media_asset_variants;
create policy media_asset_variants_select_visible on public.media_asset_variants
for select using (
  exists (
    select 1
    from public.media_assets
    where media_assets.id = media_asset_variants.media_id
      and public.can_view_tree(media_assets.tree_id)
  )
);

drop policy if exists media_asset_variants_mutate_editor on public.media_asset_variants;
create policy media_asset_variants_mutate_editor on public.media_asset_variants
for all using (
  exists (
    select 1
    from public.media_assets
    where media_assets.id = media_asset_variants.media_id
      and public.can_edit_tree(media_assets.tree_id)
  )
)
with check (
  exists (
    select 1
    from public.media_assets
    where media_assets.id = media_asset_variants.media_id
      and public.can_edit_tree(media_assets.tree_id)
  )
);
