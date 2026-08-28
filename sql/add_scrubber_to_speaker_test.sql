-- Run this once in the Supabase SQL editor. Adds a scrubber to the Speaker
-- Test page: position_seconds/duration_seconds are written by the board
-- every ~1s poll cycle (same as volume) so the app can show progress;
-- seek_seconds is written by the app when the user drags the scrubber, and
-- consumed by the board like play/pause (gated behind command_seq, since
-- unlike volume there IS a meaningful "already seeked to this" state to
-- dedupe against).
alter table speaker_test add column if not exists position_seconds real not null default 0;
alter table speaker_test add column if not exists duration_seconds real not null default 0;
alter table speaker_test add column if not exists seek_seconds real;

alter table speaker_test drop constraint if exists speaker_test_action_check;
alter table speaker_test add constraint speaker_test_action_check check (action in ('play', 'pause', 'stop', 'seek'));
