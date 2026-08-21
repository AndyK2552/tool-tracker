#pragma once

// Copy this file to config.h (config.h is gitignored) and fill in your details.

// Fallback WiFi, used for the very first boot (and any boot with no cached
// override in flash yet). Once online, the board's Beacon Settings page in
// the app can change the network it uses without reflashing -- see
// loadWifiCredentials()/fetchBeaconSettings() in the sketch. These values
// stop mattering once an override has ever been saved.
#define WIFI_SSID "YourShopWiFi"
#define WIFI_PASSWORD "YourWiFiPassword"

// PIN required to push new WiFi credentials over Bluetooth (see the app's
// Beacon Settings page -> "Update WiFi via Bluetooth"). Anyone in BLE range
// who knows this PIN can change the board's network, so pick something
// other than the default and keep it out of any public repo. Must match the
// PROVISIONING_PIN constant in src/BleWifiProvision.jsx.
#define BLE_PROVISIONING_PIN "482913"

// SUPABASE_URL is the same value as VITE_SUPABASE_URL in tool-tracker/.env.
//
// SUPABASE_SERVICE_ROLE_KEY is NOT the same as VITE_SUPABASE_ANON_KEY --
// the tools table's Row Level Security policies only grant access to
// "authenticated" users (i.e. someone logged into the app), so the plain
// anon key gets silently zero rows back. This board isn't a web client a
// stranger could inspect, so it uses the service_role key instead, which
// bypasses RLS entirely. Get it from Supabase -> Project Settings -> API
// Keys -> "service_role" (marked secret, NOT "anon"/"public"). Treat it
// like a root password: never put it in a web app, never commit it
// (config.h is gitignored for exactly this reason), never share it.
#define SUPABASE_URL "https://xxxxxxxxxxxx.supabase.co"
#define SUPABASE_SERVICE_ROLE_KEY "eyJhbGciOi..."

// GPIO driving the passive buzzer (through a suitable transistor/driver if needed).
#define BUZZER_PIN 6
#define BUZZER_FREQUENCY_HZ 2500

// Warning distance, threshold distance, and the max gap between chirps
// (the app's "Beep Frequency" slider) are all set from the app's Beacon
// Settings page (Supabase beacon_settings table), not here -- see
// fetchBeaconSettings() in the sketch. Only the buzzer's fixed mechanics
// stay compile-time:
#define BUZZER_MAX_DUTY 128 // 50% duty -- the loudest a square wave gets

// Timing.
#define TOOL_FETCH_INTERVAL_MS 5000UL   // how often to re-poll Supabase for tool status + settings
#define ALARM_EVAL_INTERVAL_MS 1000UL   // how often to re-check RSSI vs threshold
#define BEACON_STALE_MS 15000UL         // a beacon not heard from in this long counts as "out of range"
#define SCAN_RESTART_INTERVAL_MS 20000UL // periodic BLE scan restart, guards against rare scan stalls
