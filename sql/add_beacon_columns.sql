-- Run this once in the Supabase SQL editor to add beacon-tracking support to `tools`.

alter table tools
  add column if not exists beacon_mac text,
  add column if not exists beacon_rssi_threshold integer not null default -75,
  add column if not exists beacon_alarm_active boolean not null default false,
  add column if not exists beacon_last_seen timestamptz;

-- Beacon MACs should be unique across tools (a beacon can only belong to one tool).
create unique index if not exists tools_beacon_mac_key on tools (beacon_mac) where beacon_mac is not null;
