-- Run this once in the Supabase SQL editor. Creating a table does NOT
-- automatically broadcast its changes -- it has to be added to the
-- supabase_realtime publication separately. Without this, the Speaker
-- Test page's postgres_changes subscription never fires, so the UI only
-- ever shows what it last wrote locally and never picks up what the board
-- reports back (status flipping to paused, a new file's duration, etc.).
--
-- Guarded so it's safe to run again if it's already been added (e.g. via
-- the Dashboard's Database -> Replication toggle instead).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'speaker_test'
  ) then
    alter publication supabase_realtime add table speaker_test;
  end if;
end $$;
