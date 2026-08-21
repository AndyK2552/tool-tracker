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
- **Beep Frequency** (1-100ms) — length of the shortest chirp, right at that
  starting point.
- **Threshold Distance** (0-100%) — where it becomes a continuous tone; this
  is also what's written back to Supabase as the "⚠ Near door" alarm state.
  Can't be set to trigger farther out than Warning Beep Distance — the app
  clamps Warning Beep Distance down to match if you try.

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
   the warning/threshold/chirp values (admin-only to edit, via RLS).
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
4. Tools with an active door alarm show a "⚠ Near door" badge on the Tool
   Status list and detail page — the board writes that state back to
   Supabase whenever it changes.

## Behavior summary

- Every ~5s the board polls Supabase for two things: all Shop tools with a
  beacon assigned (their checkout/condition status), and the single global
  `beacon_settings` row (warning distance, threshold distance, chirp
  length).
- It continuously BLE-scans in the background and tracks the latest RSSI
  seen for each known beacon MAC.
- Every ~1s it re-evaluates each tool. The app-facing "alarm" state (what
  gets written to Supabase and shown as the "⚠ Near door" badge) is
  **Available** AND the beacon was heard from in the last 15s with RSSI
  stronger than (i.e. numerically greater than) the global threshold.
- The buzzer itself is more gradual: for each **Available** tool, it maps
  RSSI to a chirp pattern — silent at/below the warning distance, starting
  with the configured shortest chirp once past that and getting
  longer/more frequent as the beacon gets closer, merging into a
  continuous tone at the threshold distance. The board follows whichever
  watched tool is currently most urgent, and goes silent once none are
  Available and in range.
- Alarm state changes (the threshold-crossing, not the chirp ramp) are
  written back to Supabase so the app reflects them.
