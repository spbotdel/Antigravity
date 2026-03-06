do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'media_kind' and e.enumlabel = 'document'
  ) then
    null;
  else
    alter type public.media_kind add value 'document';
  end if;
end
$$;
