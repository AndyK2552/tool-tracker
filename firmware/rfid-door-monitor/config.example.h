#pragma once

// Copy this file to config.h (config.h is gitignored) and fill in your details.

#define WIFI_SSID "YourShopWiFi"
#define WIFI_PASSWORD "YourWiFiPassword"

// SUPABASE_URL is the same value as VITE_SUPABASE_URL in tool-tracker/.env.
//
// SUPABASE_SERVICE_ROLE_KEY is NOT the same as VITE_SUPABASE_ANON_KEY --
// the tools/tool_rfid_tags tables' Row Level Security policies only grant
// access to "authenticated" users (i.e. someone logged into the app), so
// the plain anon key gets silently zero rows back. This board isn't a web
// client a stranger could inspect, so it uses the service_role key
// instead, which bypasses RLS entirely. Get it from Supabase -> Project
// Settings -> API Keys -> "service_role" (marked secret, NOT
// "anon"/"public"). Treat it like a root password: never put it in a web
// app, never commit it (config.h is gitignored for exactly this reason),
// never share it.
#define SUPABASE_URL "https://xxxxxxxxxxxx.supabase.co"
#define SUPABASE_SERVICE_ROLE_KEY "eyJhbGciOi..."

// GPIO driving the passive buzzer (through a suitable transistor/driver if needed).
#define BUZZER_PIN 6
#define BUZZER_FREQUENCY_HZ 2500
#define BUZZER_MAX_DUTY 128 // 50% duty -- the loudest a square wave gets

// The local HTTP endpoint the R700's Event Webhook POSTs tag reads to.
// Configure this exact host:port + path as the webhook URL under the
// reader's own Event Reporting -> Webhook page -- see the sketch's header
// comment for the other one-time reader-side settings (region, interface,
// antenna hub, inventory preset). Plain HTTP is fine -- this only ever
// talks to the reader over your local network.
#define WEBHOOK_LISTEN_PORT 8080
#define WEBHOOK_PATH "/tag-report"

// Timing.
#define TAG_FETCH_INTERVAL_MS 5000UL   // how often to re-poll Supabase for tag/tool status
#define ALARM_EVAL_INTERVAL_MS 1000UL  // how often to re-check for an active alarm
#define TAG_STALE_MS 15000UL           // a tag not read in this long counts as "not at the door"
