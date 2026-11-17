-- Nook v28: bots no longer get built-in storage. A bot that needs to remember things after a restart keeps its own
-- SQLite or MySQL database (see the Developer docs). Safe to run more than once.
drop function if exists bot_kv_set(text, text, jsonb);
drop function if exists bot_kv_get(text, text);
drop function if exists bot_kv_delete(text, text);
drop function if exists bot_kv_list(text, text);
drop table if exists bot_kv;
