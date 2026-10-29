-- Nook v9: video attachments, avatar frames, name styles and fonts, card themes, more badges.
-- Run once in the Supabase SQL editor (after update_v8.sql).

-- Videos (MP4, WebM, MOV) up to 50 MB. Supabase's free plan caps uploads at 50 MB overall.
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','video/quicktime']
  where id = 'media';

-- Profile customisation
alter table profiles add column if not exists frame text not null default 'none';
alter table profiles add column if not exists name_style text not null default 'plain';
alter table profiles add column if not exists name_font text not null default 'default';
alter table profiles add column if not exists card_theme text not null default 'default';

alter table profiles drop constraint if exists profiles_frame_check;
alter table profiles drop constraint if exists profiles_name_style_check;
alter table profiles drop constraint if exists profiles_name_font_check;
alter table profiles drop constraint if exists profiles_card_theme_check;
alter table profiles add constraint profiles_frame_check
  check (frame in ('none','ring','gold','neon','rainbow','candy','ice','sunset','dashed','pulse'));
alter table profiles add constraint profiles_name_style_check
  check (name_style in ('plain','gradient','glow','rainbow','shimmer','outline'));
alter table profiles add constraint profiles_name_font_check
  check (name_font in ('default','round','serif','mono','bold'));
alter table profiles add constraint profiles_card_theme_check
  check (card_theme in ('default','aurora','sunset','ocean','mint','candy','night'));

-- New badges are handed out the same way as before, for example:
--   update profiles set badges = array['team','mod','tester'] where username = 'damian';
-- Given badges: team, early, supporter, bughunter, creator, mod, partner, tester, translator, champion
