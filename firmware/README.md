# Shop Beacon Monitor (ESP32-S3)

Mount a single ESP32-S3 board at the shop **door/exit**. It watches BlueCharm
BLE beacons attached to Shop tools, and if a tool is still **Available** in
the Tool Tracker app but its beacon's signal is *strong* — i.e. it's being
carried near the door — the buzzer sounds. It's a rough "someone's walking
off with this without checking it out" alarm. It goes quiet again once the
beacon moves back away from the door, or once the tool gets checked out
properly in the app.

One board watches every Shop tool that has a beacon assigned — you don't
need one board per tool.

## How it decides proximity

BlueCharm beacons don't report distance directly — the firmware watches
**RSSI** (received signal strength) instead, which is far more reliable in
practice than converting to meters. Each tool gets its own RSSI threshold
(default `-75` dBm) that you tune based on your door/shop layout: carry the
tool's beacon past the board at the door, watch the Serial Monitor log the
RSSI as it peaks, and set the threshold a bit below that peak so it reliably
triggers. More negative = weaker signal = farther away, so the alarm fires
when RSSI rises *above* the threshold (i.e. the beacon gets close).

The beacon's onboard motion sensor isn't wired into this board at all — it's
not needed for this logic. BlueCharm beacons with a motion sensor typically
switch to a faster BLE advertising interval when they move, which just means
the board gets fresher RSSI readings while the tool is in motion. All the
alarm logic here runs off RSSI vs. threshold + the app's status.

## Hardware

- Lonely Binary ESP32-S3 board
- [DIYables Passive Buzzer Module](https://diyables.io/products/passive-buzzer-module)
  (3-pin PCB module: `S`, `VCC`, `GND`) — no external driver transistor
  needed, it's designed to be driven directly from a GPIO's PWM signal.
  Wire `S` -> `BUZZER_PIN` (default: GPIO 6), `VCC` -> 3.3V or 5V, `GND` ->
  GND. (If you swap in a bare 2-lead piezo element or a higher-current
  buzzer instead of this module, drive it through an NPN transistor as a
  low-side switch rather than straight off the GPIO.)
- BlueCharm beacon with motion sensor, one per tool you want monitored

## Firmware setup

1. In Arduino IDE, install these libraries via Library Manager:
   - **NimBLE-Arduino** by h2zero — install the latest **2.x** release. Older
     1.x releases are built against an older ESP-IDF/Bluetooth-controller
     version and can crash on newer esp32 core releases (an
     `assert failed: block_locate_free tlsf_control_functions.h` during
     `btdm:` init is the signature of this mismatch) — 2.x is the version to
     use with current Boards Manager releases.
   - **ArduinoJson** by bblanchon — version 7.x.
2. Make sure your installed **esp32 board package** (Boards Manager) is on
   the 3.x line — this sketch uses the current pin-based `ledcAttach` /
   `ledcWriteTone` API for the buzzer. If you're stuck on core 2.x, swap
   those three lines in `setBuzzer()` for the old channel-based
   `ledcSetup`/`ledcAttachPin`/`ledcWriteTone(channel, freq)` API.
3. Set the board (Tools menu) to match the Lonely Binary N16R8 reference
   card:
   - Board: **ESP32S3 Dev Module**
   - USB CDC On Boot: **Enabled**
   - PSRAM: **OPI PSRAM**
   - Flash Size: **16MB (128Mb)**
   - Flash Mode: **QIO 80MHz**
   - Partition Scheme: **16M Flash (3MB APP/9.9MB FATFS)**
   - Upload Mode: **UART0 / Hardware CDC**
   - USB Mode: **Hardware CDC and JTAG**
4. Copy `shop-beacon-monitor/config.example.h` to
   `shop-beacon-monitor/config.h` and fill in:
   - Your shop WiFi SSID/password
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` — same values as
     `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `tool-tracker/.env`
   - `BUZZER_PIN`
5. Flash `shop-beacon-monitor.ino`.
6. Open the Serial Monitor at 115200 baud to watch WiFi connection, RSSI
   readings, and alarm state changes while you calibrate thresholds.

## App-side setup

1. Run [`sql/add_beacon_columns.sql`](../sql/add_beacon_columns.sql) once in
   your Supabase SQL editor — adds `beacon_mac`, `beacon_rssi_threshold`,
   `beacon_alarm_active`, and `beacon_last_seen` to the `tools` table.
2. In the app, open a Shop tool as an admin and use **Assign Beacon** to
   enter the beacon's MAC address and an RSSI alarm threshold. To find a
   beacon's MAC, flash [`../ble-scanner/ble-scanner.ino`](../ble-scanner/ble-scanner.ino)
   to the ESP32-S3 temporarily and watch the Serial Monitor with the beacon
   nearby — it flags lines that look like iBeacons (BlueCharm's default
   advertising format) so it's easy to pick out. This is more reliable than
   a phone scanner app: iOS hides real BLE MAC addresses from apps for
   privacy, so nRF Connect and similar only work for this on Android. Once
   you've noted the MAC, re-flash `shop-beacon-monitor.ino` as the board's
   real firmware.
3. Tools with an active door alarm show a "⚠ Near door" badge on the Tool
   Status list and detail page — the board writes that state back to
   Supabase whenever it changes.

## Behavior summary

- Every ~5s the board polls Supabase for all Shop tools with a beacon
  assigned: their checkout/condition status and alarm threshold.
- It continuously BLE-scans in the background and tracks the latest RSSI
  seen for each known beacon MAC.
- Every ~1s it re-evaluates: for each tool, alarm = **Available** AND the
  beacon was heard from in the last 15s with RSSI stronger than (i.e.
  numerically greater than) the threshold.
- The buzzer sounds continuously while *any* watched tool is in that alarm
  state, and stops once none are (beacon moves away from the door, or the
  tool gets checked out).
- Alarm state changes are written back to Supabase so the app reflects them.
