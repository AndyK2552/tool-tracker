#pragma once

// Copy this file to config.h (config.h is gitignored) and fill in your details.

#define WIFI_SSID "YourShopWiFi"
#define WIFI_PASSWORD "YourWiFiPassword"

// Same values used in tool-tracker/.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
#define SUPABASE_URL "https://xxxxxxxxxxxx.supabase.co"
#define SUPABASE_ANON_KEY "eyJhbGciOi..."

// GPIO driving the passive buzzer (through a suitable transistor/driver if needed).
#define BUZZER_PIN 6
#define BUZZER_FREQUENCY_HZ 2500

// Timing.
#define TOOL_FETCH_INTERVAL_MS 5000UL   // how often to re-poll Supabase for tool status
#define ALARM_EVAL_INTERVAL_MS 1000UL   // how often to re-check RSSI vs threshold
#define BEACON_STALE_MS 15000UL         // a beacon not heard from in this long counts as "out of range"
