// Beacon range/calibration helper -- NOT the shop monitor sketch.
//
// Filters to a single known beacon MAC and prints its RSSI once a second,
// so you can walk it away from the board and watch signal strength drop
// with distance. Use this to pick a good alarm threshold for a tool before
// setting it in the app's "Assign Beacon" panel.
//
// Edit TARGET_MAC below to the beacon you want to test (colon-separated,
// as found with ble-scanner.ino -- not the no-colon form printed on the
// beacon's QR code).
//
// No WiFi or config.h needed. Same library requirement as the other
// sketches: NimBLE-Arduino by h2zero, latest 2.x release.

#include <NimBLEDevice.h>

#define TARGET_MAC "DD:34:02:0B:FF:58"
#define STALE_MS 3000UL

static volatile int8_t lastRssi = 0;
static volatile unsigned long lastSeenMs = 0;

class TargetScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    if (strcasecmp(dev->getAddress().toString().c_str(), TARGET_MAC) != 0) return;
    lastRssi = dev->getRSSI();
    lastSeenMs = millis();
  }
};

static TargetScanCallbacks scanCallbacks;
static unsigned long lastPrintMs = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("Watching for beacon %s -- walk away and watch the RSSI change.\n", TARGET_MAC);

  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&scanCallbacks, true); // true = report every advertisement, not just the first
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(100);
  scan->start(0);
}

void loop() {
  unsigned long now = millis();
  if (now - lastPrintMs >= 1000) {
    lastPrintMs = now;
    bool recentlySeen = lastSeenMs != 0 && (now - lastSeenMs) < STALE_MS;
    if (recentlySeen) {
      Serial.printf("RSSI: %4d dBm\n", lastRssi);
    } else {
      Serial.println("(not seen recently)");
    }
  }
}
