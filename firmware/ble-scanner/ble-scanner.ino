// Standalone BLE scanner helper -- NOT the shop monitor sketch.
//
// Flash this temporarily to find a BlueCharm beacon's MAC address, which is
// what you enter in the app's "Assign Beacon" field. It prints every BLE
// advertiser it sees, flagging ones that look like iBeacons (which is what
// BlueCharm beacons broadcast by default) so it's easy to pick your beacon
// out from phones/headphones/etc also broadcasting nearby.
//
// No WiFi or config.h needed for this one -- just flash and open the Serial
// Monitor at 115200 baud.
//
// Same library requirement as the main sketch: NimBLE-Arduino by h2zero,
// latest 2.x release.
//
// Once you've noted the MAC of your beacon, re-flash shop-beacon-monitor.ino
// as the board's real firmware.

#include <NimBLEDevice.h>

class ScanPrinter : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* dev) override {
    std::string mfg = dev->haveManufacturerData() ? dev->getManufacturerData() : "";
    bool looksLikeIBeacon = mfg.size() >= 25 &&
      (uint8_t)mfg[0] == 0x4C && (uint8_t)mfg[1] == 0x00 && // Apple company ID
      (uint8_t)mfg[2] == 0x02 && (uint8_t)mfg[3] == 0x15;   // iBeacon type/length

    Serial.printf("MAC: %-17s  RSSI: %4d  Name: %-20s  %s\n",
      dev->getAddress().toString().c_str(),
      dev->getRSSI(),
      dev->haveName() ? dev->getName().c_str() : "(none)",
      looksLikeIBeacon ? "<-- looks like an iBeacon (BlueCharm default)" : "");
  }
};

static ScanPrinter scanCallbacks;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Scanning for BLE advertisers... bring your BlueCharm beacon close.");
  Serial.println("Look for the line flagged as an iBeacon -- that MAC is your beacon ID.\n");

  NimBLEDevice::init("");
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setScanCallbacks(&scanCallbacks, true); // true = report every advertisement, not just the first
  scan->setActiveScan(true);
  scan->setInterval(100);
  scan->setWindow(100);
  scan->start(0); // scan forever, non-blocking
}

void loop() {
  delay(1000);
}
