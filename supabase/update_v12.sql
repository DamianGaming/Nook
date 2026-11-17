-- Nook v12: custom emoji, official Staff badge, per-member group permissions (no roles), channel and group customisation.
-- Safe to run more than once. Run after update_v11.sql.

-- ───────────── Per-member permissions ─────────────
-- The founder can always do everything. Everyone else can be given individual powers, one switch each.
-- channels: create, edit, delete and rearrange channels and categories
-- messages: delete other people's messages, and post in read-only channels and ignore slowmode
-- emoji:    add and remove the group's custom emoji
-- invites:  make a new invite code
-- members:  remove members (never the founder)
-- customize: change the group's name, icon, banner, description and colour
alter table group_members add column if not exists perms text[] not null default '{}';

create or replace function has_perm(gid uuid, p text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members
    where group_id = gid and user_id = auth.uid() and (role = 'founder' or p = any(perms)));
$$;

create or replace function set_member_perms(gid uuid, uid uuid, new_perms text[]) returns void
language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if not is_group_founder(gid) then raise exception 'Only the founder can change permissions'; end if;
  if not exists (select 1 from group_members where group_id = gid and user_id = uid and role = 'member') then
    raise exception 'That person is not a regular member of this group';
  end if;
  select coalesce(array_agg(distinct x), '{}') into clean
    from unnest(coalesce(new_perms, '{}')) x
    where x in ('channels', 'messages', 'emoji', 'invites', 'members', 'customize');
  update group_members set perms = clean where group_id = gid and user_id = uid;
end $$;

-- A person can never have powers after becoming (or while being) the founder: the role covers it.
create or replace function clear_perms_on_founder() returns trigger
language plpgsql as $$
begin
  if new.role = 'founder' then new.perms := '{}'; end if;
  return new;
end $$;
drop trigger if exists clear_perms_on_founder on group_members;
create trigger clear_perms_on_founder before insert or update on group_members for each row execute function clear_perms_on_founder();

-- ───────────── Use the permissions ─────────────
drop policy if exists "categories write" on categories;
create policy "categories write" on categories for all to authenticated
  using (has_perm(group_id, 'channels')) with check (has_perm(group_id, 'channels'));
drop policy if exists "channels write" on channels;
create policy "channels write" on channels for all to authenticated
  using (has_perm(group_id, 'channels')) with check (has_perm(group_id, 'channels'));

drop policy if exists "messages delete own or founder" on messages;
create policy "messages delete own or founder" on messages for delete to authenticated using (
  author_id = auth.uid()
  or (channel_id is not null and has_perm(channel_group(channel_id), 'messages'))
);

drop policy if exists "members leave or remove" on group_members;
create policy "members leave or remove" on group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_founder(group_id)
         or (role = 'member' and has_perm(group_id, 'members')));

drop policy if exists "groups update" on groups;
create policy "groups update" on groups for update to authenticated
  using (has_perm(id, 'customize')) with check (has_perm(id, 'customize'));

-- Only the founder can change the invite code or hand over the group by editing the row directly.
create or replace function protect_group_fields() returns trigger
language plpgsql as $$
begin
  if new.invite_code is distinct from old.invite_code and not is_group_founder(old.id) and auth.uid() is not null then
    new.invite_code := old.invite_code;
  end if;
  return new;
end $$;
drop trigger if exists protect_group_fields on groups;
create trigger protect_group_fields before update on groups for each row execute function protect_group_fields();

create or replace function regenerate_invite(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not has_perm(gid, 'invites') then raise exception 'You do not have permission to do this'; end if;
  update groups set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    where id = gid returning invite_code into code;
  return code;
end $$;

create or replace function reorder_layout(gid uuid, cats jsonb, chans jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(gid, 'channels') then raise exception 'You do not have permission to rearrange channels'; end if;
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

-- ───────────── Group and channel customisation ─────────────
alter table groups add column if not exists description text;
alter table groups add column if not exists accent text;
alter table groups drop constraint if exists groups_description_check;
alter table groups add constraint groups_description_check check (description is null or char_length(description) <= 200);
alter table groups drop constraint if exists groups_accent_check;
alter table groups add constraint groups_accent_check check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$');

alter table channels add column if not exists icon text;
alter table channels add column if not exists slowmode int not null default 0;
alter table channels add column if not exists read_only boolean not null default false;
alter table channels drop constraint if exists channels_icon_check;
alter table channels add constraint channels_icon_check check (icon is null or char_length(icon) <= 16);
alter table channels drop constraint if exists channels_slowmode_check;
alter table channels add constraint channels_slowmode_check check (slowmode between 0 and 21600);

create or replace function enforce_channel_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch channels%rowtype; last_at timestamptz;
begin
  if new.channel_id is null then return new; end if;
  select * into ch from channels where id = new.channel_id;
  if not found then return new; end if;
  if has_perm(ch.group_id, 'messages') then return new; end if;
  if ch.read_only then raise exception 'Only moderators can post in this channel'; end if;
  if ch.slowmode > 0 then
    select max(created_at) into last_at from messages where channel_id = new.channel_id and author_id = new.author_id;
    if last_at is not null and last_at > now() - make_interval(secs => ch.slowmode) then
      raise exception 'Slowmode is on. Wait a little before sending another message.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_channel_rules on messages;
create trigger enforce_channel_rules before insert on messages for each row execute function enforce_channel_rules();

-- ───────────── Custom emoji ─────────────
create table if not exists group_emojis (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url text not null check (char_length(url) <= 500 and url like '%/storage/v1/object/public/media/%'),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
alter table group_emojis enable row level security;
drop policy if exists "emoji read" on group_emojis;
create policy "emoji read" on group_emojis for select to authenticated using (is_group_member(group_id));
drop policy if exists "emoji add" on group_emojis;
create policy "emoji add" on group_emojis for insert to authenticated
  with check (has_perm(group_id, 'emoji') and created_by = auth.uid());
drop policy if exists "emoji remove" on group_emojis;
create policy "emoji remove" on group_emojis for delete to authenticated using (has_perm(group_id, 'emoji'));

create or replace function limit_group_emoji() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from group_emojis where group_id = new.group_id) >= 50 then
    raise exception 'A group can have up to 50 custom emoji';
  end if;
  return new;
end $$;
drop trigger if exists limit_group_emoji on group_emojis;
create trigger limit_group_emoji before insert on group_emojis for each row execute function limit_group_emoji();

-- Lets a message that uses a group's emoji show it to people who are not in that group (for example in a DM).
-- You can only look up emoji by their exact id, never browse other groups' lists.
create or replace function emoji_by_ids(ids uuid[]) returns table (id uuid, name text, url text)
language sql security definer stable set search_path = public as $$
  select e.id, e.name, e.url from group_emojis e where e.id = any(ids) limit 100;
$$;

-- ───────────── Official Staff badge ─────────────
-- Handed out only from the SQL editor, like the other given badges, for example:
--   update profiles set badges = array['staff'] where username = 'damian';
-- Given badges now also include: staff
