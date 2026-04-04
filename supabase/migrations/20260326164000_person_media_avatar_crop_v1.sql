alter table public.person_media
  add column if not exists avatar_crop_x double precision not null default 0.5;

alter table public.person_media
  add column if not exists avatar_crop_y double precision not null default 0.5;

alter table public.person_media
  add column if not exists avatar_crop_zoom double precision not null default 1;
