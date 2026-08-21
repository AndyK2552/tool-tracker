-- Run this once in the Supabase SQL editor if you already ran
-- add_beacon_settings_table.sql before this change. Widens the Beep
-- Frequency slider's allowed range from 1-100ms to 0-1000ms.

alter table beacon_settings drop constraint beacon_settings_beep_duration_ms_check;
alter table beacon_settings add constraint beacon_settings_beep_duration_ms_check
  check (beep_duration_ms between 0 and 1000);
