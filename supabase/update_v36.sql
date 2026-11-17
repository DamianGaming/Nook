-- Update 36: avatar decorations, slash commands that need a permission.
-- Safe to run more than once. Run it in the Supabase SQL editor after update_v34.sql.

-- ───────────── Avatar decorations ─────────────
alter table profiles add column if not exists deco text not null default 'none';
alter table profiles drop constraint if exists profiles_deco_check;
alter table profiles add constraint profiles_deco_check
  check (deco in ('none','crown','halo','ears','sprout','bow','antenna','sparkles','hearts','wreath'));

-- ───────────── Bot commands that need a permission ─────────────
-- A bot can say a command needs one of the group permissions (channels, messages, emoji, invites, members, customize).
-- The founder always passes. People without it do not see the command in the "/" menu and cannot run it.
alter table bot_commands add column if not exists perm text;

create or replace function bot_register_commands(token text, cmds jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare bid uuid := bot_auth(token); c jsonb; o jsonb; ch jsonb; n int := 0; seen text[] := '{}';
begin
  if bid is null then raise exception 'Invalid bot token'; end if;
  perform bot_hit(bid, 'register', 10, interval '1 minute');
  if cmds is null or jsonb_typeof(cmds) <> 'array' then raise exception 'Commands must be a list'; end if;
  if jsonb_array_length(cmds) > 200 then raise exception 'A bot can have up to 200 slash commands'; end if;
  for c in select * from jsonb_array_elements(cmds) loop
    if coalesce(c->>'name', '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Command names use lowercase letters, numbers, - and _ (1 to 32 characters): %', c->>'name'; end if;
    if (c->>'name') = any(seen) then raise exception 'Two commands are called %', c->>'name'; end if;
    seen := seen || (c->>'name');
    if c ? 'perm' and c->>'perm' is not null and c->>'perm' not in ('channels','messages','emoji','invites','members','customize') then raise exception 'perm must be one of channels, messages, emoji, invites, members, customize: %', c->>'perm'; end if;
    if char_length(coalesce(c->>'description', '')) not between 1 and 100 then raise exception 'Command % needs a description of 1 to 100 characters', c->>'name'; end if;
    if jsonb_typeof(coalesce(c->'options', '[]')) <> 'array' or jsonb_array_length(coalesce(c->'options', '[]')) > 10 then raise exception 'A command can have up to 10 options'; end if;
    for o in select * from jsonb_array_elements(coalesce(c->'options', '[]')) loop
      if coalesce(o->>'name', '') !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Option names use lowercase letters, numbers, - and _: %', o->>'name'; end if;
      if char_length(coalesce(o->>'description', '')) not between 1 and 100 then raise exception 'Option % needs a description of 1 to 100 characters', o->>'name'; end if;
      if coalesce(o->>'type', 'string') not in ('string', 'integer', 'number', 'boolean', 'user', 'channel') then raise exception 'Option type must be string, integer, number, boolean, user or channel'; end if;
      if o ? 'choices' then
        if jsonb_typeof(o->'choices') <> 'array' or jsonb_array_length(o->'choices') > 25 then raise exception 'An option can have up to 25 choices'; end if;
        for ch in select * from jsonb_array_elements(o->'choices') loop
          if char_length(coalesce(ch->>'name', '')) not between 1 and 60 or char_length(coalesce(ch->>'value', '')) not between 1 and 100 then raise exception 'Each choice needs a name (up to 60) and a value (up to 100)'; end if;
        end loop;
      end if;
    end loop;
  end loop;
  delete from bot_commands where bot_id = bid;
  for c in select * from jsonb_array_elements(cmds) loop
    insert into bot_commands(bot_id, name, description, options, perm) values (bid, c->>'name', c->>'description',
      coalesce((select jsonb_agg(jsonb_build_object('name', x->>'name', 'description', x->>'description', 'type', coalesce(x->>'type', 'string'),
        'required', coalesce((x->>'required')::boolean, false), 'choices', coalesce(x->'choices', '[]'::jsonb))) from jsonb_array_elements(coalesce(c->'options', '[]')) x), '[]'::jsonb), nullif(c->>'perm', ''));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function group_slash_commands(gid uuid)
returns table (bot_id uuid, bot_username text, bot_name text, bot_avatar text, name text, description text, options jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(gid) then return; end if;
  return query select c.bot_id, p.username, p.display_name, p.avatar_url, c.name, c.description, c.options
    from bot_commands c join group_members m on m.user_id = c.bot_id and m.group_id = gid join profiles p on p.id = c.bot_id
    where c.perm is null or has_perm(gid, c.perm)
    order by c.name, p.username;
end $$;

create or replace function invoke_command(channel uuid, bot uuid, cmd text, opts jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; req text; def jsonb; o jsonb; v jsonb; clean jsonb := '{}'; iid uuid; t text; s text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform hit('slash', 30, interval '1 minute');
  select c.group_id into gid from channels c where c.id = channel;
  if gid is null or not is_group_member(gid) then raise exception 'You are not in that group'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = bot) then raise exception 'That bot is not in this group'; end if;
  select options, perm into def, req from bot_commands where bot_id = bot and name = lower(cmd);
  if def is null then raise exception 'That command does not exist any more'; end if;
  if req is not null and not has_perm(gid, req) then raise exception 'You need the "%" permission in this group to use that command', req; end if;
  opts := coalesce(opts, '{}');
  if jsonb_typeof(opts) <> 'object' then raise exception 'Options must be an object'; end if;
  for o in select * from jsonb_array_elements(def) loop
    v := opts -> (o->>'name'); t := o->>'type';
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      if (o->>'required')::boolean then raise exception 'Fill in "%"', o->>'name'; end if;
      continue;
    end if;
    s := v #>> '{}';
    if char_length(s) > 1000 then raise exception '"%" is too long', o->>'name'; end if;
    if t = 'integer' and s !~ '^-?[0-9]{1,15}$' then raise exception '"%" must be a whole number', o->>'name'; end if;
    if t = 'number' and s !~ '^-?[0-9]{1,15}(\.[0-9]{1,10})?$' then raise exception '"%" must be a number', o->>'name'; end if;
    if t = 'boolean' and s not in ('true', 'false') then raise exception '"%" must be yes or no', o->>'name'; end if;
    if t = 'user' and not exists (select 1 from profiles p join group_members gm on gm.user_id = p.id where gm.group_id = gid and p.username = lower(s)) then raise exception 'Nobody called "%" is in this group', s; end if;
    if t = 'channel' and not exists (select 1 from channels c where c.group_id = gid and c.name = lower(s)) then raise exception 'There is no channel called "%"', s; end if;
    if jsonb_array_length(coalesce(o->'choices', '[]')) > 0 and not exists (select 1 from jsonb_array_elements(o->'choices') ch where ch->>'value' = s) then raise exception '"%" must be one of the listed choices', o->>'name'; end if;
    clean := clean || jsonb_build_object(o->>'name', case t when 'integer' then to_jsonb(s::bigint) when 'number' then to_jsonb(s::numeric) when 'boolean' then to_jsonb(s::boolean) else to_jsonb(case when t in ('user', 'channel') then lower(s) else s end) end);
  end loop;
  if random() < 0.05 then
    delete from interactions where created_at < now() - interval '1 day';
    delete from ephemeral_messages where created_at < now() - interval '2 hours';
  end if;
  insert into interactions(bot_id, group_id, channel_id, user_id, kind, name, options) values (bot, gid, channel, auth.uid(), 'command', lower(cmd), clean) returning id into iid;
  return iid;
end $$;

grant execute on function bot_register_commands(text, jsonb) to anon, authenticated;
grant execute on function group_slash_commands(uuid), invoke_command(uuid, uuid, text, jsonb) to authenticated;
