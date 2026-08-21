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
practice than converting to meters. Unlike an earlier version of this
firmware, the RSSI thresholds aren't per-tool anymore — they're set **once,
for every tool**, from the app's **Beacon Settings** page (Home → Beacon
Settings, admin only), which writes to a single-row `beacon_settings` table
the board polls every ~5s. That means you can retune the alarm distance and
chirp behavior live from your phone while watching the Serial Monitor,
without reflashing.

Three sliders control it:
- **Warning Beep Distance** (0-100%) — where chirping starts.
- **Chirp Frequency** (0-1000ms) — the gap between chirps right at that
  starting point (each chirp itself is a fixed length, `BUZZER_PULSE_ON_MS`
  in the sketch, 100ms by default). The gap shrinks as the beacon gets
  closer, so it's the *rate* that speeds up, not the chirp length.
- **Threshold Distance** (0-100%) — where the gap hits zero and it becomes
  a continuous tone; this is also what's written back to Supabase as the
  "⚠ Near door" alarm state. Can't be set to trigger farther out than
  Warning Beep Distance — the app clamps Warning Beep Distance down to
  match if you try.

Both distance sliders map to RSSI via `rssi = -90 + pct * 0.6` — 0% is -90
dBm (loosest, triggers from farthest away), 100% is -30 dBm (strictest,
must be right up close). The firmware does the identical conversion in
`fetchBeaconSettings()`.

Raw BLE RSSI is noisy — readings can swing 10-15 dB standing still. The
firmware smooths each beacon's RSSI with an exponential moving average
(`RSSI_EMA_ALPHA`, 0.3 by default) before using it for anything, so the
beep pace tracks the real distance trend rather than sample-to-sample
jitter.

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
- No extra hardware for the LED indicator — it uses the board's built-in
  WS2812 RGB LED on GPIO 48, blinking blue in lockstep with the buzzer.

## Firmware setup

1. In Arduino IDE, install these libraries via Library Manager:
   - **NimBLE-Arduino** by h2zero — install the latest **2.x** release. Older
     1.x releases are built against an older ESP-IDF/Bluetooth-controller
     version and can crash on newer esp32 core releases (an
     `assert failed: block_locate_free tlsf_control_functions.h` during
     `btdm:` init is the signature of this mismatch) — 2.x is the version to
     use with current Boards Manager releases.
   - **ArduinoJson** by bblanchon — version 7.x.
   - **FastLED** by Daniel Garcia — drives the board's built-in RGB LED.
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
   - `SUPABASE_URL` — same value as `VITE_SUPABASE_URL` in `tool-tracker/.env`
   - `SUPABASE_SERVICE_ROLE_KEY` — **not** the anon key. The `tools`
     table's RLS policies only allow `authenticated` access, so the board
     needs the service_role key (Supabase → Project Settings → API Keys →
     "service_role") to read/write it. This key bypasses RLS entirely —
     treat it like a root password, never put it anywhere web-facing.
   - `BUZZER_PIN`
5. Flash `shop-beacon-monitor.ino`.
6. Open the Serial Monitor at 115200 baud to watch WiFi connection, RSSI
   readings, and alarm state changes while you calibrate thresholds.

## App-side setup

1. Run [`sql/add_beacon_columns.sql`](../sql/add_beacon_columns.sql) and
   [`sql/add_beacon_settings_table.sql`](../sql/add_beacon_settings_table.sql)
   once each in your Supabase SQL editor. The first adds `beacon_mac`,
   `beacon_alarm_active`, and `beacon_last_seen` to the `tools` table; the
   second adds the single-row `beacon_settings` table the board polls for
   the warning/threshold/chirp/WiFi values (admin-only to view or edit, via
   RLS — it holds a WiFi password). If you set up `beacon_settings` before
   WiFi credentials were added to it, also run
   [`sql/add_wifi_credentials_to_beacon_settings.sql`](../sql/add_wifi_credentials_to_beacon_settings.sql).
2. In the app, open a Shop tool as an admin and use **Assign Beacon** to
   enter the beacon's MAC address (no per-tool threshold anymore — that's
   set once for all tools on the Beacon Settings page). To find a beacon's
   MAC, flash [`../ble-scanner/ble-scanner.ino`](../ble-scanner/ble-scanner.ino)
   to the ESP32-S3 temporarily and watch the Serial Monitor with the beacon
   nearby — it flags lines that look like iBeacons (BlueCharm's default
   advertising format) so it's easy to pick out. This is more reliable than
   a phone scanner app: iOS hides real BLE MAC addresses from apps for
   privacy, so nRF Connect and similar only work for this on Android. Once
   you've noted the MAC, re-flash `shop-beacon-monitor.ino` as the board's
   real firmware.
3. Tune the three sliders on the app's **Beacon Settings** page (Home →
   Beacon Settings) while watching the Serial Monitor — changes take effect
   on the board's next poll, no reflashing needed.
4. The same page's **WiFi Network** fields let you change the board's
   network (e.g. switching providers) without reflashing. Save while the
   board is still online on its current network and it'll switch to the
   new one automatically the next time it needs to reconnect — it caches
   the credentials to flash the moment it fetches them, so this survives a
   reboot/power cycle too. If the board is already offline with no path
   back to the old network, this alone can't reach it — use **Update WiFi
   via Bluetooth** instead (below it on the same page).
5. Tools with an active door alarm show a "⚠ Near door" badge on the Tool
   Status list and detail page — the board writes that state back to
   Supabase whenever it changes.

## Updating WiFi over Bluetooth (board is offline)

The WiFi Network fields only reach the board while it's still online on its
*current* network. If it's already offline — old router gone, provider
swapped, etc. — there's no network path back to it at all. **Update WiFi via
Bluetooth**, further down the same Beacon Settings page, solves that: it
talks to the board directly over BLE, no WiFi/internet required on either
side.

The board runs both a BLE **central** role (scanning for tool beacons) and a
BLE **peripheral** role (a small GATT server for this) at the same time —
NimBLE-Arduino 2.x supports both concurrently on one radio. On boot it
advertises as `ShopBeaconMonitor` with a provisioning service; the browser
connects to that service and writes `{pin, ssid, password}` as JSON to its
credentials characteristic, then listens for a status notification back
(`received -- connecting...`, then `connected: <ip>` or `failed: ...`). On
success the board saves the credentials to flash the same way the Supabase
path does, so they survive a reboot too.

This uses the **Web Bluetooth API**, which only works in Chromium browsers
(Chrome/Edge) on desktop or Android — **not Safari or iOS**, which don't
support it at all. If a phone needs to do this and it's an iPhone, use a
laptop instead, or borrow an Android device.

The PIN in the request is a shared secret between the board
(`BLE_PROVISIONING_PIN` in `config.h`) and the app
(`PROVISIONING_PIN` in `src/BleWifiProvision.jsx`) — anyone within BLE range
who knows it (or brute-forces it; it's sent in plaintext, there's no
pairing/bonding here) can change the board's network, so treat it like a
low-stakes PIN, not a real credential, and change the placeholder default
before relying on this.

## Behavior summary

- All WiFi/Supabase networking runs on its own FreeRTOS task, pinned to the
  opposite CPU core from the main buzzer/BLE loop. HTTPS requests are
  blocking and can take a second or more; running them on a separate task
  means they never freeze the buzzer/LED cadence the way they would if
  inlined into `loop()`. A mutex guards the handful of things both tasks
  touch (the tools list and the warning/threshold/beep settings).
- Every ~5s that task polls Supabase for two things: all Shop tools with a
  beacon assigned (their checkout/condition status), and the single global
  `beacon_settings` row (warning distance, threshold distance, chirp
  length). It also sends any pending "⚠ Near door" state changes back to
  Supabase.
- It continuously BLE-scans in the background and tracks each known
  beacon's RSSI, smoothed with an exponential moving average to filter out
  normal BLE signal noise.
- Every ~1s it re-evaluates each tool. The app-facing "alarm" state (what
  gets written to Supabase and shown as the "⚠ Near door" badge) is
  **Available** AND the beacon was heard from in the last 15s with RSSI
  stronger than (i.e. numerically greater than) the global threshold.
- The buzzer itself is more gradual: for each **Available** tool, it maps
  RSSI to a pulse pattern — silent at/below the warning distance, then
  pulsing at a fixed chirp length (`BUZZER_PULSE_ON_MS`) with a gap between
  chirps (starting at the configured Chirp Frequency) that shrinks as the
  beacon gets closer, merging into a continuous tone once the gap hits
  zero at the threshold distance. It's the repeat rate that conveys
  proximity, not the chirp length — the board follows whichever watched
  tool is currently most urgent (closest to continuous), and goes silent
  once none are Available and in range.
- The BLE scan restarts every ~20s in the background as a safety net
  against rare stalls in long-running continuous scans.
