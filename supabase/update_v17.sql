-- Nook v17: deleted messages disappear for everyone instantly.
-- Realtime can only filter DELETE events by chat when the full old row is sent.
-- Safe to run more than once.
alter table messages replica identity full;
