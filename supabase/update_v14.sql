-- Nook v14: two-factor sign-in for staff, more staff tools (groups, announcements, signup chart).
-- Safe to run more than once. Run after update_v13.sql.
-- Before using two-factor, check Supabase > Authentication > Sign In / Providers > Multi-Factor: "TOTP" must be enabled.

-- Staff powers now need a two-factor sign-in (aal2) as well as the staff badge.
create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and 'staff' = any(badges));
$$;

-- ───────────── Site-wide announcement ─────────────
create table if not exists site_notice (
  id int primary key default 1 check (id = 1),
  body text not null default '',
  level text not null default 'info' check (level in ('info', 'warn')),
  updated_at timestamptz not null default now()
);
insert into site_notice (id, body) values (1, '') on conflict do nothing;
alter table site_notice enable row level security;
drop policy if exists "site_notice read" on site_notice;
create policy "site_notice read" on site_notice for select to anon, authenticated using (true);

create or replace function admin_set_notice(text_in text, lvl text default 'info') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  update site_notice set body = left(coalesce(text_in, ''), 300), level = case when lvl = 'warn' then 'warn' else 'info' end, updated_at = now() where id = 1;
  perform log_admin('set_notice', null, left(coalesce(text_in, ''), 200));
end $$;

-- ───────────── Groups ─────────────
create or replace function admin_find_groups(q text) returns table (id uuid, name text, created_at timestamptz, members bigint, channels bigint, founder text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select g.id, g.name, g.created_at,
           (select count(*) from group_members m where m.group_id = g.id),
           (select count(*) from channels c where c.group_id = g.id),
           (select p.username from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id and m.role = 'founder' limit 1)
    from groups g
    where q = '' or g.name ilike '%' || replace(q, '%', '') || '%' or g.id::text = q
    order by g.created_at desc limit 30;
end $$;

create or replace function admin_delete_group(gid uuid, why text default null) returns void
language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  select name into gname from groups where id = gid;
  delete from groups where id = gid;
  perform log_admin('delete_group', gid::text, coalesce(gname, '') || ' · ' || coalesce(why, ''));
end $$;

-- ───────────── Overview: people joining per day ─────────────
create or replace function admin_stats() returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'new_users_24h', (select count(*) from profiles where created_at > now() - interval '24 hours'),
    'groups', (select count(*) from groups),
    'messages_24h', (select count(*) from messages where created_at > now() - interval '24 hours'),
    'open_reports', (select count(*) from reports where not resolved),
    'banned', (select count(*) from profiles where banned_at is not null),
    'signups_7d', (select coalesce(jsonb_agg(c order by d), '[]'::jsonb) from (
        select d::date as d, (select count(*) from profiles p where p.created_at::date = d::date) as c
        from generate_series(now() - interval '6 days', now(), interval '1 day') d) t));
end $$;
