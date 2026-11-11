-- Nook v31: site settings and a bigger staff panel, forms (modals) for bots, bot status for the developer portal.
-- Safe to run more than once. Run after update_v30.sql.

-- ───────────── Site settings (staff change them in the staff panel) ─────────────
create table if not exists site_settings (
  key text primary key check (key in ('signups_open', 'read_only')),
  value jsonb not null default 'true',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
alter table site_settings enable row level security;
drop policy if exists "site_settings read" on site_settings;
create policy "site_settings read" on site_settings for select to anon, authenticated using (true);
insert into site_settings (key, value) values ('signups_open', 'true'), ('read_only', 'false') on conflict do nothing;

create or replace function setting_bool(k text, dflt boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from site_settings where key = k), dflt)
$$;

create or replace function admin_set_setting(k text, v boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  if k not in ('signups_open', 'read_only') then raise exception 'Unknown setting'; end if;
  insert into site_settings (key, value, updated_at, updated_by) values (k, to_jsonb(v), now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform log_admin('setting_' || k, k, v::text);
end $$;

-- New people cannot join while sign-ups are paused (bots are made by existing people, so they are not blocked).
create or replace function enforce_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(new.is_bot, false) and not setting_bool('signups_open', true) then raise exception 'New sign-ups are paused right now. Please try again later.'; end if;
  return new;
end $$;
drop trigger if exists profiles_signups on profiles;
create trigger profiles_signups before insert on profiles for each row execute function enforce_signups();

-- Read-only mode: only staff can post (for maintenance).
create or replace function enforce_read_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if setting_bool('read_only', false) and not exists (select 1 from profiles where id = new.author_id and 'staff' = any(badges)) then
    raise exception 'Nook is read-only for a little while (maintenance). Please try again soon.';
  end if;
  return new;
end $$;
drop trigger if exists messages_read_only on messages;
create trigger messages_read_only before insert on messages for each row execute function enforce_read_only();

-- ───────────── Staff: richer numbers, bots, one person's details ─────────────
create or replace function admin_stats2() returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles where not is_bot),
    'new_24h', (select count(*) from profiles where not is_bot and created_at > now() - interval '24 hours'),
    'new_7d', (select count(*) from profiles where not is_bot and created_at > now() - interval '7 days'),
    'active_24h', (select count(distinct author_id) from messages where created_at > now() - interval '24 hours'),
    'groups', (select count(*) from groups),
    'bots', (select count(*) from bots),
    'bots_online', (select count(*) from bots where last_seen > now() - interval '75 seconds'),
    'messages_24h', (select count(*) from messages where created_at > now() - interval '24 hours'),
    'messages_total', (select count(*) from messages),
    'open_reports', (select count(*) from reports where not resolved),
    'reports_7d', (select count(*) from reports where created_at > now() - interval '7 days'),
    'banned', (select count(*) from profiles where banned_at is not null),
    'signups_7d', (select coalesce(jsonb_agg(c order by d), '[]'::jsonb) from (
        select d::date as d, (select count(*) from profiles p where not p.is_bot and p.created_at::date = d::date) as c
        from generate_series(now() - interval '6 days', now(), interval '1 day') d) t),
    'messages_7d', (select coalesce(jsonb_agg(c order by d), '[]'::jsonb) from (
        select d::date as d, (select count(*) from messages m where m.created_at::date = d::date) as c
        from generate_series(now() - interval '6 days', now(), interval '1 day') d) t),
    'days', (select coalesce(jsonb_agg(to_char(d, 'Dy') order by d), '[]'::jsonb) from generate_series(now() - interval '6 days', now(), interval '1 day') d));
end $$;

create or replace function admin_bots(q text default '')
returns table (id uuid, username text, display_name text, owner_name text, created_at timestamptz, last_seen timestamptz, groups bigint, commands bigint, banned_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  return query
    select b.id, p.username, p.display_name, o.username, b.created_at, b.last_seen,
           (select count(*) from group_members m where m.user_id = b.id),
           (select count(*) from bot_commands c where c.bot_id = b.id), p.banned_at
    from bots b join profiles p on p.id = b.id left join profiles o on o.id = b.owner
    where coalesce(q, '') = '' or p.username ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or p.display_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or o.username ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
    order by b.last_seen desc nulls last, b.created_at desc limit 60;
end $$;

create or replace function admin_user_detail(uid uuid) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare r jsonb;
begin
  if not is_staff() then raise exception 'Staff only'; end if;
  select jsonb_build_object(
    'groups', (select count(*) from group_members where user_id = uid),
    'messages', (select count(*) from messages where author_id = uid),
    'messages_7d', (select count(*) from messages where author_id = uid and created_at > now() - interval '7 days'),
    'last_message', (select max(created_at) from messages where author_id = uid),
    'bots', (select count(*) from bots where owner = uid),
    'reports_against', (select count(*) from reports where reported_user = uid),
    'reports_made', (select count(*) from reports where reporter = uid)) into r;
  return r;
end $$;

grant execute on function setting_bool(text, boolean), admin_set_setting(text, boolean), admin_stats2(), admin_bots(text), admin_user_detail(uuid) to authenticated;
revoke execute on function admin_set_setting(text, boolean), admin_stats2(), admin_bots(text), admin_user_detail(uuid) from anon;
revoke all on function enforce_signups(), enforce_read_only() from public;

-- ───────────── Developer portal: is the bot running, how many commands ─────────────
create or replace function my_bots_status() returns table (id uuid, last_seen timestamptz, commands bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.last_seen, (select count(*) from bot_commands c where c.bot_id = b.id) from bots b where b.owner = auth.uid()
$$;
grant execute on function my_bots_status() to authenticated;

-- ───────────── Forms (modals) a bot can open ─────────────
-- A bot answers a command or button with a form. The person fills it in; their answers come back as an interaction of kind 'modal'.
alter table interactions drop constraint if exists interactions_kind_check;
alter table interactions add constraint interactions_kind_check check (kind in ('command', 'button', 'select', 'modal'));

create table if not exists modal_requests (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions(id) on delete cascade,
  bot_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  def jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists modal_requests_user_idx on modal_requests (user_id, channel_id, created_at);
alter table modal_requests enable row level security;
drop policy if exists "modal_requests own" on modal_requests;
create policy "modal_requests own" on modal_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "modal_requests drop own" on modal_requests;
create policy "modal_requests drop own" on modal_requests for delete to authenticated using (user_id = auth.uid());

-- def: { id, title, fields: [{ id, label, style: 'short'|'paragraph', placeholder, required, min, max, value }] }  (1 to 5 fields)
create or replace function bot_modal(token text, interaction uuid, def jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); i record; f jsonb; clean jsonb := '[]'; rid uuid; n int := 0;
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'send', 60, interval '1 minute');
  select * into i from interactions x where x.id = interaction and x.bot_id = bid;
  if i.id is null then raise exception 'That interaction is not for this bot'; end if;
  if i.created_at < now() - interval '15 minutes' then raise exception 'That interaction has expired (answer within 15 minutes)'; end if;
  if i.kind = 'modal' then raise exception 'A form cannot open another form'; end if;
  if jsonb_typeof(def) <> 'object' or coalesce(def->>'id', '') !~ '^[A-Za-z0-9_:.-]{1,64}$' then raise exception 'A form needs an id (letters, numbers, _ : . -)'; end if;
  if char_length(coalesce(def->>'title', '')) not between 1 and 45 then raise exception 'A form title must be 1 to 45 characters'; end if;
  if jsonb_typeof(def->'fields') <> 'array' or jsonb_array_length(def->'fields') not between 1 and 5 then raise exception 'A form needs 1 to 5 fields'; end if;
  for f in select * from jsonb_array_elements(def->'fields') loop
    n := n + 1;
    if coalesce(f->>'id', '') !~ '^[A-Za-z0-9_]{1,32}$' then raise exception 'Field % needs an id (letters, numbers, _)', n; end if;
    if char_length(coalesce(f->>'label', '')) not between 1 and 45 then raise exception 'Field % needs a label of 1 to 45 characters', n; end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', f->>'id', 'label', f->>'label',
      'style', case when f->>'style' = 'paragraph' then 'paragraph' else 'short' end,
      'placeholder', left(coalesce(f->>'placeholder', ''), 100),
      'required', coalesce((f->>'required')::boolean, true),
      'min', least(greatest(coalesce((f->>'min')::int, 0), 0), 1000),
      'max', least(greatest(coalesce((f->>'max')::int, 400), 1), 1000),
      'value', left(coalesce(f->>'value', ''), 1000)));
  end loop;
  delete from modal_requests where user_id = i.user_id and channel_id = i.channel_id and created_at < now() - interval '15 minutes';
  insert into modal_requests (interaction_id, bot_id, user_id, channel_id, def)
    values (i.id, bid, i.user_id, i.channel_id, jsonb_build_object('id', def->>'id', 'title', def->>'title', 'fields', clean, 'submit', left(coalesce(def->>'submit', 'Submit'), 20)))
    returning id into rid;
  return rid;
end $$;

-- The person sends the form back. Their answers reach the bot as options of an interaction (kind 'modal', name = the form id).
create or replace function submit_modal(req uuid, vals jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r record; f jsonb; v text; clean jsonb := '{}'; iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('modal', 30, interval '1 minute');
  select m.*, i.message_id, i.group_id into r from modal_requests m join interactions i on i.id = m.interaction_id where m.id = req and m.user_id = auth.uid();
  if r.id is null then raise exception 'That form has expired'; end if;
  if r.created_at < now() - interval '15 minutes' then raise exception 'That form has expired'; end if;
  if not is_group_member(r.group_id) then raise exception 'You are not in that group'; end if;
  for f in select * from jsonb_array_elements(r.def->'fields') loop
    v := coalesce(vals->>(f->>'id'), '');
    if (f->>'required')::boolean and btrim(v) = '' then raise exception '% is required', f->>'label'; end if;
    if v <> '' and char_length(v) < (f->>'min')::int then raise exception '% needs at least % characters', f->>'label', f->>'min'; end if;
    if char_length(v) > (f->>'max')::int then raise exception '% can be at most % characters', f->>'label', f->>'max'; end if;
    clean := clean || jsonb_build_object(f->>'id', v);
  end loop;
  insert into interactions (bot_id, group_id, channel_id, user_id, kind, name, options, message_id)
    values (r.bot_id, r.group_id, r.channel_id, auth.uid(), 'modal', r.def->>'id', clean, r.message_id) returning id into iid;
  delete from modal_requests where id = req;
  return iid;
end $$;
grant execute on function bot_modal(text, uuid, jsonb), submit_modal(uuid, jsonb) to authenticated, anon;
revoke execute on function submit_modal(uuid, jsonb) from anon;
