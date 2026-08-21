-- Run this once in the Supabase SQL editor. Adds an on/off switch for the
-- "Beacon Tower is offline" email alert (see check-board-heartbeat) --
-- useful to mute it during installation/maintenance, when network drops
-- are expected and don't mean anything's actually wrong.
--
-- Defaults to true (alerts on) so existing behavior doesn't change for
-- anyone who already has this set up.

alter table beacon_settings
  add column if not exists offline_alerts_enabled boolean not null default true;
