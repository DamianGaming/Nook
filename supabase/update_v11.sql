-- Nook v11: end-to-end encrypted direct messages, group banners, legal acceptance,
-- report categories and "download my data".
-- Run once in the Supabase SQL editor (after update_v10.sql).

-- ───────────── Encryption keys ─────────────
-- Public keys are readable by signed-in people (they are what lets two people encrypt to each other).
create table if not exists user_keys (
  user_id uuid primary key references profiles(id) on delete cascade,
  public_key text not null check (char_length(public_key) <= 600),
  kid text not null check (char_length(kid) between 8 and 64),
  created_at timestamptz not null default now()
);
-- The private key never leaves the browser unwrapped. This is only a copy locked with your passphrase,
-- so a new device can unlock it. Nook cannot read it and cannot reset the passphrase.
create table if not exists key_backups (
  user_id uuid primary key references profiles(id) on delete cascade,
  wrapped text not null check (char_length(wrapped) <= 2000),
  salt text not null check (char_length(salt) <= 64),
  iv text not null check (char_length(iv) <= 64),
  iters integer not null check (iters between 100000 and 5000000),
  updated_at timestamptz not null default now()
);
alter table user_keys enable row level security;
alter table key_backups enable row level security;
drop policy if exists "user_keys read" on user_keys;
drop policy if exists "user_keys insert own" on user_keys;
drop policy if exists "user_keys update own" on user_keys;
drop policy if exists "user_keys delete own" on user_keys;
create policy "user_keys read" on user_keys for select to authenticated using (true);
create policy "user_keys insert own" on user_keys for insert to authenticated with check (user_id = auth.uid());
create policy "user_keys update own" on user_keys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_keys delete own" on user_keys for delete to authenticated using (user_id = auth.uid());
drop policy if exists "key_backups own" on key_backups;
create policy "key_backups own" on key_backups for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Encrypted messages are stored as "e1.<iv>.<ciphertext>" and are longer than plain ones. Only DMs may hold them.
alter table messages drop constraint if exists messages_content_rule;
alter table messages add constraint messages_content_rule check (
  ((content like 'e1.%' and dm_id is not null and char_length(content) <= 12000) or char_length(content) <= 2000)
  and (char_length(content) >= 1 or attachment_url is not null)
);

-- Encrypted attachments are uploaded as opaque files.
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array[
        'image/png','image/jpeg','image/gif','image/webp',
        'video/mp4','video/webm','video/quicktime',
        'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm',
        'application/octet-stream'
      ]
  where id = 'media';

-- ───────────── Group banners ─────────────
alter table groups add column if not exists banner_url text;
alter table groups drop constraint if exists groups_banner_url_check;
alter table groups add constraint groups_banner_url_check
  check (banner_url is null or (char_length(banner_url) <= 500 and banner_url like '%/storage/v1/object/public/media/%'));

-- ───────────── Terms, age and reports ─────────────
alter table profiles add column if not exists terms_version text;
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists age_confirmed boolean not null default false;

create or replace function accept_terms(ver text) returns void
language sql security definer set search_path = public as $$
  update profiles set terms_version = left(ver, 20), terms_accepted_at = now(), age_confirmed = true where id = auth.uid();
$$;
revoke all on function accept_terms(text) from public;
grant execute on function accept_terms(text) to authenticated;

alter table reports add column if not exists category text;
alter table reports drop constraint if exists reports_category_check;
alter table reports add constraint reports_category_check
  check (category is null or category in ('spam','harassment','hate','sexual','violence','selfharm','illegal','childsafety','copyright','impersonation','other'));

-- ───────────── Download my data ─────────────
create or replace function export_my_data() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'note', 'Direct messages are end-to-end encrypted. Messages marked e1.* are decrypted in your browser when you use the download button in Settings.',
    'profile', (select to_jsonb(p) from profiles p where p.id = uid),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('group_id', gm.group_id, 'role', gm.role, 'joined_at', gm.joined_at)) from group_members gm where gm.user_id = uid), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from friendships f where f.requester = uid or f.addressee = uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from blocks b where b.blocker = uid), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from (select * from messages where author_id = uid order by created_at desc limit 50000) m), '[]'::jsonb),
    'reactions', coalesce((select jsonb_agg(to_jsonb(r)) from reactions r where r.user_id = uid), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(rp)) from reports rp where rp.reporter = uid), '[]'::jsonb),
    'encryption_public_key', (select to_jsonb(k) from user_keys k where k.user_id = uid)
  );
end $$;
revoke all on function export_my_data() from public;
grant execute on function export_my_data() to authenticated;
