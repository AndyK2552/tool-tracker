// I2S speaker test -- Supabase-controlled real-time play/pause.
//
// Polls a single-row `speaker_test` table in Supabase (see
// ../../sql/add_speaker_test_table.sql) for play/pause commands sent from
// the app's Speaker Test page, plays WAV files from the `rfid_sounds`
// Storage bucket (downloaded once, then cached on FFat/FAT storage), and
// reports playback status back so the app reflects what the board is
// actually doing, not just the last command sent. Once at boot, it also
// prunes any locally cached file that's no longer in the bucket -- files
// tested and later deleted/renamed in Storage don't just sit around
// forever eating flash space.
//
// Networking (polling Supabase, downloading files) runs on its own
// FreeRTOS task pinned to the opposite core from the main loop(), same
// pattern the old shop-beacon-monitor sketch used for its buzzer -- a slow
// HTTPS request must never stall audio playback. loop() only ever does
// bounded, non-blocking work: consuming a pending command and writing one
// buffer's worth of PCM samples to I2S. The two tasks share a small amount
// of state through stateMutex.
//
// File format: 16-bit PCM WAV only (mono or stereo). Export from Audacity
// as "WAV (Microsoft) signed 16-bit PCM" -- NOT "WAV (Microsoft) 32-bit
// float" and not the default "extensible" format some tools use, since
// this sketch's parser only understands plain PCM (audioFormat == 1). Mono
// gets duplicated to both L/R channels since most I2S amp breakouts (e.g.
// MAX98357A) expect a stereo frame either way.
//
// Wiring (generic I2S amp module -- MAX98357A and similar 3-wire boards):
//   BCLK -> I2S_BCLK_PIN, LRC/WS -> I2S_LRC_PIN, DIN/DOUT -> I2S_DOUT_PIN,
//   VIN -> 5V (or 3.3V if that's what your module supports), GND -> GND.
//
// Libraries required (Arduino Library Manager): ArduinoJson by bblanchon,
// version 7.x.
//
// Setup:
//   1. Run sql/add_speaker_test_table.sql once in the Supabase SQL editor.
//   2. Create a Storage bucket named "rfid_sounds" and upload your WAV
//      files there (public or private -- the board authenticates with its
//      service_role key either way, so it doesn't need to be public).
//   3. Copy config.example.h to config.h and fill in WiFi + Supabase
//      details (SUPABASE_SERVICE_ROLE_KEY, not the anon key -- same
//      reasoning as shop-beacon-monitor used: RLS only allows admin
//      access, so the board needs the key that bypasses it).
//   4. Set Partition Scheme to a FATFS-labeled scheme with plenty of room --
//      e.g. "16M Flash (2MB APP/12.5MB FATFS)" on this board's 16MB flash.
//      WAV files add up fast (roughly 32KB/sec for 16-bit mono 16kHz), so
//      the small "spiffs"-labeled schemes (1.5-3MB) fill up after just one
//      or two files -- that's the "No more free space" error from
//      esp_littlefs/FFat if you see it. A SPIFFS/LittleFS-labeled scheme
//      instead of a FATFS one will fail to mount entirely, since this
//      sketch uses the FFat library.
//   5. Flash this sketch, open Serial Monitor at 115200 baud, and use the
//      app's Speaker Test page (Admin Home -> Speaker test).
//
// Targets Arduino-ESP32 core 3.x, using the legacy driver/i2s.h API (still
// present in core 3.x, just deprecated) since it's the most widely
// documented I2S API for this kind of module.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FFat.h>
#include <driver/i2s.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

#include "config.h"

#define I2S_BCLK_PIN 5
#define I2S_LRC_PIN  6
#define I2S_DOUT_PIN 4

#define I2S_PORT I2S_NUM_0

#define SOUND_BUCKET "rfid_sounds"

#define COMMAND_POLL_INTERVAL_MS 1000UL

enum PlaybackStatus { STATUS_IDLE, STATUS_PLAYING, STATUS_PAUSED };

// ---------- Cross-task shared state ----------
//
// Kept deliberately small: the network task only needs to know (a) what
// command to hand off to loop(), and (b) loop()'s current status, so it can
// report both to Supabase. Everything else (which file is open, how many
// bytes are left, etc.) is loop()-task-only and needs no locking.

static SemaphoreHandle_t stateMutex;

static bool pendingPlay = false;
static char pendingPlayPath[80] = "";
static bool pendingPause = false;
static bool pendingSeek = false;
static float pendingSeekSeconds = 0;

static PlaybackStatus sharedStatus = STATUS_IDLE;

// This board doesn't break out the amp's hardware gain pin, so volume is
// controlled by scaling samples in software instead -- set from the app's
// Speaker Test slider (0-100), applied every poll cycle regardless of
// command_seq (see fetchCommand()). 1.0 = full volume from the source file.
static float sharedVolume = 0.2f;

// Playback position/duration, in seconds -- written by loop() as it plays,
// read by networkTask to report back to Supabase every poll cycle (same as
// volume) so the app's scrubber can show progress.
static float sharedPositionSeconds = 0;
static float sharedDurationSeconds = 0;

static void requestPlay(const String& path) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  pendingPlay = true;
  strncpy(pendingPlayPath, path.c_str(), sizeof(pendingPlayPath) - 1);
  pendingPlayPath[sizeof(pendingPlayPath) - 1] = '\0';
  xSemaphoreGive(stateMutex);
}

static void requestPause() {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  pendingPause = true;
  xSemaphoreGive(stateMutex);
}

static void requestSeek(float seconds) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  pendingSeek = true;
  pendingSeekSeconds = seconds;
  xSemaphoreGive(stateMutex);
}

static void setSharedStatus(PlaybackStatus s) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  sharedStatus = s;
  xSemaphoreGive(stateMutex);
}

static PlaybackStatus getSharedStatus() {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  PlaybackStatus s = sharedStatus;
  xSemaphoreGive(stateMutex);
  return s;
}

static void setSharedVolume(float v) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  sharedVolume = v;
  xSemaphoreGive(stateMutex);
}

static void setSharedPosition(float positionSeconds, float durationSeconds) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  sharedPositionSeconds = positionSeconds;
  sharedDurationSeconds = durationSeconds;
  xSemaphoreGive(stateMutex);
}

static void getSharedPosition(float* positionSeconds, float* durationSeconds) {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  *positionSeconds = sharedPositionSeconds;
  *durationSeconds = sharedDurationSeconds;
  xSemaphoreGive(stateMutex);
}

static float getSharedVolume() {
  xSemaphoreTake(stateMutex, portMAX_DELAY);
  float v = sharedVolume;
  xSemaphoreGive(stateMutex);
  return v;
}

// ---------- WiFi ----------

// One-time diagnostic: lists every 2.4GHz network the radio can actually
// see, with signal strength. ESP32 has no 5GHz radio at all, so if the
// target SSID is 5GHz-only (or just out of range) it will never show up
// here -- that alone would explain a connection that never succeeds no
// matter how correct the credentials are.
static void scanAndLogNetworks() {
  WiFi.mode(WIFI_STA);
  Serial.println("Scanning for WiFi networks...");
  int n = WiFi.scanNetworks();
  if (n <= 0) {
    Serial.println("  No networks found at all -- check antenna/power, or the board may be in a shielded spot.");
  } else {
    for (int i = 0; i < n; i++) {
      bool isTarget = WiFi.SSID(i) == WIFI_SSID;
      Serial.printf("  %s (RSSI %d dBm, channel %d)%s\n",
        WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
        isTarget ? "  <-- target network" : "");
    }
  }
  WiFi.scanDelete();
}

static void connectWiFi() {
  // Put the radio in station mode before touching it further -- calling
  // disconnect() first, before the driver has ever been put into STA mode
  // (e.g. on the very first boot), is the wrong order and can itself cause
  // a connection to fail to even start.
  WiFi.mode(WIFI_STA);
  // Then clear any stale state before (re)trying -- retrying WiFi.begin()
  // while the driver hasn't fully settled from a previous attempt produces
  // "wifi:sta is connecting, cannot set config" and makes the retry itself
  // unreliable.
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi...");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected: " + WiFi.localIP().toString());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    // Status codes worth knowing: 1 = WL_NO_SSID_AVAIL (network not found --
    // out of range or 5GHz-only), 4 = WL_CONNECT_FAILED (usually a wrong
    // password), 6 = WL_DISCONNECTED (generic/timed out).
    Serial.printf(" failed (status=%d), will retry\n", WiFi.status());
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

static bool fetchCommand(long* outSeq, String* outAction, String* outSoundPath, int* outVolumePct, float* outSeekSeconds) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/speaker_test?id=eq.true&select=command_seq,action,sound_path,volume,seek_seconds";
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
    JsonDocument doc;
    if (!deserializeJson(doc, body)) {
      JsonArray arr = doc.as<JsonArray>();
      if (arr.size() > 0) {
        JsonObject row = arr[0];
        *outSeq = row["command_seq"] | -1L;
        *outAction = String((const char*)(row["action"] | ""));
        *outSoundPath = String((const char*)(row["sound_path"] | ""));
        *outVolumePct = row["volume"] | 20;
        *outSeekSeconds = row["seek_seconds"] | -1.0f; // -1 = no seek requested (column is nullable)
        ok = true;
      }
    }
  } else {
    Serial.printf("Supabase GET failed: %d\n", code);
  }
  http.end();
  return ok;
}

static void patchStatus(const char* status, const char* statusDetail, float positionSeconds, float durationSeconds) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/speaker_test?id=eq.true";
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument body;
  body["status"] = status;
  body["status_detail"] = statusDetail;
  body["position_seconds"] = positionSeconds;
  body["duration_seconds"] = durationSeconds;
  char iso[25];
  if (nowIso8601(iso, sizeof(iso))) body["board_last_seen"] = iso;

  String payload;
  serializeJson(body, payload);

  int code = http.sendRequest("PATCH", payload);
  if (code < 200 || code >= 300) {
    Serial.printf("Supabase status PATCH failed: %d\n", code);
  }
  http.end();
}

// Authenticates with the service_role key against Storage's object
// endpoint, which works whether the bucket is public or private -- unlike
// the earlier version of this sketch, the bucket doesn't need to be public.
//
// Re-downloads whenever the remote file's size differs from what's cached,
// not just when nothing's cached at all -- otherwise re-uploading a fixed
// version of a sound under the same filename (the normal way to iterate
// while testing) would silently keep playing the old, stale cached copy
// forever, since a same-named file already existing looked like "already
// have it, nothing to do." Size isn't a perfect fingerprint (a same-size
// replacement wouldn't be caught) but it's cheap -- no extra request beyond
// the GET we're already making -- and covers the actual case that bit us.
static bool downloadSoundIfNeeded(const String& soundPath) {
  String localPath = "/" + soundPath;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/storage/v1/object/" + SOUND_BUCKET + "/" + soundPath;
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("Download check failed for %s: HTTP %d\n", soundPath.c_str(), code);
    http.end();
    // A transient network hiccup shouldn't make a previously-working file
    // stop playing -- fall back to whatever's cached, if anything.
    return FFat.exists(localPath);
  }

  int remoteSize = http.getSize();
  if (FFat.exists(localPath)) {
    File existing = FFat.open(localPath, "r");
    int localSize = existing.size();
    existing.close();
    if (remoteSize > 0 && remoteSize == localSize) {
      Serial.printf("%s unchanged (%d bytes), using cached copy.\n", localPath.c_str(), localSize);
      http.end();
      return true;
    }
    Serial.printf("%s changed (cached %d bytes, remote %d bytes) -- re-downloading.\n", localPath.c_str(), localSize, remoteSize);
  }

  File f = FFat.open(localPath, "w");
  if (!f) {
    Serial.printf("Could not open %s for writing\n", localPath.c_str());
    http.end();
    return false;
  }

  int written = http.writeToStream(&f);
  f.close();
  http.end();

  if (written < 0) {
    uint64_t freeBytes = FFat.totalBytes() - FFat.usedBytes();
    Serial.printf("Download to %s failed mid-stream (error %d) -- removing partial file\n", localPath.c_str(), written);
    Serial.printf("FFat free space: %llu bytes (this file needed %d)\n", freeBytes, remoteSize);
    FFat.remove(localPath);
    return false;
  }

  Serial.printf("Downloaded %s -> %s (%d bytes)\n", soundPath.c_str(), localPath.c_str(), written);
  return true;
}

// Lists everything currently in the rfid_sounds bucket (Storage's list
// endpoint, POST -- unlike the plain GET used to fetch a single object),
// then deletes any locally cached file that isn't in that list. Run once
// at boot: every file ever tested otherwise stays cached forever, since
// downloadSoundIfNeeded() only ever adds/replaces files, never removes
// ones that got deleted or renamed in Storage -- which is exactly what
// silently ate the free space needed for a later, larger download.
static void pruneStaleCachedSounds() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/storage/v1/object/list/" + SOUND_BUCKET;
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_ROLE_KEY);
  http.addHeader("Content-Type", "application/json");

  JsonDocument reqBody;
  reqBody["limit"] = 1000;
  reqBody["prefix"] = "";
  String reqPayload;
  serializeJson(reqBody, reqPayload);

  int code = http.POST(reqPayload);
  if (code != HTTP_CODE_OK) {
    Serial.printf("Could not list %s bucket for pruning: HTTP %d\n", SOUND_BUCKET, code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("Could not parse bucket listing for pruning.");
    return;
  }
  JsonArray remoteFiles = doc.as<JsonArray>();

  File root = FFat.open("/");
  if (!root || !root.isDirectory()) {
    Serial.println("Could not open FFat root for pruning.");
    return;
  }

  int prunedCount = 0;
  File entry = root.openNextFile();
  while (entry) {
    String name = String(entry.name());
    // File::name() can come back with or without a leading '/' depending on
    // core version -- normalize before comparing against bucket entries,
    // which are always bare filenames.
    if (name.startsWith("/")) name = name.substring(1);
    bool isDir = entry.isDirectory();
    entry.close(); // must close before FFat.remove() -- can't remove an open file

    if (!isDir) {
      bool foundRemotely = false;
      for (JsonObject f : remoteFiles) {
        if (name == (const char*)(f["name"] | "")) {
          foundRemotely = true;
          break;
        }
      }
      if (!foundRemotely) {
        Serial.printf("Pruning stale cached file: /%s (not in %s bucket)\n", name.c_str(), SOUND_BUCKET);
        FFat.remove("/" + name);
        prunedCount++;
      }
    }

    entry = root.openNextFile();
  }
  root.close();

  Serial.printf("Pruning done: removed %d stale file(s). FFat: %llu / %llu bytes used\n",
                prunedCount, FFat.usedBytes(), FFat.totalBytes());
}

// ---------- I2S ----------

static void setupI2S(uint32_t sampleRate) {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = sampleRate,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };
  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);

  i2s_pin_config_t pin_config = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = I2S_BCLK_PIN,
    .ws_io_num = I2S_LRC_PIN,
    .data_out_num = I2S_DOUT_PIN,
    .data_in_num = I2S_PIN_NO_CHANGE
  };
  i2s_set_pin(I2S_PORT, &pin_config);
}

// Walks RIFF sub-chunks looking for "fmt " and "data" -- doesn't assume
// "data" immediately follows "fmt " since some WAV writers insert extra
// chunks (LIST, etc.) between them. Leaves the file positioned at the
// start of the PCM samples on success.
static bool parseWavHeader(File& file, uint32_t* sampleRate, uint16_t* bitsPerSample,
                            uint16_t* numChannels, uint32_t* dataSize) {
  char riff[4], wave[4];
  uint32_t riffSize;
  file.read((uint8_t*)riff, 4);
  file.read((uint8_t*)&riffSize, 4);
  file.read((uint8_t*)wave, 4);
  if (memcmp(riff, "RIFF", 4) != 0 || memcmp(wave, "WAVE", 4) != 0) {
    Serial.println("Not a RIFF/WAVE file.");
    return false;
  }

  bool foundFmt = false, foundData = false;
  uint16_t audioFormat = 0;

  while (file.available() >= 8 && !(foundFmt && foundData)) {
    char chunkId[4];
    uint32_t chunkSize;
    file.read((uint8_t*)chunkId, 4);
    file.read((uint8_t*)&chunkSize, 4);

    if (memcmp(chunkId, "fmt ", 4) == 0) {
      file.read((uint8_t*)&audioFormat, 2);
      file.read((uint8_t*)numChannels, 2);
      file.read((uint8_t*)sampleRate, 4);
      file.seek(file.position() + 6); // skip byteRate(4) + blockAlign(2)
      file.read((uint8_t*)bitsPerSample, 2);
      uint32_t consumed = 16;
      if (chunkSize > consumed) file.seek(file.position() + (chunkSize - consumed));
      foundFmt = true;
    } else if (memcmp(chunkId, "data", 4) == 0) {
      *dataSize = chunkSize;
      foundData = true;
      break; // file is now positioned at the first PCM sample
    } else {
      file.seek(file.position() + chunkSize); // skip chunk we don't care about
    }
  }

  if (!foundFmt || !foundData) {
    Serial.println("WAV file missing fmt or data chunk.");
    return false;
  }
  if (audioFormat != 1) {
    Serial.println("Only uncompressed PCM WAV is supported (re-export without 'extensible' format).");
    return false;
  }
  if (*bitsPerSample != 16) {
    Serial.println("Only 16-bit PCM WAV is supported.");
    return false;
  }
  return true;
}

// ---------- Playback (loop()-task only -- no locking needed here) ----------

struct {
  File file;
  bool open = false;
  bool paused = false;
  uint16_t numChannels = 0;
  uint32_t sampleRate = 0;
  uint32_t bytesRemaining = 0;
  uint32_t totalDataSize = 0;   // dataSize at the start of the file, for position/duration math
  uint32_t dataStartOffset = 0; // absolute file position where PCM samples begin, for seeking
} playback;

static char currentSoundPath[80] = "";

static const size_t BUF_FRAMES = 512; // one "frame" = one sample per channel
static int16_t srcBuf[BUF_FRAMES * 2];
static int16_t stereoBuf[BUF_FRAMES * 2];

static void stopPlayback() {
  if (playback.open) {
    playback.file.close();
    i2s_driver_uninstall(I2S_PORT);
  }
  playback.open = false;
  playback.paused = false;
  currentSoundPath[0] = '\0';
  setSharedStatus(STATUS_IDLE);
  setSharedPosition(0, 0);
}

static void startPlayback(const char* soundPath) {
  stopPlayback();

  String localPath = "/" + String(soundPath);
  File f = FFat.open(localPath, "r");
  if (!f) {
    Serial.printf("Could not open %s\n", localPath.c_str());
    return;
  }

  uint32_t sampleRate = 0, dataSize = 0;
  uint16_t bitsPerSample = 0, numChannels = 0;
  if (!parseWavHeader(f, &sampleRate, &bitsPerSample, &numChannels, &dataSize)) {
    f.close();
    return;
  }

  setupI2S(sampleRate);

  playback.file = f;
  playback.open = true;
  playback.paused = false;
  playback.numChannels = numChannels;
  playback.sampleRate = sampleRate;
  playback.bytesRemaining = dataSize;
  playback.totalDataSize = dataSize;
  playback.dataStartOffset = f.position(); // parseWavHeader left the file positioned right at the first PCM sample
  strncpy(currentSoundPath, soundPath, sizeof(currentSoundPath) - 1);
  currentSoundPath[sizeof(currentSoundPath) - 1] = '\0';

  size_t bytesPerFrame = numChannels * sizeof(int16_t);
  float durationSeconds = (float)dataSize / (sampleRate * bytesPerFrame);
  setSharedPosition(0, durationSeconds);
  setSharedStatus(STATUS_PLAYING);
  Serial.printf("Playing %s: %lu Hz, %u-bit, %u channel(s), %.1fs\n", soundPath, sampleRate, bitsPerSample, numChannels, durationSeconds);
}

// Repositions within the currently open file -- e.g. from the app's
// scrubber. Byte offset is rounded down to a whole frame so playback
// doesn't end up reading a partial (misaligned) sample.
static void seekPlayback(float seconds) {
  if (!playback.open) return;

  size_t bytesPerFrame = playback.numChannels * sizeof(int16_t);
  uint32_t targetOffset = (uint32_t)(seconds * playback.sampleRate) * bytesPerFrame;
  if (targetOffset > playback.totalDataSize) targetOffset = playback.totalDataSize;

  playback.file.seek(playback.dataStartOffset + targetOffset);
  playback.bytesRemaining = playback.totalDataSize - targetOffset;

  float durationSeconds = (float)playback.totalDataSize / (playback.sampleRate * bytesPerFrame);
  setSharedPosition(seconds, durationSeconds);
}

static void pausePlayback() {
  if (playback.open && !playback.paused) {
    playback.paused = true;
    setSharedStatus(STATUS_PAUSED);
  }
}

static void resumePlayback() {
  if (playback.open && playback.paused) {
    playback.paused = false;
    setSharedStatus(STATUS_PLAYING);
  }
}

// Consumes whatever the network task last requested. Called every loop()
// iteration; cheap when there's nothing pending.
static void consumePendingCommands() {
  bool doPlay, doPause, doSeek;
  char path[80];
  float seekSeconds = 0;

  xSemaphoreTake(stateMutex, portMAX_DELAY);
  doPlay = pendingPlay;
  doPause = pendingPause;
  doSeek = pendingSeek;
  if (doPlay) strncpy(path, pendingPlayPath, sizeof(path));
  if (doSeek) seekSeconds = pendingSeekSeconds;
  pendingPlay = false;
  pendingPause = false;
  pendingSeek = false;
  xSemaphoreGive(stateMutex);

  if (doPlay) {
    if (playback.open && playback.paused && strcmp(path, currentSoundPath) == 0) {
      resumePlayback(); // same file, currently paused -- resume instead of restarting
    } else {
      startPlayback(path);
    }
  }
  if (doPause) {
    pausePlayback();
  }
  if (doSeek) {
    seekPlayback(seekSeconds);
  }
}

// Writes one buffer's worth of samples, called every loop() iteration.
// i2s_write can briefly block waiting for DMA buffer space (bounded,
// milliseconds) but never touches the network, so a slow/stalled HTTPS
// request on the other task can never cause an audio glitch here.
static void pumpPlayback() {
  if (!playback.open || playback.paused) return;

  size_t bytesPerFrame = playback.numChannels * sizeof(int16_t);
  size_t framesAvailable = playback.bytesRemaining / bytesPerFrame;
  size_t framesToRead = framesAvailable < BUF_FRAMES ? framesAvailable : BUF_FRAMES;

  if (framesToRead == 0 || !playback.file.available()) {
    stopPlayback();
    Serial.println("Playback finished.");
    return;
  }

  size_t bytesRead = playback.file.read((uint8_t*)srcBuf, framesToRead * bytesPerFrame);
  size_t framesRead = bytesRead / bytesPerFrame;
  playback.bytesRemaining -= bytesRead;
  if (framesRead == 0) {
    stopPlayback();
    return;
  }

  float volume = getSharedVolume(); // one mutex take per buffer, not per sample
  for (size_t i = 0; i < framesRead; i++) {
    int16_t left, right;
    if (playback.numChannels == 1) {
      left = right = srcBuf[i];
    } else {
      left = srcBuf[i * 2];
      right = srcBuf[i * 2 + 1];
    }
    stereoBuf[i * 2] = (int16_t)(left * volume);
    stereoBuf[i * 2 + 1] = (int16_t)(right * volume);
  }

  size_t bytesWritten;
  i2s_write(I2S_PORT, stereoBuf, framesRead * 4, &bytesWritten, portMAX_DELAY);

  float positionSeconds = (float)(playback.totalDataSize - playback.bytesRemaining) / (playback.sampleRate * bytesPerFrame);
  float durationSeconds = (float)playback.totalDataSize / (playback.sampleRate * bytesPerFrame);
  setSharedPosition(positionSeconds, durationSeconds);
}

// ---------- Network task ----------

static void networkTask(void* param) {
  scanAndLogNetworks();
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) pruneStaleCachedSounds();

  // Don't act on whatever command was last sent before this boot -- e.g. if
  // the board loses power mid-playback and reboots, it shouldn't
  // automatically start playing again on its own. Read the current
  // command_seq once and treat it as already-handled, so only a genuinely
  // new command issued after this boot gets acted on. Volume is still
  // picked up from this initial read -- that's a setting, not an action.
  long lastSeenSeq = -1;
  {
    long seq = -1;
    String action, soundPath;
    int volumePct = 20;
    float seekSeconds = -1;
    if (fetchCommand(&seq, &action, &soundPath, &volumePct, &seekSeconds)) {
      lastSeenSeq = seq;
      setSharedVolume(volumePct / 100.0f);
      Serial.printf("Boot: ignoring pre-existing command #%ld (action=%s), waiting for a new one.\n", seq, action.c_str());
    }
  }

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    long seq = -1;
    String action, soundPath;
    int volumePct = 20;
    float seekSeconds = -1;
    float currentPos, currentDur;
    getSharedPosition(&currentPos, &currentDur);

    // If this cycle issues a new play/pause, we already know what status
    // that *will* result in -- report that directly rather than reading
    // getSharedStatus() again right away. loop() runs on the other core and
    // may not have processed the pending*() flag yet by the time we'd read
    // it here, which would report a stale status (e.g. still "playing"
    // right after issuing a pause) and cost a full extra ~1s poll cycle
    // before the app finds out what actually happened.
    bool haveOptimisticStatus = false;
    PlaybackStatus optimisticStatus = STATUS_IDLE;

    if (fetchCommand(&seq, &action, &soundPath, &volumePct, &seekSeconds)) {
      setSharedVolume(volumePct / 100.0f);

      if (seq >= 0 && seq != lastSeenSeq) {
        lastSeenSeq = seq;
        Serial.printf("New command #%ld: action=%s sound_path=%s\n", seq, action.c_str(), soundPath.c_str());

        if (action == "play" && soundPath.length() > 0) {
          patchStatus("downloading", "", currentPos, currentDur);
          if (downloadSoundIfNeeded(soundPath)) {
            requestPlay(soundPath);
            haveOptimisticStatus = true;
            optimisticStatus = STATUS_PLAYING;
          } else {
            patchStatus("error", "download failed", currentPos, currentDur);
          }
        } else if (action == "pause") {
          requestPause();
          haveOptimisticStatus = true;
          optimisticStatus = STATUS_PAUSED;
        } else if (action == "seek" && seekSeconds >= 0) {
          requestSeek(seekSeconds);
        }
      }
    }

    const char* statusStr;
    switch (haveOptimisticStatus ? optimisticStatus : getSharedStatus()) {
      case STATUS_PLAYING: statusStr = "playing"; break;
      case STATUS_PAUSED:  statusStr = "paused"; break;
      default:              statusStr = "idle"; break;
    }
    getSharedPosition(&currentPos, &currentDur); // re-read -- may have changed since the block above (a seek/play just landed)
    patchStatus(statusStr, "", currentPos, currentDur);

    vTaskDelay(pdMS_TO_TICKS(COMMAND_POLL_INTERVAL_MS));
  }
}

// ---------- Arduino entry points ----------

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("I2S speaker test (Supabase-controlled) starting.");

  stateMutex = xSemaphoreCreateMutex();

  if (!FFat.begin(true)) { // true = format if mount fails (first boot)
    Serial.println("FFat mount failed -- check Partition Scheme has a FATFS-labeled partition.");
    return;
  }
  Serial.printf("FFat: %llu / %llu bytes used\n", FFat.usedBytes(), FFat.totalBytes());

  xTaskCreatePinnedToCore(networkTask, "networkTask", 8192, nullptr, 1, nullptr, 0);
}

void loop() {
  consumePendingCommands();
  pumpPlayback();
}
