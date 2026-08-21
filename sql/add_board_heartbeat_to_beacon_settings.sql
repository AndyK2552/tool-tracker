-- Run this once in the Supabase SQL editor. Adds heartbeat tracking to
-- beacon_settings so the app and a scheduled check can tell when the
-- Beacon Tower has gone offline.
--
-- board_last_seen is stamped by the firmware itself on every successful
-- poll of Supabase (see sendHeartbeat() in shop-beacon-monitor.ino) --
-- roughly every 5s while it's online and reachable.
--
-- offline_alert_sent debounces the "Beacon Tower is offline" email so it only
-- fires once per outage, not on every scheduled check while it stays down.
-- The firmware resets it to false on every successful heartbeat; the
-- check-board-heartbeat Edge Function sets it to true after sending the
-- alert. See sql/schedule_board_heartbeat_check.sql for the scheduled
-- check itself.

alter table beacon_settings
  add column if not exists board_last_seen timestamptz,
  add column if not exists offline_alert_sent boolean not null default false;
