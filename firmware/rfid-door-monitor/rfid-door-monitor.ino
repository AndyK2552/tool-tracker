// ESP32 door sensor for the KYPD Tool Tracker -- UHF RFID version.
//
// Mount this board on the shop's local network (same LAN as the Impinj R700
// reader). The R700 does the actual RF sensing -- its two Times-7 antennas
// flank the exit -- and pushes every tag read to this board as a webhook
// (its IoT Device Interface's Event Webhook feature), batched as a JSON
// array of ReaderEvents POSTed to WEBHOOK_PATH below. This board is the
// "brain + mouth": it looks up each read tag against Supabase, and if it
// belongs to a Shop tool that's still "Available" (not checked out, not
// Pending/Damaged), it sounds the buzzer -- the same DIYables buzzer module
// wiring as shop-beacon-monitor.ino, just driven by webhook pushes instead
// of a BLE scan.
//
// This intentionally sidesteps the R700's GPO/relay outputs entirely: the
// R700's modern IoT/REST interface doesn't support configuring autonomous
// GPO-on-tag-report behavior (only the older LLRP interface does), so
// rather than take on an LLRP client, this board just drives its own
// buzzer directly -- the exact same approach that already works for the
// BLE Beacon Tower.
//
// Unlike the Beacon Tower, the alarm here is binary, not RSSI-ramped: a
// two-antenna portal pair is built for a clean "did a tagged item cross
// the gate" read, so there's no noisy RSSI to grade against. Any Available
// tool whose tag was read in the last TAG_STALE_MS -> buzzer on
// (continuous); none -> silent.
//
// This board only ever READS from Supabase (the tag_rfid_tags/tools join,
// polled every ~5s) -- it never writes anything back. There's no
// "⚠ Near door" app badge and no alarm-state columns for this system; the
// physical buzzer is the whole deliverable for now.
//
// All Supabase/WiFi networking runs on its own FreeRTOS task (see
// networkTask()), same reasoning as shop-beacon-monitor.ino: HTTPS
// requests are blocking and can take a second or more, so keeping them off
// the main loop() task means the buzzer never stutters waiting on a slow
// request. The local webhook *server*, unlike an outbound HTTPS call,
// never blocks waiting on the network (the reader initiates the
// connection to us), so it's cheap enough to run directly in loop()
// alongside the buzzer -- see the comment on handleClient() below. A mutex
// (stateMutex) guards the tags[] array, touched by both the webhook
// handler and networkTask().
//
// Libraries required (Arduino Library Manager):
//   - ArduinoJson by bblanchon, version 7.x
//   - FastLED by Daniel Garcia, for the onboard WS2812 RGB LED (GPIO 48)
//   (WebServer and WiFi/WiFiClientSecure/HTTPClient ship with the
//   Arduino-ESP32 core -- no separate install needed.)
//
// Targets Arduino-ESP32 core 3.x, same as shop-beacon-monitor.ino.
//
// One-time reader-side setup (done once via the R700's own web UI, not by
// this firmware):
//   1. Region: Home -> Change Region -> set a real region (not "None") ->
//      Reboot. RF is fully disabled until this is set.
//   2. RFID Interface: Home -> Change Interface -> Impinj IoT Device
//      Interface.
//   3. Antenna Hub: leave Disabled unless you actually have the separate
//      Antenna Hub accessory -- it's not just a label for the reader's own
//      onboard antenna ports, and enabling it without the accessory makes
//      directly-wired antennas show as disconnected.
//   4. Inventory preset (Profile Presets -> Inventory -> New): both
//      antenna ports enabled, avoid inventorySession 0 (Impinj's own
//      guidance), transmit power tuned down from the default during
//      placement testing so the read zone matches the door, not the whole
//      room. Must be started/activated -- ideally configured to
//      auto-start on boot, since nothing gets read at all while no preset
//      is running.
//   5. Event Reporting -> Webhook: active=true, serverConfiguration.url =
//      http://<this-board's-IP>:WEBHOOK_LISTEN_PORT + WEBHOOK_PATH (below),
//      eventBatchLingerMilliseconds turned down from the 1000ms default
//      (e.g. 100-250) so the alarm reacts quickly instead of batching for
//      a full second.
//
// Setup (this board):
//   1. Copy config.example.h to config.h and fill in WiFi + Supabase
//      details.
//   2. In the Tool Tracker app, assign RFID tags to each Shop tool
//      (Assign RFID Tags, on the tool detail page or the dedicated
//      scan-first page).
//   3. Flash this sketch.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

#include "config.h"

// Onboard WS2812 RGB LED (Lonely Binary boards) -- lit in lockstep with the
// buzzer as a visual confirmation of alarm state. Only ever touched from
// the main loop() task (same as the buzzer), so it doesn't need stateMutex.
#define RGB_LED_PIN 48
#define RGB_LED_COUNT 1
static CRGB rgbLed[RGB_LED_COUNT];

#define MAX_TAGS 200

struct MonitoredTag {
  char tagId[32];    // hex EPC, uppercase
  char toolId[40];
  char toolName[64];
  bool isAvailable;
  unsigned long lastSeenMs;
  bool everSeen;
};

// Touched by: the webhook handler (main loop task, via handleTagReport())
// and networkTask() -- always take stateMutex first.
static MonitoredTag tags[MAX_TAGS];
static int tagCount = 0;

static SemaphoreHandle_t stateMutex;

static WebServer webServer(WEBHOOK_LISTEN_PORT);
static uint8_t buzzerDuty = 0;

// ---------- helpers ----------

// Caller must already hold stateMutex.
static int findTagById(const char* tagId) {
  for (int i = 0; i < tagCount; i++) {
    if (strcasecmp(tags[i].tagId, tagId) == 0) return i;
  }
  return -1;
}

// Decodes an unpadded base64url string (RFC 4648 sect. 5 -- '-'/'_'
// instead of '+'/'/', no '=' padding) into an uppercase hex string. This
// is the format the R700's webhook reports EPCs in -- confirmed by
// inspecting a live event, not from Impinj's docs (they only mention "hex
// or base64" as configurable, without pinning down the webhook's default).
// Returns false on malformed input or if hexOutCap is too small.
static const char* B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

static int8_t b64UrlCharValue(char c) {
  if (c == '\0') return -1;
  const char* p = strchr(B64URL_ALPHABET, c);
  return p ? (int8_t)(p - B64URL_ALPHABET) : -1;
}

static bool base64UrlToHexUpper(const char* b64url, char* hexOut, size_t hexOutCap) {
  static const char* HEX_DIGITS = "0123456789ABCDEF";
  size_t len = strlen(b64url);
  uint32_t buffer = 0;
  int bitsCollected = 0;
  size_t hexPos = 0;
  size_t bytesOut = 0;

  for (size_t i = 0; i < len; i++) {
    int8_t v = b64UrlCharValue(b64url[i]);
    if (v < 0) return false;
    buffer = (buffer << 6) | (uint32_t)v;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      uint8_t byte = (uint8_t)((buffer >> bitsCollected) & 0xFF);
      if (hexPos + 2 >= hexOutCap) return false; // out of room
      hexOut[hexPos++] = HEX_DIGITS[(byte >> 4) & 0xF];
      hexOut[hexPos++] = HEX_DIGITS[byte & 0xF];
      bytesOut++;
    }
  }
  hexOut[hexPos] = '\0';
  return bytesOut > 0;
}

// ---------- WiFi ----------

static void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi (" WIFI_SSID ")");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected: " + WiFi.localIP().toString());
    Serial.printf("Point the R700's webhook at: http://%s:%d%s\n",
      WiFi.localIP().toString().c_str(), WEBHOOK_LISTEN_PORT, WEBHOOK_PATH);
  } else {
    Serial.println(" failed, will retry");
  }
}

// ---------- Supabase ----------

static bool supabaseGet(const String& path, JsonDocument& doc) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + path;
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);

  int code = http.GET();
  bool ok = false;
  if (code == 200) {
    // Supabase responses are often chunked-transfer-encoded; getStream()
    // exposes the raw chunked bytes, which corrupts ArduinoJson's parse.
    // getString() de-chunks it properly, so parse from that instead.
    String body = http.getString();
    DeserializationError err = deserializeJson(doc, body);
    ok = !err;
    if (err) Serial.printf("Supabase GET: JSON parse failed: %s\n", err.c_str());
  } else {
    Serial.printf("Supabase GET failed: %d\n", code);
  }
  http.end();
  return ok;
}

// Fetches every RFID tag assigned to a Shop tool, joined through
// tool_rfid_tags. The !inner hint on tools is what makes
// "tools.location=eq.Shop" actually exclude non-Shop tools' tags, rather
// than just nulling out the embedded tools object for them (PostgREST's
// default embed-filter behavior without !inner) -- double check this
// against real query results the first time this runs, since it's the one
// part of this sketch not verified against a live Supabase project.
static void fetchTags() {
  JsonDocument doc;
  String path = "/rest/v1/tool_rfid_tags?select=tag_id,tools!inner(id,name,is_checked_out,condition,location)"
                "&tools.location=eq.Shop";
  if (!supabaseGet(path, doc)) return; // network call -- never done while holding stateMutex

  JsonArray arr = doc.as<JsonArray>();
  static MonitoredTag updated[MAX_TAGS]; // static: keep this off this task's stack

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  int updatedCount = 0;

  for (JsonObject row : arr) {
    if (updatedCount >= MAX_TAGS) break;
    const char* tagId = row["tag_id"] | "";
    JsonObject tool = row["tools"];
    if (!tagId[0] || tool.isNull()) continue;

    MonitoredTag t = {};
    strncpy(t.tagId, tagId, sizeof(t.tagId) - 1);
    for (size_t i = 0; t.tagId[i]; i++) t.tagId[i] = toupper(t.tagId[i]);
    strncpy(t.toolId, tool["id"] | "", sizeof(t.toolId) - 1);
    strncpy(t.toolName, tool["name"] | "", sizeof(t.toolName) - 1);

    bool isCheckedOut = tool["is_checked_out"] | false;
    const char* condition = tool["condition"] | "Ready";
    t.isAvailable = !isCheckedOut && strcmp(condition, "Pending") != 0 && strcmp(condition, "Damaged") != 0;

    // Preserve live "last read" tracking across refreshes for the same tag.
    int prevIdx = findTagById(t.tagId);
    if (prevIdx >= 0) {
      t.lastSeenMs = tags[prevIdx].lastSeenMs;
      t.everSeen = tags[prevIdx].everSeen;
    }

    updated[updatedCount++] = t;
  }

  memcpy(tags, updated, sizeof(MonitoredTag) * updatedCount);
  tagCount = updatedCount;
  xSemaphoreGive(stateMutex);

  Serial.printf("Fetched %d RFID tag(s) assigned to Shop tools\n", updatedCount);
}

// ---------- Buzzer ----------

static void initBuzzer() {
  ledcAttach(BUZZER_PIN, BUZZER_FREQUENCY_HZ, 8);
  ledcWrite(BUZZER_PIN, 0);

  FastLED.addLeds<WS2812, RGB_LED_PIN, GRB>(rgbLed, RGB_LED_COUNT);
  FastLED.clear();
  FastLED.show();
}

static void setBuzzerOn(bool on) {
  uint8_t duty = on ? BUZZER_MAX_DUTY : 0;
  if (duty == buzzerDuty) return;
  buzzerDuty = duty;
  ledcWrite(BUZZER_PIN, duty);

  rgbLed[0] = on ? CRGB::Red : CRGB::Black;
  FastLED.show();
}

// ---------- Alarm evaluation ----------
//
// Binary, unlike the Beacon Tower's RSSI ramp -- see the file header for
// why. Any Available tool whose tag was read within TAG_STALE_MS -> alarm
// on. Runs on the main loop() task; never makes a network call itself.

static void evaluateAlarm() {
  unsigned long now = millis();
  bool anyAlarm = false;

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  for (int i = 0; i < tagCount; i++) {
    MonitoredTag& t = tags[i];
    bool recentlySeen = t.everSeen && (now - t.lastSeenMs) < TAG_STALE_MS;
    if (recentlySeen && t.isAvailable) {
      Serial.printf("%s (tag %s): at door -- ALARM\n", t.toolName, t.tagId);
      anyAlarm = true;
    }
  }
  xSemaphoreGive(stateMutex);

  setBuzzerOn(anyAlarm);
}

// ---------- Webhook receiver ----------
//
// The R700 posts a JSON array of ReaderEvent objects per batch (not one
// object per POST) -- see the Impinj IoT Device Interface docs on the
// Event Webhook. Most events here will be eventType "tagInventory"; other
// event types (e.g. connection/overflow events) are silently skipped.
//
// This never blocks waiting on the network -- the reader is the one
// initiating the connection to us -- so unlike Supabase calls, it's fine
// to run directly on the main loop() task via handleClient() rather than
// needing its own task.

static void handleTagReport() {
  String body = webServer.arg("plain");

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("Webhook: JSON parse failed: %s\n", err.c_str());
    webServer.send(400, "text/plain", "bad request");
    return;
  }

  JsonArray events = doc.as<JsonArray>();
  unsigned long now = millis();
  char tagIdHex[32];

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  for (JsonObject event : events) {
    if (strcmp(event["eventType"] | "", "tagInventory") != 0) continue;

    const char* epcB64 = event["tagInventoryEvent"]["epc"] | "";
    if (!epcB64[0] || !base64UrlToHexUpper(epcB64, tagIdHex, sizeof(tagIdHex))) continue;

    int idx = findTagById(tagIdHex);
    if (idx >= 0) {
      tags[idx].lastSeenMs = now;
      tags[idx].everSeen = true;
    }
  }
  xSemaphoreGive(stateMutex);

  webServer.send(200, "text/plain", "");
}

static void handleNotFound() {
  webServer.send(404, "text/plain", "not found");
}

// ---------- Network task ----------
//
// All WiFi/Supabase work happens here, on its own task pinned to core 0 --
// separate from the default Arduino loop() task (core 1), so a slow HTTPS
// request to Supabase never delays evaluateAlarm()/the webhook server and
// the buzzer stays responsive regardless of Supabase's response time.

static void networkTask(void* param) {
  connectWiFi();

  unsigned long lastFetchMs = millis();
  fetchTags();

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    unsigned long now = millis();
    if (now - lastFetchMs >= TAG_FETCH_INTERVAL_MS) {
      fetchTags();
      lastFetchMs = now;
    }

    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

// ---------- Arduino entry points ----------

void setup() {
  Serial.begin(115200);
  delay(200);

  stateMutex = xSemaphoreCreateMutex();

  initBuzzer();

  webServer.on(WEBHOOK_PATH, HTTP_POST, handleTagReport);
  webServer.onNotFound(handleNotFound);
  webServer.begin();

  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, nullptr, 1, nullptr, 0);
}

void loop() {
  unsigned long now = millis();
  static unsigned long lastEvalMs = 0;

  webServer.handleClient(); // cheap/non-blocking when idle -- see file header

  if (now - lastEvalMs >= ALARM_EVAL_INTERVAL_MS) {
    evaluateAlarm();
    lastEvalMs = now;
  }
}
