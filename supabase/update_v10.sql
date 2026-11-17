-- Nook v10: voice messages and audio files, custom name and frame colours.
-- Run once in the Supabase SQL editor (after update_v9.sql).

-- Storage now also accepts audio (MP3, M4A, OGG, WAV and recorded voice messages), up to 50 MB.
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array[
        'image/png','image/jpeg','image/gif','image/webp',
        'video/mp4','video/webm','video/quicktime',
        'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm'
      ]
  where id = 'media';

-- Optional second name colour (makes a gradient) and a custom frame colour. Plain #rrggbb only.
alter table profiles add column if not exists name_color2 text;
alter table profiles add column if not exists frame_color text;
alter table profiles drop constraint if exists profiles_name_color2_check;
alter table profiles drop constraint if exists profiles_frame_color_check;
alter table profiles add constraint profiles_name_color2_check check (name_color2 is null or name_color2 ~ '^#[0-9a-fA-F]{6}$');
alter table profiles add constraint profiles_frame_color_check check (frame_color is null or frame_color ~ '^#[0-9a-fA-F]{6}$');
