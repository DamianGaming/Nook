-- Nook v13: always-on encryption (automatic keys), staff admin panel, image channel icons.
-- Safe to run more than once. Run after update_v12.sql.

-- ───────────── Automatic encryption keys ─────────────
-- By default your key backup is opened with a random secret kept in your own row, so encryption works on every device
-- without typing anything. If you add your own passphrase in Settings, this row is deleted and only you can open the backup.
create table if not exists key_secrets (
  user_id uuid primary key references profiles(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now()
);
alter table key_secrets enable row level security;
drop policy if exists "key_secrets own" on key_secrets;
create policy "key_secrets own" on key_secrets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Image icons for channels ─────────────
alter table channels add column if not exists icon_url text;
alter table channels drop constraint if exists channels_icon_url_check;
alter table channels add constraint channels_icon_url_check
  check (icon_url is null or (char_length(icon_url) <= 500 and icon_url like '%/storage/v1/object/public/media/%'));

-- ───────────── Staff admin panel ─────────────
-- Staff are people whose profile has the 'staff' badge (only you can give it, from the SQL editor):
--   update profiles set badges = array['staff'] where username = 'yourname';
create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and 'staff' = any(badges));
$$;

alter table profiles add column if not exists banned_at timestamptz;
alter table profiles add column if not exists ban_reason text;

alter table reports add column if not exists resolved_by uuid references profiles(id) on delete set null;
alter table reports add column if not exists resolved_at timestamptz;
alter table reports add column if not exists note text;

create table if not exists admin_log (
  id bigint generated always as identity primary key,
  staff uuid references profiles(id) on delete set null,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
alter table admin_log enable row level security;
drop policy if exists "admin_log staff read" on admin_log;
create policy "admin_log staff read" on admin_log for select to authenticated using (is_staff());

-- Badges and bans can only change through the staff functions below (or the SQL editor).
create or replace function protect_badges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('nook.admin', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.badges := '{}'; new.banned_at := null; new.ban_reason := null;
    else
      new.badges := old.badges; new.banned_at := old.banned_at; new.ban_reason := old.ban_reason;
    end if;
  end if;
  return new;
end $$;

create or replace function log_admin(a text, t text, d text) returns void
language sql security definer set search_path = public as $$
  insert into admin_log (staff, action, target, detail) values (auth.uid(), a, t, left(d, 500));
$$;

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
    'banned', (select count(*) from profiles where banned_at is not null));
end $$;

create or replace function admin_reports(only_open boolean default true, lim int default 100)
returns table (id uuid, created_at timestamptz, category text, reason text, snapshot text, resolved boolean, note text,
               message_id uuid, reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, reported_banned boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select r.id, r.created_at, r.category, r.reason, r.message_snapshot, r.resolved, r.note, r.message_id,
           r.reporter, coalesce(a.display_name, a.username), r.reported_user, coalesce(b.display_name, b.username), b.banned_at is not null
    from reports r left join profiles a on a.id = r.reporter left join profiles b on b.id = r.reported_user
    where (not only_open or not r.resolved)
    order by r.created_at desc limit least(lim, 300);
end $$;

create or replace function admin_resolve_report(rid uuid, done boolean, note_text text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  update reports set resolved = done, note = left(note_text, 500), resolved_by = case when done then auth.uid() end,
         resolved_at = case when done then now() end where id = rid;
  perform log_admin(case when done then 'resolve_report' else 'reopen_report' end, rid::text, note_text);
end $$;

create or replace function admin_find_users(q text) returns table (id uuid, username text, display_name text, created_at timestamptz,
  badges text[], banned_at timestamptz, ban_reason text, reports_against bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select p.id, p.username, p.display_name, p.created_at, p.badges, p.banned_at, p.ban_reason,
           (select count(*) from reports r where r.reported_user = p.id)
    from profiles p
    where p.username ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or p.display_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or p.id::text = q
    order by p.created_at desc limit 25;
end $$;

create or replace function admin_set_ban(uid uuid, ban boolean, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  if uid = auth.uid() then raise exception 'You cannot suspend yourself'; end if;
  if exists (select 1 from profiles where id = uid and 'staff' = any(badges)) then raise exception 'Staff accounts cannot be suspended here'; end if;
  perform set_config('nook.admin', '1', true);
  update profiles set banned_at = case when ban then now() end, ban_reason = case when ban then left(why, 300) end where id = uid;
  perform log_admin(case when ban then 'suspend_user' else 'unsuspend_user' end, uid::text, why);
end $$;

create or replace function admin_delete_message(mid uuid, why text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  delete from messages where id = mid;
  perform log_admin('delete_message', mid::text, why);
end $$;

create or replace function admin_set_badges(uid uuid, new_badges text[]) returns void
language plpgsql security definer set search_path = public as $$
declare keep_staff boolean;
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  select 'staff' = any(badges) into keep_staff from profiles where id = uid;
  perform set_config('nook.admin', '1', true);
  -- The staff badge itself is only ever changed from the SQL editor.
  update profiles set badges = (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(new_badges, '{}')) x
      where x in ('team','early','supporter','bughunter','creator','mod','partner','tester','translator','champion'))
      || case when keep_staff then array['staff'] else '{}'::text[] end
    where id = uid;
  perform log_admin('set_badges', uid::text, array_to_string(new_badges, ','));
end $$;

-- Suspended accounts cannot post.
drop policy if exists "messages insert" on messages;
create policy "messages insert" on messages for insert to authenticated with check (
  author_id = auth.uid()
  and not exists (select 1 from profiles p where p.id = auth.uid() and p.banned_at is not null)
  and (
    (channel_id is not null and is_group_member(channel_group(channel_id)))
    or (dm_id is not null and is_dm_member(dm_id) and not exists (
      select 1 from dms d where d.id = dm_id and is_blocked_between(d.user_a, d.user_b)))
  )
);
