#pragma once

// Copy this file to config.h and fill in your details. (config.h is gitignored.)

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Same value as tool-tracker/.env (VITE_SUPABASE_URL).
#define SUPABASE_URL "https://your-project-ref.supabase.co"

// Supabase -> Project Settings -> API Keys -> "service_role", NOT the anon
// key. speaker_test's RLS policies only allow authenticated admins, so the
// board needs the key that bypasses RLS entirely -- treat it like a root
// password, never put it anywhere web-facing.
#define SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"
