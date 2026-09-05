# RFID Door Monitor (ESP32)

Mount this board on the shop's local network, alongside an **Impinj R700**
reader with antennas covering the exit. It's the UHF RFID counterpart to
`../shop-beacon-monitor/`: same job (sound a buzzer when an **Available**
Shop tool is detected at the door), same "brain + mouth" role, but the R700
does the RF sensing instead of this board scanning BLE itself.

See the top-of-file comment in `rfid-door-monitor.ino` for the full design
rationale (why this sidesteps the R700's GPO outputs, why the alarm is
binary rather than RSSI-ramped, why it only ever reads from Supabase and
never writes back).

## One-time reader setup

Done once via the R700's own web UI (`https://<reader-ip>/`, default
credentials `root` / `impinj` — you'll be prompted to change the password
on first login on newer firmware). None of this is automated by the
firmware.

1. **Trust the reader's certificate** on any machine that needs to browse
   to it directly (its web UI and API are self-signed HTTPS) — export the
   cert and install it to Trusted Root Certification Authorities if your
   browser/tooling won't let you click through the warning.
2. **Region**: Home → Change Region → pick a real region (defaults to
   "None - RFID Disabled", which disables RF entirely) → Reboot.
3. **Interface**: Home → Change Interface → **Impinj IoT Device
   Interface** (not LLRP — the webhook mechanism this board depends on is
   part of the IoT interface).
4. **Antenna Hub**: leave **Disabled** unless you have the separate
   Impinj Antenna Hub accessory. It's a distinct product (an 8-port
   expansion box), not just a label for the reader's own onboard ports —
   enabling it without the accessory makes directly-wired antennas show as
   "Disconnected".
5. **Inventory preset** (Profile Presets → Inventory → New): an entry for
   each antenna port your antennas are actually wired to, avoid
   `inventorySession` 0 (Impinj's own guidance), and tune `transmitPowerCdbm`
   down from the default during placement testing — at full power the read
   range is much wider than just the doorway. **Must be started/running**
   for any of this to work; check whether the reader can auto-start a
   preset on boot so a power cycle at the shop doesn't silently kill
   detection until someone manually restarts it from the web UI.
6. **Webhook** (Event Reporting → Webhook, or `PUT /api/v1/webhooks/event`):
   - `active: true`
   - `serverConfiguration.url`: `http://<this-board's-IP>:8080/tag-report`
     (host/port/path match `WEBHOOK_LISTEN_PORT`/`WEBHOOK_PATH` in
     `config.h` — defaults shown here)
   - `eventBatchLingerMilliseconds`: turn this down from the 1000ms
     default (e.g. 100-250) — otherwise a read can sit batched for up to a
     full second before this board even hears about it.

   Note the reader sends **batches**: each webhook POST body is a JSON
   *array* of event objects, not one object per POST — already handled by
   `handleTagReport()` in the sketch.

## Board setup

1. Install libraries (Arduino Library Manager): **ArduinoJson** by
   bblanchon (7.x). `WebServer`/`WiFi`/`WiFiClientSecure`/`HTTPClient` ship
   with the Arduino-ESP32 core already.
2. Copy `config.example.h` to `config.h` and fill in WiFi + Supabase
   details (`config.h` is gitignored).
3. Wire the buzzer the same way as `shop-beacon-monitor.ino` (DIYables
   Passive Buzzer Module: `S` → `BUZZER_PIN`, `VCC` → 3.3V/5V, `GND` →
   GND).
4. Flash the sketch, open the Serial Monitor at 115200 baud. It prints the
   exact webhook URL to configure on the reader once WiFi connects.
5. In the Tool Tracker app, assign RFID tags to Shop tools (Assign RFID
   Tags — either the dedicated scan-first page, or inline on a tool's
   detail page).

## Verifying the EPC format

The reader's webhook and data-stream endpoints report EPCs **base64url
encoded**, not the hex format shown in the reader's own Tag Streaming web
page — confirmed by capturing a live event, not documented explicitly by
Impinj. `base64UrlToHexUpper()` in the sketch converts incoming reads to
the same uppercase hex format `tool_rfid_tags.tag_id` is stored in. If tag
lookups mysteriously never match despite the reader clearly reading a
known tag (check the reader's own Tag Streaming page to confirm), this
conversion is the first thing to double-check with a Serial print of the
raw vs. converted value.

## Behavior summary

- `networkTask()` (its own FreeRTOS task, pinned to the opposite core from
  the main loop) polls Supabase every `TAG_FETCH_INTERVAL_MS` (default 5s)
  for every RFID tag assigned to a Shop tool, via a join through
  `tool_rfid_tags` → `tools`. This never writes anything back to Supabase.
- The webhook server runs directly in `loop()` alongside the buzzer logic
  — unlike the Supabase calls, receiving a webhook never blocks on the
  network (the reader initiates the connection to us), so it doesn't need
  its own task.
- Every `ALARM_EVAL_INTERVAL_MS` (default 1s), the board checks whether
  any **Available** tool's tag was read within the last `TAG_STALE_MS`
  (default 15s). Any match → buzzer on (continuous) and the onboard LED
  turns red; none → silent.
- No RSSI-based ramping like the Beacon Tower — a two-antenna portal pair
  is built for a clean "did a tagged item cross the gate" read, so the
  alarm is a simple binary on/off.
