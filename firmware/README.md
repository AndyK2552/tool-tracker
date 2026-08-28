# Firmware

ESP32-S3 sketches for the Tool Tracker project (Lonely Binary ESP32-S3 N16R8 board). The previous BLE-beacon door-alarm system (Beacon Tower, beacon-range-test, ble-scanner) has been removed while the project moves to UHF RFID for tool tracking instead — see [../sql/add_tool_rfid_tags_table.sql](../sql/add_tool_rfid_tags_table.sql) and the app's RFID tag assignment page.

## Sketches

- **[buzzer-test](buzzer-test/buzzer-test.ino)** — standalone wiring test for a passive buzzer module. Beeps every 2 seconds to confirm wiring before using a buzzer in a larger sketch.
- **[i2s-speaker-test](i2s-speaker-test/i2s-speaker-test.ino)** — I2S amp/speaker board controlled in real time from the app's Speaker Test page (Admin Home → Speaker test). Plays WAV or MP3 files from a Supabase Storage bucket, downloaded on demand and cached on FFat; supports play/pause/seek/volume with the board reporting live status back. See the sketch's header comment for wiring, file format requirements, and setup steps.

Arduino IDE board settings for this board (Tools menu):
- Board: **ESP32S3 Dev Module**
- USB CDC On Boot: **Enabled**
- PSRAM: **OPI PSRAM**
- Flash Size: **16MB (128Mb)**
- Flash Mode: **QIO 80MHz**
- Upload Mode: **UART0 / Hardware CDC**
- USB Mode: **Hardware CDC and JTAG**
- Partition Scheme: depends on the sketch — see each sketch's own setup notes.
