-- Run this once in the Supabase SQL editor. Adds a single-row global
-- settings table for the shop-door beacon monitor's buzzer ramp, replacing
-- the old per-tool beacon_rssi_threshold. The ESP32 reads this table (via
-- its service_role key) so parameters can be tuned without reflashing.
--
-- Distance sliders (0-100%) map to RSSI via: rssi = -90 + pct * 0.6
-- i.e. 0% = -90 dBm (loosest/farthest trigger), 100% = -30 dBm (strictest/
-- closest trigger). warning_beep_distance_pct is where chirping starts;
-- threshold_distance_pct is where it becomes a continuous tone, and must
-- be >= warning_beep_distance_pct (enforced in the app UI, not the DB).

-- wifi_ssid/wifi_password let the board's WiFi network be changed without
-- reflashing -- see fetchBeaconSettings() in shop-beacon-monitor.ino. Left
-- blank/null, the board keeps using whatever's compiled into config.h.
create table if not exists beacon_settings (
  id boolean primary key default true,
  warning_beep_distance_pct integer not null default 33 check (warning_beep_distance_pct between 0 and 100),
  beep_duration_ms integer not null default 5 check (beep_duration_ms between 0 and 2000),
  threshold_distance_pct integer not null default 67 check (threshold_distance_pct between 0 and 100),
  wifi_ssid text,
  wifi_password text,
  updated_at timestamptz not null default now()
);

insert into beacon_settings (id) values (true) on conflict (id) do nothing;

alter table beacon_settings enable row level security;

-- Admin-only to SELECT (not just UPDATE) since this table holds the WiFi
-- password -- a plain "authenticated" read policy would let any logged-in
-- tech, not just admins, read it via the API.
create policy "Admins can view beacon settings"
  on beacon_settings for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));

create policy "Admins can update beacon settings"
  on beacon_settings for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
