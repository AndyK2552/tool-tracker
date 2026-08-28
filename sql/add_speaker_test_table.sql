-- Run this once in the Supabase SQL editor. Adds a single-row remote-control
-- table so the app's Speaker Test page can tell the I2S speaker test board
-- (firmware/i2s-speaker-test) which file to play/pause in real time, and so
-- the board can report back what it's actually doing.
--
-- command_seq increments on every app-issued command so the board can tell
-- a fresh command apart from re-polling the same row (a plain action/
-- sound_path compare wouldn't catch e.g. clicking Play on the same file
-- twice in a row after a Pause). The board tracks the last command_seq it
-- acted on and only reacts when it changes.
--
-- status/status_detail/board_last_seen are written by the board (via its
-- service_role key, bypassing RLS) so the app can reflect real playback
-- state, not just the last command sent.
create table if not exists speaker_test (
  id boolean primary key default true,
  command_seq bigint not null default 0,
  action text not null default 'stop' check (action in ('play', 'pause', 'stop')),
  sound_path text,
  status text not null default 'idle' check (status in ('idle', 'downloading', 'playing', 'paused', 'error')),
  status_detail text,
  board_last_seen timestamptz
);

insert into speaker_test (id) values (true) on conflict (id) do nothing;

alter table speaker_test enable row level security;

create policy "Admins can view speaker test state"
  on speaker_test for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "Admins can update speaker test state"
  on speaker_test for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
