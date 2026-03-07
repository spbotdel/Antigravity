do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'media_provider' and e.enumlabel = 'object_storage'
  ) then
    null;
  else
    alter type public.media_provider add value 'object_storage';
  end if;
end
$$;
