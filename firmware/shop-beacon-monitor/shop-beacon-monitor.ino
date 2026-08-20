// ESP32-S3 door sensor for the KYPD Tool Tracker.
//
// Mount this board at the shop door/exit. It continuously BLE-scans for
// BlueCharm beacons attached to Shop tools, and periodically polls Supabase
// for each watched tool's status and alarm threshold. If a tool is
// "Available" (not checked out, not Pending/Damaged) and its beacon's RSSI
// rises above the tool's configured threshold -- i.e. the tool is being
// carried near the door -- the buzzer sounds. It goes quiet again once the
// beacon moves back away from the door, or once the tool is checked out in
// the app (status no longer Available).
//
// The beacon's motion sensor isn't wired to this board directly -- BlueCharm
// beacons with a motion sensor typically switch to faster BLE advertising
// intervals on movement, which just means fresher RSSI readings here. All
// the distance/alarm logic runs off RSSI.
//
// Libraries required (Arduino Library Manager):
//   - NimBLE-Arduino by h2zero, latest 2.x release
//   - ArduinoJson by bblanchon, version 7.x
//
// Targets Arduino-ESP32 core 3.x (current default in Boards Manager), which
// uses the pin-based ledcAttach/ledcWriteTone API for the passive buzzer.
//
// Setup:
//   1. Copy config.example.h to config.h and fill in WiFi + Supabase details.
//   2. In the Tool Tracker app, open each Shop tool -> Assign Beacon, and
//      enter the beacon's MAC address (find it with a BLE scanner app like
//      nRF Connect) and an RSSI alarm threshold (start with -75).
//   3. Flash this sketch to the ESP32-S3.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <time.h>

#include "config.h"

#define MAX_TOOLS 40

struct MonitoredTool {
  char id[40];
  char name[64];
  char beaconMac[18];
  int rssiThreshold;
  bool isAvailable;
  bool alarmActive;   // last alarm state we told Supabase about
  int8_t currentRssi;
  unsigned long lastSeenMs;
  bool everSeen;
  bool pendingSync;    // alarmActive changed locally, needs a PATCH
};

static MonitoredTool tools[MAX_TOOLS];
static int toolCount = 0;

static NimBLEScan* bleScan = nullptr;
static bool buzzerOn = false;
static unsigned long lastFetchMs = 0;
static unsigned long lastEvalMs = 0;

// ---------- helpers ----------

static void macToString(const NimBLEAddress& addr, char* out, size_t outLen) {
  strncpy(out, addr.toString().c_str(), outLen - 1);
  out[outLen - 1] = '\0';
  for (size_t i = 0; out[i]; i++) out[i] = toupper(out[i]);
}

static int findToolByMac(const char* mac) {
  for (int i = 0; i < toolCount; i++) {
    if (strcasecmp(tools[i].beaconMac, mac) == 0) return i;
  }
  return -1;
}

// ---------- BLE scanning ----------

class BeaconScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* advertisedDevice) override {
    char mac[18];
    macToString(advertisedDevice->getAddress(), mac, sizeof(mac));

    int idx = findToolByMac(mac);
    if (idx < 0) return;

    tools[idx].currentRssi = advertisedDevice->getRSSI();
    tools[idx].lastSeenMs = millis();
    tools[idx].everSeen = true;
  }
};

static BeaconScanCallbacks scanCallbacks;

static void startBleScan() {
  NimBLEDevice::init("");
  bleScan = NimBLEDevice::getScan();
  bleScan->setScanCallbacks(&scanCallbacks, true); // true = report every advertisement, not just the first
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(100);
  bleScan->start(0); // scan forever, non-blocking
}

// ---------- WiFi / time ----------

static void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected: " + WiFi.localIP().toString());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println(" failed, will retry in loop()");
  }
}

static bool nowIso8601(char* out, size_t outLen) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false; // not synced yet
  struct tm t;
  gmtime_r(&now, &t);
  strftime(out, outLen, "%Y-%m-%dT%H:%M:%SZ", &t);
  return true;
}

// ---------- Supabase ----------

static bool supabaseGet(const String& path, JsonDocument& doc) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + path;
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  int code = http.GET();
  bool ok = false;
  if (code == 200) {
    DeserializationError err = deserializeJson(doc, http.getStream());
    ok = !err;
    if (err) Serial.printf("Supabase GET: JSON parse failed: %s\n", err.c_str());
  } else {
    Serial.printf("Supabase GET failed: %d\n", code);
  }
  http.end();
  return ok;
}

static void supabasePatchAlarm(MonitoredTool& tool) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/tools?id=eq." + String(tool.id);
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument body;
  body["beacon_alarm_active"] = tool.alarmActive;
  char iso[25];
  if (tool.everSeen && nowIso8601(iso, sizeof(iso))) {
    body["beacon_last_seen"] = iso;
  }
  String payload;
  serializeJson(body, payload);

  int code = http.sendRequest("PATCH", payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Supabase PATCH for %s failed: %d\n", tool.id, code);
  }
  http.end();
}

static void fetchTools() {
  JsonDocument doc;
  String path = "/rest/v1/tools?location=eq.Shop&beacon_mac=not.is.null"
                "&select=id,name,beacon_mac,beacon_rssi_threshold,is_checked_out,condition,beacon_alarm_active";
  if (!supabaseGet(path, doc)) return;

  JsonArray arr = doc.as<JsonArray>();
  MonitoredTool updated[MAX_TOOLS];
  int updatedCount = 0;

  for (JsonObject row : arr) {
    if (updatedCount >= MAX_TOOLS) break;
    const char* mac = row["beacon_mac"] | "";
    if (!mac[0]) continue;

    MonitoredTool t = {};
    strncpy(t.id, row["id"] | "", sizeof(t.id) - 1);
    strncpy(t.name, row["name"] | "", sizeof(t.name) - 1);
    strncpy(t.beaconMac, mac, sizeof(t.beaconMac) - 1);
    for (size_t i = 0; t.beaconMac[i]; i++) t.beaconMac[i] = toupper(t.beaconMac[i]);
    t.rssiThreshold = row["beacon_rssi_threshold"] | -75;

    bool isCheckedOut = row["is_checked_out"] | false;
    const char* condition = row["condition"] | "Ready";
    t.isAvailable = !isCheckedOut && strcmp(condition, "Pending") != 0 && strcmp(condition, "Damaged") != 0;

    t.alarmActive = row["beacon_alarm_active"] | false;
    t.currentRssi = -127;
    t.lastSeenMs = 0;
    t.everSeen = false;
    t.pendingSync = false;

    // Preserve live RSSI tracking across refreshes for the same beacon.
    int prevIdx = findToolByMac(t.beaconMac);
    if (prevIdx >= 0) {
      t.currentRssi = tools[prevIdx].currentRssi;
      t.lastSeenMs = tools[prevIdx].lastSeenMs;
      t.everSeen = tools[prevIdx].everSeen;
    }

    updated[updatedCount++] = t;
  }

  memcpy(tools, updated, sizeof(MonitoredTool) * updatedCount);
  toolCount = updatedCount;
}

// ---------- Buzzer ----------

static void setBuzzer(bool on) {
  if (on == buzzerOn) return;
  buzzerOn = on;
  if (on) {
    ledcAttach(BUZZER_PIN, BUZZER_FREQUENCY_HZ, 8);
    ledcWriteTone(BUZZER_PIN, BUZZER_FREQUENCY_HZ);
  } else {
    ledcWriteTone(BUZZER_PIN, 0);
    ledcDetach(BUZZER_PIN);
  }
}

// ---------- Alarm evaluation ----------

static void evaluateAlarms() {
  bool anyAlarm = false;
  unsigned long now = millis();

  for (int i = 0; i < toolCount; i++) {
    MonitoredTool& t = tools[i];
    // A beacon we haven't heard from recently is definitely not near the
    // door -- -127 sentinel keeps it below any realistic threshold.
    bool recentlySeen = t.everSeen && (now - t.lastSeenMs) < BEACON_STALE_MS;
    int8_t effectiveRssi = recentlySeen ? t.currentRssi : -127;
    bool nearDoor = effectiveRssi > t.rssiThreshold;
    bool shouldAlarm = t.isAvailable && nearDoor;

    if (shouldAlarm != t.alarmActive) {
      t.alarmActive = shouldAlarm;
      t.pendingSync = true;
      Serial.printf("%s: %s (rssi=%d, threshold=%d)\n", t.name,
                    shouldAlarm ? "ALARM - near door" : "clear", effectiveRssi, t.rssiThreshold);
    }
    if (shouldAlarm) anyAlarm = true;
  }

  setBuzzer(anyAlarm);

  for (int i = 0; i < toolCount; i++) {
    if (tools[i].pendingSync) {
      supabasePatchAlarm(tools[i]);
      tools[i].pendingSync = false;
    }
  }
}

// ---------- Arduino entry points ----------

void setup() {
  Serial.begin(115200);
  delay(200);

  connectWiFi();
  startBleScan();

  fetchTools();
  lastFetchMs = millis();
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (now - lastFetchMs >= TOOL_FETCH_INTERVAL_MS) {
    fetchTools();
    lastFetchMs = now;
  }

  if (now - lastEvalMs >= ALARM_EVAL_INTERVAL_MS) {
    evaluateAlarms();
    lastEvalMs = now;
  }
}
