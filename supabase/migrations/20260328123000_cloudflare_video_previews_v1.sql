alter table public.media_assets
  add column if not exists preview_status text,
  add column if not exists preview_error text,
  add column if not exists preview_attempt_count integer not null default 0,
  add column if not exists preview_claimed_at timestamptz;

alter table public.media_assets
  drop constraint if exists media_assets_preview_status_check;

alter table public.media_assets
  add constraint media_assets_preview_status_check check (
    preview_status is null or preview_status in ('pending', 'processing', 'ready', 'failed')
  );

create index if not exists media_assets_cloudflare_video_preview_jobs_idx
  on public.media_assets (preview_status, preview_claimed_at, created_at)
  where kind = 'video' and provider = 'cloudflare_r2';

drop function if exists public.claim_cloudflare_video_preview_jobs(integer, uuid[], boolean, integer);

create or replace function public.claim_cloudflare_video_preview_jobs(
  limit_count integer default 3,
  media_ids uuid[] default null,
  force_retry boolean default false,
  stale_after_seconds integer default 600
)
returns setof public.media_assets
language plpgsql
security definer
set search_path = public
as $$
begin
  if force_retry and media_ids is not null and array_length(media_ids, 1) is not null then
    update public.media_assets
    set
      preview_status = 'pending',
      preview_error = null,
      preview_attempt_count = 0,
      preview_claimed_at = null
    where id = any(media_ids)
      and kind = 'video'
      and provider = 'cloudflare_r2';
  end if;

  return query
  with eligible as (
    select media_assets.id
    from public.media_assets
    where media_assets.kind = 'video'
      and media_assets.provider = 'cloudflare_r2'
      and (
        media_ids is null
        or media_assets.id = any(media_ids)
      )
      and (
        media_assets.preview_status = 'pending'
        or (
          media_assets.preview_status = 'processing'
          and media_assets.preview_claimed_at is not null
          and media_assets.preview_claimed_at < timezone('utc', now()) - make_interval(secs => greatest(stale_after_seconds, 1))
        )
      )
    order by media_assets.created_at asc, media_assets.id asc
    limit greatest(limit_count, 0)
    for update skip locked
  ),
  updated as (
    update public.media_assets
    set
      preview_status = 'processing',
      preview_claimed_at = timezone('utc', now()),
      preview_attempt_count = coalesce(public.media_assets.preview_attempt_count, 0) + 1,
      preview_error = null
    from eligible
    where public.media_assets.id = eligible.id
    returning public.media_assets.*
  )
  select * from updated;
end;
$$;
