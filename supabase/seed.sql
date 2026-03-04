do $$
declare
  owner_id uuid;
  tree_uuid uuid;
  root_id uuid;
  child_id uuid;
begin
  select id into owner_id from auth.users order by created_at asc limit 1;

  if owner_id is null then
    raise notice 'No auth.users rows found. Create a user first, then re-run seed.sql';
    return;
  end if;

  insert into public.profiles (id, email, display_name)
  select id, email, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
  from auth.users
  where id = owner_id
  on conflict (id) do nothing;

  insert into public.trees (owner_user_id, slug, title, description, visibility)
  values (owner_id, 'demo-family', 'Demo Family Atlas', 'Seeded example tree', 'public')
  on conflict (owner_user_id) do update set title = excluded.title
  returning id into tree_uuid;

  if tree_uuid is null then
    select id into tree_uuid from public.trees where owner_user_id = owner_id limit 1;
  end if;

  insert into public.tree_memberships (tree_id, user_id, role, status)
  values (tree_uuid, owner_id, 'owner', 'active')
  on conflict (tree_id, user_id) do nothing;

  insert into public.persons (id, tree_id, full_name, gender, birth_date, birth_place, bio, is_living, created_by)
  values
    (gen_random_uuid(), tree_uuid, 'Seed Ancestor', 'male', date '1950-01-01', 'Moscow', 'Initial root person created by seed.', false, owner_id),
    (gen_random_uuid(), tree_uuid, 'Seed Descendant', 'female', date '1980-04-12', 'Saint Petersburg', 'Child record for local testing.', true, owner_id)
  on conflict do nothing;

  select id into root_id from public.persons where persons.tree_id = tree_uuid order by created_at asc limit 1;
  select id into child_id from public.persons where persons.tree_id = tree_uuid order by created_at desc limit 1;

  update public.trees set root_person_id = root_id where id = tree_uuid;

  if root_id is not null and child_id is not null and root_id <> child_id then
    insert into public.person_parent_links (tree_id, parent_person_id, child_person_id, relation_type)
    values (tree_uuid, root_id, child_id, 'biological')
    on conflict do nothing;
  end if;
end
$$;
