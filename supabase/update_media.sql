-- Run once in the Supabase SQL editor (after schema.sql and fix_profiles.sql).
-- Adds profile pictures, banners and group icons (PNG, JPG, GIF, WebP up to 8 MB; animated is fine).

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists banner_url text;
alter table groups add column if not exists icon_url text;

-- Only allow images that live in our own storage bucket (stops hotlinking arbitrary URLs)
alter table profiles drop constraint if exists profiles_avatar_url_check;
alter table profiles drop constraint if exists profiles_banner_url_check;
alter table groups drop constraint if exists groups_icon_url_check;
alter table profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url like '%/storage/v1/object/public/media/%'));
alter table profiles add constraint profiles_banner_url_check
  check (banner_url is null or (char_length(banner_url) <= 500 and banner_url like '%/storage/v1/object/public/media/%'));
alter table groups add constraint groups_icon_url_check
  check (icon_url is null or (char_length(icon_url) <= 500 and icon_url like '%/storage/v1/object/public/media/%'));

-- Public bucket, 8 MB limit, images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

-- Each person can only write inside their own folder
drop policy if exists "media upload own folder" on storage.objects;
drop policy if exists "media update own folder" on storage.objects;
drop policy if exists "media delete own folder" on storage.objects;
create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
