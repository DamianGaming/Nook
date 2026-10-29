-- Nook v6: group voice rooms, drag-and-drop layout saving, badges, richer statuses.
-- Safe to re-run.

-- ───────────── Group voice (one voice room per group, shown at the top of the group) ─────────────
create table if not exists group_voice (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table group_voice enable row level security;

drop policy if exists "gvoice read" on group_voice;
drop policy if exists "gvoice insert" on group_voice;
drop policy if exists "gvoice update" on group_voice;
drop policy if exists "gvoice delete" on group_voice;
create policy "gvoice read" on group_voice for select to authenticated using (is_group_member(group_id));
create policy "gvoice insert" on group_voice for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));
create policy "gvoice update" on group_voice for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gvoice delete" on group_voice for delete to authenticated using (user_id = auth.uid());

create or replace function group_voice_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    delete from group_voice where updated_at < now() - interval '5 minutes';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists group_voice_touch on group_voice;
create trigger group_voice_touch before insert or update on group_voice for each row execute function group_voice_touch();

create or replace function group_voice_roster(gids uuid[]) returns table (group_id uuid, user_id uuid)
language sql security definer stable set search_path = public as $$
  select v.group_id, v.user_id
  from group_voice v
  where v.group_id = any(gids)
    and v.updated_at > now() - interval '120 seconds'
    and is_group_member(v.group_id)
$$;

-- ───────────── Saving a drag-and-drop layout in one go ─────────────
-- cats: [{"id": uuid, "position": int}], chans: [{"id": uuid, "category_id": uuid|null, "position": int}]
create or replace function reorder_layout(gid uuid, cats jsonb, chans jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_founder(gid) then raise exception 'Only the founder can rearrange channels'; end if;
  update categories c set position = (x->>'position')::int
    from jsonb_array_elements(cats) x
    where c.id = (x->>'id')::uuid and c.group_id = gid;
  update channels c set position = (x->>'position')::int,
                        category_id = nullif(x->>'category_id', '')::uuid
    from jsonb_array_elements(chans) x
    where c.id = (x->>'id')::uuid and c.group_id = gid
      and (nullif(x->>'category_id', '') is null
           or exists (select 1 from categories k where k.id = nullif(x->>'category_id', '')::uuid and k.group_id = gid));
end $$;

-- ───────────── Badges and statuses ─────────────
alter table profiles add column if not exists badges text[] not null default '{}';
alter table profiles add column if not exists status_icon text not null default '' check (char_length(status_icon) <= 16);
alter table profiles add column if not exists status_expires_at timestamptz;

-- People can never give themselves badges. Run SQL in the Supabase SQL editor to hand them out, for example:
--   update profiles set badges = array['team','early'] where username = 'damian';
create or replace function protect_badges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.badges := '{}';
    else new.badges := old.badges; end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_badges on profiles;
create trigger protect_badges before insert or update on profiles for each row execute function protect_badges();

-- ───────────── Realtime ─────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_voice') then
    alter publication supabase_realtime add table group_voice;
  end if;
end $$;
