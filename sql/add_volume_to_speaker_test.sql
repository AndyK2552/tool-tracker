-- Run this once in the Supabase SQL editor, after add_speaker_test_table.sql.
-- Adds a volume slider to the Speaker Test page. Unlike action/sound_path,
-- the board applies this on every poll cycle rather than gating it behind
-- command_seq -- there's no meaningful "already applied this exact volume"
-- state to dedupe against, and picking it up every ~1s poll is simpler and
-- responsive enough for a volume slider.
alter table speaker_test add column if not exists volume integer not null default 20 check (volume between 0 and 100);
