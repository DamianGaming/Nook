-- Run this once in the Supabase SQL editor.
-- Automatically creates a profile whenever someone signs up, and fixes accounts that are missing one.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; final text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'));
  base := left(rpad(base, 3, '0'), 20);
  final := base;
  while exists (select 1 from profiles where username = final) loop
    n := n + 1;
    final := left(base, 16) || n::text;
  end loop;
  insert into profiles (id, username, display_name) values (new.id, final, final) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: give every existing account without a profile one
do $$
declare u record; base text; final text; n int;
begin
  for u in select id, email, raw_user_meta_data from auth.users where id not in (select id from profiles) loop
    base := lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)), '[^a-z0-9_]', '', 'g'));
    base := left(rpad(base, 3, '0'), 20);
    final := base; n := 0;
    while exists (select 1 from profiles where username = final) loop
      n := n + 1;
      final := left(base, 16) || n::text;
    end loop;
    insert into profiles (id, username, display_name) values (u.id, final, final);
  end loop;
end $$;
