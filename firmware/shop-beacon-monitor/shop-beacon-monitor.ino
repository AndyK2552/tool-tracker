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
// All Supabase/WiFi networking runs on its own FreeRTOS task (see
// networkTask()) pinned to the opposite core from the main loop(). HTTPS
// requests are blocking and can take a second or more; if they ran inline
// in loop() (as an earlier version did), the buzzer/LED would visibly
// freeze for that long every time the board polled. A mutex (stateMutex)
// guards the few things both tasks touch (the tools[] array and the
// warning/threshold/beep settings) -- see comments at each use.
//
// Libraries required (Arduino Library Manager):
//   - NimBLE-Arduino by h2zero, latest 2.x release
//   - ArduinoJson by bblanchon, version 7.x
//   - FastLED by Daniel Garcia, for the onboard WS2812 RGB LED (GPIO 48)
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
#include <limits.h>
#include <FastLED.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

#include "config.h"

// Onboard WS2812 RGB LED (Lonely Binary boards) -- blinks blue in lockstep
// with the buzzer as a visual confirmation of the same on/off state. Only
// ever touched from the main loop() task (same as the buzzer), so it
// doesn't need stateMutex.
#define RGB_LED_PIN 48
#define RGB_LED_COUNT 1
static CRGB rgbLed[RGB_LED_COUNT];

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

// Touched by: the BLE scan callback (its own NimBLE task), evaluateAlarms()
// (main loop task), and networkTask() -- always take stateMutex first.
static MonitoredTool tools[MAX_TOOLS];
static int toolCount = 0;

// Global beacon_settings, read from Supabase (see fetchBeaconSettings()).
// These fallback values match the SQL migration's default row, used only
// until the first successful fetch completes. Same locking rule as tools[].
// beepMaxGapMs is the app's "Chirp Frequency" slider (still named/stored as
// beep_duration_ms in Supabase) -- despite the historical name, it's the
// GAP between chirps at the warning edge, not a duration: each chirp's
// on-time is the fixed BUZZER_PULSE_ON_MS below, always. The gap shrinks
// from beepMaxGapMs down to 0 (continuous) as the beacon nears the
// threshold -- see rssiToBeepTiming().
static int rampStartRssi = -70;
static int globalThresholdRssi = -50;
static unsigned long beepMaxGapMs = 1000;

static SemaphoreHandle_t stateMutex;

static NimBLEScan* bleScan = nullptr;
static uint8_t buzzerDuty = 0;
static unsigned long lastScanRestartMs = 0;

// WiFi credentials the board actually connects with. Start from whatever's
// cached in flash (from a previous Supabase override) or fall back to the
// compiled-in config.h values; fetchBeaconSettings() can update these at
// runtime so the network can be changed (e.g. switching providers) without
// reflashing -- see loadWifiCredentials()/saveWifiCredentials(). Only ever
// touched from networkTask(), so no mutex needed.
static String effectiveSsid;
static String effectivePassword;

// ---------- BLE WiFi provisioning ----------
//
// Lets WiFi credentials be pushed to the board over Bluetooth even when it
// has no working network at all (unlike the Supabase-based override above,
// which needs the board online to fetch anything). The board runs both a
// central role (scanning for tool beacons, unchanged) and a peripheral
// role (this GATT server) at the same time -- NimBLE-Arduino supports both
// concurrently, but this combination gets less real-world mileage than the
// scan-only setup, so it's worth extra scrutiny on real hardware.
//
// The credentials characteristic is write-only and expects a JSON payload
// {"ssid":"...","password":"...","pin":"..."} -- "pin" must match
// BLE_PROVISIONING_PIN below, a basic shared-secret gate against literally
// anyone in BLE range rewriting the board's network. It's not strong
// cryptographic protection, just a deterrent against casual/accidental
// writes from other BLE apps. The status characteristic is read+notify so
// a connected client can see what happened after writing.
#define BLE_PROVISION_SERVICE_UUID "6f5c0001-8bde-4ea9-9c1a-3f6b1a2e9001"
#define BLE_PROVISION_CRED_CHAR_UUID "6f5c0002-8bde-4ea9-9c1a-3f6b1a2e9001"
#define BLE_PROVISION_STATUS_CHAR_UUID "6f5c0003-8bde-4ea9-9c1a-3f6b1a2e9001"

static NimBLECharacteristic* provisionStatusChar = nullptr;

// Set by the credentials characteristic's write callback (BLE host task),
// read/cleared by networkTask() -- guarded by stateMutex like everything
// else shared across tasks.
static bool bleProvisionRequested = false;
static String pendingBleSsid;
static String pendingBlePassword;

static void setProvisioningStatus(const char* msg) {
  Serial.print("BLE provisioning: ");
  Serial.println(msg);
  if (!provisionStatusChar) return;
  provisionStatusChar->setValue(msg);
  provisionStatusChar->notify();
}

class WifiProvisionCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    std::string value = pCharacteristic->getValue();

    JsonDocument doc;
    if (deserializeJson(doc, value)) {
      setProvisioningStatus("failed: malformed request");
      return;
    }

    const char* pin = doc["pin"] | "";
    if (strcmp(pin, BLE_PROVISIONING_PIN) != 0) {
      setProvisioningStatus("failed: wrong pin");
      return;
    }

    const char* ssid = doc["ssid"] | "";
    if (!ssid[0]) {
      setProvisioningStatus("failed: missing network name");
      return;
    }
    const char* password = doc["password"] | "";

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    pendingBleSsid = ssid;
    pendingBlePassword = password;
    bleProvisionRequested = true;
    xSemaphoreGive(stateMutex);

    setProvisioningStatus("received -- connecting...");
  }
};

static WifiProvisionCallbacks provisionCallbacks;

static void startBleProvisioning() {
  NimBLEServer* server = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(BLE_PROVISION_SERVICE_UUID);

  NimBLECharacteristic* credChar = service->createCharacteristic(BLE_PROVISION_CRED_CHAR_UUID, NIMBLE_PROPERTY::WRITE);
  credChar->setCallbacks(&provisionCallbacks);

  provisionStatusChar = service->createCharacteristic(BLE_PROVISION_STATUS_CHAR_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  provisionStatusChar->setValue("idle");

  server->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_PROVISION_SERVICE_UUID);
  advertising->start();
}

// ---------- helpers ----------

static void macToString(const NimBLEAddress& addr, char* out, size_t outLen) {
  strncpy(out, addr.toString().c_str(), outLen - 1);
  out[outLen - 1] = '\0';
  for (size_t i = 0; out[i]; i++) out[i] = toupper(out[i]);
}

// Caller must already hold stateMutex.
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

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    int idx = findToolByMac(mac);
    if (idx >= 0) {
      MonitoredTool& t = tools[idx];
      int8_t rawRssi = advertisedDevice->getRSSI();
      t.rssiEma = t.everSeen ? (RSSI_EMA_ALPHA * rawRssi + (1.0f - RSSI_EMA_ALPHA) * t.rssiEma) : (float)rawRssi;
      t.currentRssi = (int8_t)lroundf(t.rssiEma);
      t.lastSeenMs = millis();
      t.everSeen = true;
    }
    xSemaphoreGive(stateMutex);
  }
};

static BeaconScanCallbacks scanCallbacks;

static void startBleScan() {
  bleScan = NimBLEDevice::getScan();
  bleScan->setScanCallbacks(&scanCallbacks, true); // true = report every advertisement, not just the first
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(100);
  bleScan->start(0); // scan forever, non-blocking
}

// ---------- WiFi / time ----------

// Call once at boot, before the first connectWiFi(). Loads a previously-
// cached override if fetchBeaconSettings() has ever saved one, else falls
// back to the config.h compile-time values.
static void loadWifiCredentials() {
  Preferences prefs;
  prefs.begin("wifi", true); // read-only
  effectiveSsid = prefs.getString("ssid", WIFI_SSID);
  effectivePassword = prefs.getString("password", WIFI_PASSWORD);
  prefs.end();
}

static void saveWifiCredentials(const String& ssid, const String& password) {
  Preferences prefs;
  prefs.begin("wifi", false); // read-write
  prefs.putString("ssid", ssid);
  prefs.putString("password", password);
  prefs.end();
}

static void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(effectiveSsid.c_str(), effectivePassword.c_str());
  Serial.println("Connecting to WiFi (" + effectiveSsid + ")");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected: " + WiFi.localIP().toString());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println(" failed, will retry");
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

// Takes copied values rather than a MonitoredTool& so the network call
// never happens while stateMutex is held.
static void supabasePatchAlarm(const char* toolId, bool alarmActive, bool hasLastSeen) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/tools?id=eq." + String(toolId);
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument body;
  body["beacon_alarm_active"] = alarmActive;
  char iso[25];
  if (hasLastSeen && nowIso8601(iso, sizeof(iso))) {
    body["beacon_last_seen"] = iso;
  }
  String payload;
  serializeJson(body, payload);

  int code = http.sendRequest("PATCH", payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Supabase PATCH for %s failed: %d\n", toolId, code);
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
  String path = "/rest/v1/beacon_settings?select=warning_beep_distance_pct,beep_duration_ms,threshold_distance_pct,wifi_ssid,wifi_password";
  if (!supabaseGet(path, doc)) return; // network call -- never done while holding stateMutex

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) return;
  JsonObject row = arr[0];

  int warningPct = row["warning_beep_distance_pct"] | 33;
  int thresholdPct = row["threshold_distance_pct"] | 67;
  unsigned long newBeepMaxGapMs = row["beep_duration_ms"] | 1000;
  int newRampStartRssi = pctToRssi(warningPct);
  int newGlobalThresholdRssi = pctToRssi(thresholdPct);

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  beepMaxGapMs = newBeepMaxGapMs;
  rampStartRssi = newRampStartRssi;
  globalThresholdRssi = newGlobalThresholdRssi;
  xSemaphoreGive(stateMutex);

  Serial.printf("Beacon settings: warning=%d%% (%d dBm) max gap=%lums threshold=%d%% (%d dBm)\n",
    warningPct, newRampStartRssi, newBeepMaxGapMs, thresholdPct, newGlobalThresholdRssi);

  // WiFi credentials can be overridden from the app (see loadWifiCredentials()
  // for why this only actually takes effect on the next reconnect, not
  // immediately). Blank/null in Supabase means "keep using what's current."
  const char* newSsid = row["wifi_ssid"] | "";
  const char* newPassword = row["wifi_password"] | "";
  if (newSsid[0] && (effectiveSsid != newSsid || effectivePassword != newPassword)) {
    effectiveSsid = newSsid;
    effectivePassword = newPassword;
    saveWifiCredentials(effectiveSsid, effectivePassword);
    Serial.println("WiFi credentials updated from Supabase -- will be used next time the board reconnects");
  }
}

static void fetchTools() {
  JsonDocument doc;
  String path = "/rest/v1/tools?location=eq.Shop&beacon_mac=not.is.null"
                "&select=id,name,beacon_mac,is_checked_out,condition,beacon_alarm_active";
  if (!supabaseGet(path, doc)) return; // network call -- never done while holding stateMutex

  JsonArray arr = doc.as<JsonArray>();
  static MonitoredTool updated[MAX_TOOLS]; // static: keep this ~5.6KB array off this task's stack

  xSemaphoreTake(stateMutex, portMAX_DELAY);
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
  xSemaphoreGive(stateMutex);

  Serial.printf("Fetched %d Shop tool(s) with a beacon assigned:\n", updatedCount);
  for (int i = 0; i < updatedCount; i++) {
    Serial.printf("  - %s (%s): beacon=%s available=%s\n",
      updated[i].name, updated[i].id, updated[i].beaconMac,
      updated[i].isAvailable ? "yes" : "no");
  }
}

// Sends a PATCH for every tool with pendingSync set, one at a time. Copies
// each tool's fields out while holding stateMutex only briefly, then does
// the actual (blocking) network call after releasing it.
static void syncPendingAlarms() {
  for (int i = 0; i < MAX_TOOLS; i++) {
    xSemaphoreTake(stateMutex, portMAX_DELAY);
    if (i >= toolCount) {
      xSemaphoreGive(stateMutex);
      break;
    }
    bool pending = tools[i].pendingSync;
    char idCopy[40];
    bool alarmActiveCopy = tools[i].alarmActive;
    bool everSeenCopy = tools[i].everSeen;
    if (pending) {
      strncpy(idCopy, tools[i].id, sizeof(idCopy));
      tools[i].pendingSync = false;
    }
    xSemaphoreGive(stateMutex);

    if (pending) {
      supabasePatchAlarm(idCopy, alarmActiveCopy, everSeenCopy);
    }
  }
}

// ---------- Buzzer ----------
//
// Volume via PWM duty cycle doesn't work reliably on resonant piezo buzzer
// modules -- they tend to just be on or off regardless of instantaneous
// duty. Instead, urgency is conveyed via pulse rate: chirps that happen
// more often as the beacon approaches, merging into a continuous tone
// right at the threshold -- the same idea as a parking-sensor beeper.
//
// Every chirp is the same fixed length (BUZZER_PULSE_ON_MS) -- proximity
// is conveyed entirely by the GAP between chirps shrinking (from
// beepMaxGapMs down to 0), so beeps genuinely speed up as the beacon
// approaches rather than just getting longer.
//
// evaluateAlarms() (~1s cadence, main loop task) recomputes
// silent/continuous/onMs/offMs from whichever watched tool is currently
// most urgent; updateBuzzerPulse() reads that every loop() iteration (no
// delay(), never blocked by networking since that's on its own task now)
// to do the actual on/off timing, since pulses can be a few ms long.

#define BUZZER_PULSE_ON_MS 100 // fixed chirp length; only the gap between chirps varies

static bool buzzerSilent = true;
static bool buzzerContinuous = false;
static unsigned long beepOnMs = 0;
static unsigned long beepOffMs = 0;
static bool pulseOn = false;
static unsigned long pulseChangeMs = 0;

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

  rgbLed[0] = on ? CRGB::Blue : CRGB::Black;
  FastLED.show();
}

// Call every loop() iteration -- does the actual on/off timing based on
// whatever evaluateAlarms() last computed.
static void updateBuzzerPulse() {
  if (buzzerSilent) {
    setBuzzerOn(false);
    pulseOn = false;
    return;
  }
  if (buzzerContinuous) {
    setBuzzerOn(true);
    pulseOn = true;
    return;
  }
  unsigned long now = millis();
  if (pulseOn && now - pulseChangeMs >= beepOnMs) {
    pulseOn = false;
    pulseChangeMs = now;
  } else if (!pulseOn && now - pulseChangeMs >= beepOffMs) {
    pulseOn = true;
    pulseChangeMs = now;
  }
  setBuzzerOn(pulseOn);
}

// Maps how close a beacon is to the global alarm threshold onto a pulse
// pattern: silent at/below rampStartRssi, continuous at/past
// globalThresholdRssi, and pulsing with a fixed on-length
// (BUZZER_PULSE_ON_MS, always the same) and a gap that shrinks from
// beepMaxGapMs down toward 0 in between -- the gap shrinking is what makes
// it sound faster/more urgent, not the pulse getting longer.
// Caller must already hold stateMutex (reads rampStartRssi/
// globalThresholdRssi/beepMaxGapMs).
static void rssiToBeepTiming(int rssi, bool* silent, bool* continuous, unsigned long* onMs, unsigned long* offMs) {
  if (rssi <= rampStartRssi) {
    *silent = true; *continuous = false; *onMs = 0; *offMs = 0;
    return;
  }
  if (rssi >= globalThresholdRssi || globalThresholdRssi <= rampStartRssi) {
    *silent = false; *continuous = true; *onMs = 0; *offMs = 0;
    return;
  }
  float t = (float)(rssi - rampStartRssi) / (float)(globalThresholdRssi - rampStartRssi);
  *silent = false; *continuous = false;
  *onMs = BUZZER_PULSE_ON_MS;
  *offMs = (unsigned long)((1.0f - t) * beepMaxGapMs);
}

// ---------- Alarm evaluation ----------
//
// Runs on the main loop() task. Only computes state (buzzerSilent/
// buzzerContinuous/beepOnMs/beepOffMs and each tool's pendingSync flag) --
// never makes a network call itself, so it can never block updateBuzzerPulse().
// Actual PATCH sending happens in syncPendingAlarms() on the network task.

static void evaluateAlarms() {
  bool anyContinuous = false;
  bool anyPulsing = false;
  unsigned long mostUrgentOffMs = ULONG_MAX; // smaller = more urgent (faster repeat)
  unsigned long mostUrgentOnMs = 0;
  unsigned long now = millis();

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  for (int i = 0; i < toolCount; i++) {
    MonitoredTool& t = tools[i];
    // A beacon we haven't heard from recently is definitely not near the
    // door -- -127 sentinel keeps it below any realistic threshold.
    bool recentlySeen = t.everSeen && (now - t.lastSeenMs) < BEACON_STALE_MS;
    int8_t effectiveRssi = recentlySeen ? t.currentRssi : -127;
    bool nearDoor = effectiveRssi > globalThresholdRssi;
    bool shouldAlarm = t.isAvailable && nearDoor;

    bool silent, continuous;
    unsigned long onMs, offMs;
    if (t.isAvailable) {
      rssiToBeepTiming(effectiveRssi, &silent, &continuous, &onMs, &offMs);
    } else {
      silent = true; continuous = false; onMs = 0; offMs = 0;
    }

    if (recentlySeen) {
      const char* beepDesc = silent ? "silent" : continuous ? "continuous" : "pulsing";
      Serial.printf("%s: rssi=%d threshold=%d %s (on=%lums off=%lums)%s\n", t.name, effectiveRssi, globalThresholdRssi,
                    beepDesc, onMs, offMs, shouldAlarm ? " -- ALARM" : "");
    } else {
      Serial.printf("%s: rssi=n/a (not seen recently) threshold=%d\n", t.name, globalThresholdRssi);
    }

    if (shouldAlarm != t.alarmActive) {
      t.alarmActive = shouldAlarm;
      t.pendingSync = true;
    }

    if (continuous) {
      anyContinuous = true;
    } else if (!silent) {
      anyPulsing = true;
      if (offMs < mostUrgentOffMs) {
        mostUrgentOffMs = offMs;
        mostUrgentOnMs = onMs;
      }
    }
  }
  xSemaphoreGive(stateMutex);

  buzzerContinuous = anyContinuous;
  buzzerSilent = !anyContinuous && !anyPulsing;
  if (!anyContinuous && anyPulsing) {
    beepOnMs = mostUrgentOnMs;
    beepOffMs = mostUrgentOffMs;
  }
}

// ---------- Network task ----------
//
// All WiFi/Supabase work happens here, on its own task pinned to core 0 --
// separate from the default Arduino loop() task (core 1), so a slow HTTPS
// request never delays evaluateAlarms()/updateBuzzerPulse() and the
// buzzer/LED cadence stays smooth regardless of network timing.

static void networkTask(void* param) {
  loadWifiCredentials();
  connectWiFi();

  unsigned long lastFetchMs = millis();
  fetchBeaconSettings();
  fetchTools();

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    unsigned long now = millis();
    if (now - lastFetchMs >= TOOL_FETCH_INTERVAL_MS) {
      fetchBeaconSettings();
      fetchTools();
      lastFetchMs = now;
    }

    syncPendingAlarms();

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    bool doProvision = bleProvisionRequested;
    String newSsid = pendingBleSsid;
    String newPassword = pendingBlePassword;
    bleProvisionRequested = false;
    xSemaphoreGive(stateMutex);

    if (doProvision) {
      effectiveSsid = newSsid;
      effectivePassword = newPassword;
      saveWifiCredentials(effectiveSsid, effectivePassword);
      WiFi.disconnect();
      connectWiFi();
      if (WiFi.status() == WL_CONNECTED) {
        setProvisioningStatus(("connected: " + WiFi.localIP().toString()).c_str());
      } else {
        setProvisioningStatus("failed: could not connect with those credentials");
      }
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

  // Bring up the NimBLE host once, then register the GATT server (for BLE
  // WiFi provisioning) *before* scanning starts. Registering GATT services
  // while a scan is already active raced with the host stack's own HCI
  // traffic and crashed with "assert failed: ble_svc_gap_init ... rc == 0"
  // on boot -- doing the one-time server setup first, then starting the
  // continuous scan, avoids that.
  NimBLEDevice::init("ShopBeaconMonitor"); // named so it's identifiable in a BLE device picker (Web Bluetooth, nRF Connect, etc.)
  startBleProvisioning();
  startBleScan();
  lastScanRestartMs = millis();

  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, nullptr, 1, nullptr, 0);
}

void loop() {
  unsigned long now = millis();
  static unsigned long lastEvalMs = 0;

  if (now - lastEvalMs >= ALARM_EVAL_INTERVAL_MS) {
    evaluateAlarms();
    lastEvalMs = now;
  }

  // A long-running continuous BLE scan can occasionally get into a
  // degraded state (worse with WiFi sharing the same radio) where it
  // takes far longer than expected to pick a beacon back up after a
  // signal gap. Restarting periodically is a cheap safety net against
  // that -- takes milliseconds, bounds how long any such stall can last.
  if (now - lastScanRestartMs >= SCAN_RESTART_INTERVAL_MS) {
    bleScan->stop();
    bleScan->start(0);
    lastScanRestartMs = now;
  }

  updateBuzzerPulse(); // every iteration, unthrottled -- pulses can be as short as a few ms
}
