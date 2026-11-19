#pragma once
#include <math.h>
#if __has_include("fill.local.h")
#include "fill.local.h"
#else
#include "fill.example.h"
#endif

#ifdef TEST_CAMERA_SERIAL
// DevKit UART0 remains dedicated to its CP2102 USB interface. UART2 receives
// only: camera U0T/GPIO1 -> DevKit RX2/GPIO16, plus common GND. No reverse wire.
void cameraSerialSetup() {
  Serial2.setRxBufferSize(2048);
  pinMode(16, INPUT_PULLUP);
  Serial2.begin(115200, SERIAL_8N1, 16, -1);
  Serial.println("Camera debug relay ready: RX2/GPIO16 at 115200; receive-only, best-effort logs");
}

void cameraSerialLoop() {
  static char line[192];
  static size_t length = 0;
  static bool truncated = false;
  unsigned int budget = 256;
  while (budget-- && Serial2.available()) {
    int ch = Serial2.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      line[length] = '\0';
      if (length || truncated) Serial.printf("[CAM] %s%s\n", line, truncated ? " [truncated]" : "");
      length = 0;
      truncated = false;
    } else if (ch >= 32 && ch <= 126) {
      if (length < sizeof(line) - 1) line[length++] = static_cast<char>(ch);
      else truncated = true;
    }
  }
}
#endif

static_assert(FILL_CATEGORY_INDEX >= 0 && FILL_CATEGORY_INDEX < 3, "Select a valid compartment.");
#if FILL_WIRING_CONFIRMED
// Ordinary output-capable pins on the classic DevKit; exclude flash, boot and UART0.
static_assert(FILL_TRIG_PIN == 13 || FILL_TRIG_PIN == 14 ||
              (FILL_TRIG_PIN >= 18 && FILL_TRIG_PIN <= 19) ||
              (FILL_TRIG_PIN >= 21 && FILL_TRIG_PIN <= 23) ||
              (FILL_TRIG_PIN >= 25 && FILL_TRIG_PIN <= 27) ||
              (FILL_TRIG_PIN >= 32 && FILL_TRIG_PIN <= 33), "Choose a free output GPIO.");
static_assert(FILL_ECHO_PIN == 13 || FILL_ECHO_PIN == 14 ||
              (FILL_ECHO_PIN >= 18 && FILL_ECHO_PIN <= 19) ||
              (FILL_ECHO_PIN >= 21 && FILL_ECHO_PIN <= 23) ||
              (FILL_ECHO_PIN >= 25 && FILL_ECHO_PIN <= 27) ||
              (FILL_ECHO_PIN >= 32 && FILL_ECHO_PIN <= 36) ||
              FILL_ECHO_PIN == 39, "Choose a free input GPIO.");
static_assert(FILL_TRIG_PIN != FILL_ECHO_PIN, "TRIG and ECHO must use separate GPIOs.");
#endif

namespace {
const char* categories[] = {"recyclable", "non_recyclable", "e_waste"};
unsigned long lastSample = 0, lastBatch = 0;
float distances[5];
unsigned int attempts = 0, validCount = 0, syntheticTick = 0;
bool sampling = false;

bool calibrated() {
  return isfinite(FILL_EMPTY_CM) && isfinite(FILL_FULL_CM) &&
         FILL_FULL_CM >= 2.0f && FILL_EMPTY_CM <= 400.0f &&
         FILL_EMPTY_CM > FILL_FULL_CM;
}

void finishBatch() {
  const char* quality = "missing";
  char value[24] = "null";
  if (validCount >= 3) {
    for (unsigned int i = 1; i < validCount; ++i) {
      float next = distances[i];
      int j = i - 1;
      while (j >= 0 && distances[j] > next) {
        distances[j + 1] = distances[j];
        --j;
      }
      distances[j + 1] = next;
    }
    float cm = distances[validCount / 2];
    Serial.printf("FILL distance=%.2f cm (%u/5 echoes), calibration=%s\n",
                  cm, validCount, calibrated() ? "ready" : "required");
    quality = "invalid";
    if (calibrated()) {
      float percent = 100.0f * (FILL_EMPTY_CM - cm) / (FILL_EMPTY_CM - FILL_FULL_CM);
      percent = fmaxf(0.0f, fminf(100.0f, percent));
      snprintf(value, sizeof(value), "%.1f", percent);
      quality = "valid";
    }
  } else {
    Serial.printf("FILL no reliable distance (%u/5 echoes); publishing missing/null\n", validCount);
  }
  if (!mqtt.connected()) return;
  for (int i = 0; i < 3; ++i) {
    char fields[224];
    if (i == FILL_CATEGORY_INDEX) {
      snprintf(fields, sizeof(fields),
               "\"category\":\"%s\",\"fill_percentage\":%s,\"source\":\"sensor\",\"quality\":\"%s\"",
               categories[i], value, quality);
    } else {
      snprintf(fields, sizeof(fields),
               "\"category\":\"%s\",\"fill_percentage\":%u,\"source\":\"simulated\",\"quality\":\"valid\"",
               categories[i], (15 + i * 25 + (syntheticTick % 10) * 2) % 100);
    }
    publishMessage("fill", fields);
  }
  ++syntheticTick;
}
}

void fillSensorSetup() {
#if FILL_WIRING_CONFIRMED
  digitalWrite(FILL_TRIG_PIN, LOW);
  pinMode(FILL_TRIG_PIN, OUTPUT);
  pinMode(FILL_ECHO_PIN, INPUT);
  Serial.printf("HC-SR04 TRIG=%d ECHO=%d category=%s; calibration=%s\n",
                FILL_TRIG_PIN, FILL_ECHO_PIN, categories[FILL_CATEGORY_INDEX],
                calibrated() ? "ready" : "required (raw distance only)");
#else
  Serial.println("Fill sensor disarmed: confirm wiring in fill.local.h. No GPIO initialized.");
#endif
}

void fillSensorLoop() {
#if FILL_WIRING_CONFIRMED
  unsigned long now = millis();
  if (!sampling) {
    if (now - lastBatch < 5000) return;
    lastBatch = now;
    attempts = validCount = 0;
    sampling = true;
    lastSample = now - 70;
  }
  if (now - lastSample < 70) return;
  lastSample = now;
  digitalWrite(FILL_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(FILL_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(FILL_TRIG_PIN, LOW);
  // Bounded blocking: at most 25 ms per sample, with MQTT serviced between samples.
  unsigned long duration = pulseIn(FILL_ECHO_PIN, HIGH, 25000UL);
  float cm = duration / 58.0f;
  if (duration > 0 && cm >= 2.0f && cm <= 400.0f) distances[validCount++] = cm;
  if (++attempts == 5) {
    sampling = false;
    finishBatch();
  }
#endif
}
