-- Run this once in the Supabase SQL editor. Widens the Beep Frequency
-- slider's allowed range from 0-1000ms to 0-2000ms.

alter table beacon_settings drop constraint beacon_settings_beep_duration_ms_check;
alter table beacon_settings add constraint beacon_settings_beep_duration_ms_check
  check (beep_duration_ms between 0 and 2000);
