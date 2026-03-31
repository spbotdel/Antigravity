-- Add 'audio' value to the media_kind enum (idempotent).
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so this must be a standalone migration.
alter type public.media_kind add value if not exists 'audio';
