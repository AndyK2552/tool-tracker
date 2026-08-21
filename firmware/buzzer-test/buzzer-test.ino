// Buzzer wiring test -- NOT the shop monitor sketch.
//
// Confirms the passive buzzer is wired correctly before moving on to the
// full monitor firmware. Beeps a short tone every 2 seconds. No WiFi, BLE,
// or config.h needed for this one.
//
// Wiring (DIYables Passive Buzzer Module): S -> BUZZER_PIN, VCC -> 3.3V or
// 5V, GND -> GND. If BUZZER_PIN isn't broken out on your board, change it
// below to any other free general-purpose GPIO.
//
// Targets Arduino-ESP32 core 3.x (pin-based ledcAttach/ledcWriteTone API).

#define BUZZER_PIN 6
#define BUZZER_FREQUENCY_HZ 2500

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Buzzer test starting -- expect a beep every 2 seconds.");
}

void loop() {
  Serial.println("Beep!");
  ledcAttach(BUZZER_PIN, BUZZER_FREQUENCY_HZ, 8);
  ledcWriteTone(BUZZER_PIN, BUZZER_FREQUENCY_HZ);
  delay(300);
  ledcWriteTone(BUZZER_PIN, 0);
  ledcDetach(BUZZER_PIN);
  delay(1700);
}
