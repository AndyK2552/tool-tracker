// ESP32-S3 door sensor for the KYPD Tool Tracker.
//
// Mount this board at the shop door/exit. It continuously BLE-scans for
// BlueCharm beacons attached to Shop tools, and periodically polls Supabase
// for each watched tool's status, plus one global beacon_settings row (set
// from the app's Beacon Settings page, applies to every tool). If a tool is
// "Available" (not checked out, not Pending/Damaged), the buzzer starts
// chirping once its beacon's RSSI rises above the configured warning
// distance -- short, sparse chirps at first, getting longer/more frequent
// as the beacon gets closer, merging into a continuous tone at the
// configured threshold distance -- i.e. the tool being carried toward the
// door sounds increasingly urgent as it approaches. It goes quiet again
// once the beacon moves back away from the door, or once the tool is
// checked out in the app (status no longer Available). Settings changes
// take effect on the board's next poll, no reflashing needed.
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
//      nRF Connect). No per-tool threshold anymore -- that's now set once
//      for all tools in the app's Beacon Settings page (admin only).
//   3. Flash this sketch to the ESP32-S3.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <time.h>
#include <math.h>

#include "config.h"

#define MAX_TOOLS 40

// Weight given to each new RSSI sample in the running average (0-1).
// Raw BLE RSSI is noisy -- without this, the beep pace tracks sample-to-
// sample jitter as much as actual distance.
#define RSSI_EMA_ALPHA 0.3f

struct MonitoredTool {
  char id[40];
  char name[64];
  char beaconMac[18];
  bool isAvailable;
  bool alarmActive;   // last alarm state we told Supabase about
  int8_t currentRssi; // smoothed + rounded -- what alarm/beep logic reads
  float rssiEma;       // raw smoothing accumulator behind currentRssi
  unsigned long lastSeenMs;
  bool everSeen;
  bool pendingSync;    // alarmActive changed locally, needs a PATCH
};

static MonitoredTool tools[MAX_TOOLS];
static int toolCount = 0;

// Global beacon_settings, read from Supabase (see fetchBeaconSettings()).
// These fallback values match the SQL migration's default row, used only
// until the first successful fetch completes.
static int rampStartRssi = -70;
static int globalThresholdRssi = -50;
static unsigned long beepMinOnMs = 5;

static NimBLEScan* bleScan = nullptr;
static uint8_t buzzerDuty = 0;
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

    MonitoredTool& t = tools[idx];
    int8_t rawRssi = advertisedDevice->getRSSI();
    t.rssiEma = t.everSeen ? (RSSI_EMA_ALPHA * rawRssi + (1.0f - RSSI_EMA_ALPHA) * t.rssiEma) : (float)rawRssi;
    t.currentRssi = (int8_t)lroundf(t.rssiEma);
    t.lastSeenMs = millis();
    t.everSeen = true;
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

static void supabasePatchAlarm(MonitoredTool& tool) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/tools?id=eq." + String(tool.id);
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);
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

// 0% = -90 dBm (loosest/farthest trigger), 100% = -30 dBm (strictest/
// closest) -- must match the app's BeaconSettings.jsx pctToRssi().
static int pctToRssi(int pct) {
  return (int)round(-90.0 + pct * 0.6);
}

static void fetchBeaconSettings() {
  JsonDocument doc;
  String path = "/rest/v1/beacon_settings?select=warning_beep_distance_pct,beep_duration_ms,threshold_distance_pct";
  if (!supabaseGet(path, doc)) return;

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) return;
  JsonObject row = arr[0];

  int warningPct = row["warning_beep_distance_pct"] | 33;
  int thresholdPct = row["threshold_distance_pct"] | 67;
  beepMinOnMs = row["beep_duration_ms"] | 5;
  rampStartRssi = pctToRssi(warningPct);
  globalThresholdRssi = pctToRssi(thresholdPct);

  Serial.printf("Beacon settings: warning=%d%% (%d dBm) beep=%lums threshold=%d%% (%d dBm)\n",
    warningPct, rampStartRssi, beepMinOnMs, thresholdPct, globalThresholdRssi);
}

static void fetchTools() {
  JsonDocument doc;
  String path = "/rest/v1/tools?location=eq.Shop&beacon_mac=not.is.null"
                "&select=id,name,beacon_mac,is_checked_out,condition,beacon_alarm_active";
  if (!supabaseGet(path, doc)) return;

  JsonArray arr = doc.as<JsonArray>();
  static MonitoredTool updated[MAX_TOOLS]; // static: keep this ~5.6KB array off the loop task's stack
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
      t.rssiEma = tools[prevIdx].rssiEma;
      t.lastSeenMs = tools[prevIdx].lastSeenMs;
      t.everSeen = tools[prevIdx].everSeen;
    }

    updated[updatedCount++] = t;
  }

  memcpy(tools, updated, sizeof(MonitoredTool) * updatedCount);
  toolCount = updatedCount;

  Serial.printf("Fetched %d Shop tool(s) with a beacon assigned:\n", toolCount);
  for (int i = 0; i < toolCount; i++) {
    Serial.printf("  - %s (%s): beacon=%s available=%s\n",
      tools[i].name, tools[i].id, tools[i].beaconMac,
      tools[i].isAvailable ? "yes" : "no");
  }
}

// ---------- Buzzer ----------
//
// Volume via PWM duty cycle doesn't work reliably on resonant piezo buzzer
// modules -- they tend to just be on or off regardless of instantaneous
// duty. Instead, urgency is conveyed via pulse rate: short chirps that get
// longer/more frequent as the beacon approaches, merging into a continuous
// tone right at the threshold -- the same idea as a parking-sensor beeper.
//
// beepOnMs is recomputed once per evaluateAlarms() cycle (~1s) from
// whichever watched tool is closest to alarming; updateBuzzerPulse() reads
// it every loop() iteration (no delay()) to do the actual fast on/off
// toggling, since a 5ms pulse needs finer timing than the 1s eval cadence.

static unsigned long beepOnMs = 0;

static void initBuzzer() {
  ledcAttach(BUZZER_PIN, BUZZER_FREQUENCY_HZ, 8);
  ledcWrite(BUZZER_PIN, 0);
}

static void setBuzzerOn(bool on) {
  uint8_t duty = on ? BUZZER_MAX_DUTY : 0;
  if (duty == buzzerDuty) return;
  buzzerDuty = duty;
  ledcWrite(BUZZER_PIN, duty);
}

// Call every loop() iteration -- does the actual pulsing based on the
// beepOnMs target that evaluateAlarms() last computed.
static void updateBuzzerPulse() {
  if (beepOnMs == 0) {
    setBuzzerOn(false);
  } else if (beepOnMs >= BUZZER_BEEP_PERIOD_MS) {
    setBuzzerOn(true);
  } else {
    setBuzzerOn((millis() % BUZZER_BEEP_PERIOD_MS) < beepOnMs);
  }
}

// Maps how close a beacon is to the global alarm threshold onto how long
// the buzzer stays on within each BUZZER_BEEP_PERIOD_MS cycle: 0 (silent)
// at/below rampStartRssi, the full period (continuous tone) at/past
// globalThresholdRssi, ramping from a short chirp (beepMinOnMs) in between.
// rampStartRssi/globalThresholdRssi/beepMinOnMs come from Supabase --
// see fetchBeaconSettings().
static unsigned long rssiToBeepOnMs(int rssi) {
  if (rssi <= rampStartRssi) return 0;
  if (rssi >= globalThresholdRssi || globalThresholdRssi <= rampStartRssi) return BUZZER_BEEP_PERIOD_MS;
  float t = (float)(rssi - rampStartRssi) / (float)(globalThresholdRssi - rampStartRssi);
  return beepMinOnMs + (unsigned long)(t * (BUZZER_BEEP_PERIOD_MS - beepMinOnMs));
}

// ---------- Alarm evaluation ----------

static void evaluateAlarms() {
  unsigned long loudestOnMs = 0;
  unsigned long now = millis();

  for (int i = 0; i < toolCount; i++) {
    MonitoredTool& t = tools[i];
    // A beacon we haven't heard from recently is definitely not near the
    // door -- -127 sentinel keeps it below any realistic threshold.
    bool recentlySeen = t.everSeen && (now - t.lastSeenMs) < BEACON_STALE_MS;
    int8_t effectiveRssi = recentlySeen ? t.currentRssi : -127;
    bool nearDoor = effectiveRssi > globalThresholdRssi;
    bool shouldAlarm = t.isAvailable && nearDoor;
    unsigned long onMs = t.isAvailable ? rssiToBeepOnMs(effectiveRssi) : 0;

    if (recentlySeen) {
      const char* beepDesc = onMs == 0 ? "silent"
        : onMs >= BUZZER_BEEP_PERIOD_MS ? "continuous" : "pulsing";
      Serial.printf("%s: rssi=%d threshold=%d %s (on=%lums/%dms)%s\n", t.name, effectiveRssi, globalThresholdRssi,
                    beepDesc, onMs, BUZZER_BEEP_PERIOD_MS, shouldAlarm ? " -- ALARM" : "");
    } else {
      Serial.printf("%s: rssi=n/a (not seen recently) threshold=%d\n", t.name, globalThresholdRssi);
    }

    if (shouldAlarm != t.alarmActive) {
      t.alarmActive = shouldAlarm;
      t.pendingSync = true;
    }
    if (onMs > loudestOnMs) loudestOnMs = onMs;
  }

  beepOnMs = loudestOnMs;

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

  initBuzzer();
  connectWiFi();
  startBleScan();

  fetchBeaconSettings();
  fetchTools();
  lastFetchMs = millis();
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (now - lastFetchMs >= TOOL_FETCH_INTERVAL_MS) {
    fetchBeaconSettings();
    fetchTools();
    lastFetchMs = now;
  }

  if (now - lastEvalMs >= ALARM_EVAL_INTERVAL_MS) {
    evaluateAlarms();
    lastEvalMs = now;
  }

  updateBuzzerPulse(); // every iteration, unthrottled -- pulses can be as short as a few ms
}
