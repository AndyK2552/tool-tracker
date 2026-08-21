-- Run this once in the Supabase SQL editor. Adds wifi_ssid/wifi_password
-- to beacon_settings so the board's WiFi network can be changed from the
-- app without reflashing (see fetchBeaconSettings() in
-- shop-beacon-monitor.ino). Left blank/null, the board keeps using
-- whatever's compiled into config.h.
--
-- Also tightens the SELECT policy to admin-only -- the existing
-- "Authenticated users can view beacon settings" policy let any logged-in
-- tech read this table via the API, which is fine for the buzzer settings
-- but not once it holds a WiFi password.

alter table beacon_settings
  add column if not exists wifi_ssid text,
  add column if not exists wifi_password text;

drop policy if exists "Authenticated users can view beacon settings" on beacon_settings;

create policy "Admins can view beacon settings"
  on beacon_settings for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
