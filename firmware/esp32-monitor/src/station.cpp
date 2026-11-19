#include <WiFi.h>
#include <HTTPClient.h>
#include <MQTT.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <atomic>
#define NETWORK_SETUP_NAME networkSetup
#define NETWORK_LOOP_NAME networkLoop
#include "../../common/network.h"
#include "../../common/fill_sensor.h"
#include "../../common/servo_controller.h"
#include "../../common/sort_routes.h"
#include "../../common/inlet_thresholds.h"
#include "../../common/station_indicator.h"
#if __has_include("station.local.h")
#include "station.local.h"
#else
#include "station.example.h"
#endif

static_assert(FILL_TRIG_PIN != BENCH_CLASSIFIER_GPIO && FILL_TRIG_PIN != BENCH_OPENER_GPIO,
              "Fill TRIG conflicts with a servo");
static_assert(FILL_ECHO_PIN != BENCH_CLASSIFIER_GPIO && FILL_ECHO_PIN != BENCH_OPENER_GPIO,
              "Fill ECHO conflicts with a servo");

// DOIT DevKit V1 user LED. Override for clones or set -1 to disable.
#ifndef STATION_LED_GPIO
#define STATION_LED_GPIO 2
#endif
#ifndef STATION_LED_ACTIVE_HIGH
#define STATION_LED_ACTIVE_HIGH 1
#endif
static_assert(STATION_LED_GPIO < 0 || (STATION_LED_GPIO != FILL_TRIG_PIN && STATION_LED_GPIO != FILL_ECHO_PIN &&
              STATION_LED_GPIO != BENCH_CLASSIFIER_GPIO && STATION_LED_GPIO != BENCH_OPENER_GPIO && STATION_LED_GPIO != 16),
              "Status LED conflicts with a sensor, servo or debug RX");

namespace Station {
constexpr uint32_t cameraPollIntervalMs = 1000;
constexpr unsigned int cameraStatusAttempts = 2;
Preferences prefs;
SemaphoreHandle_t stateLock = nullptr, storeLock = nullptr, controlLock = nullptr;
std::atomic<int> mode{0}; // 0=off, 1=one item, 2=continuous; only continuous persists.
std::atomic<unsigned int> cancelEpoch{0};
std::atomic<bool> busy{false}, pending{false};
bool taskReady = false, prefsReady = false;
String stage = "starting", error, eventId, decision, outcome, cameraHost = STATION_CAMERA_HOST;
float distance = 0, inletNearCm = InletThresholds::nearCm, inletClearCm = InletThresholds::clearCm;
bool validDistance = false, inletReady = false;
String inletDetectionMode = "drop", claimedArrival;
uint32_t lastCameraUptime = 0, lastDistanceAt = 0;
void resetGate() {
  if (stateLock) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    inletReady = false; validDistance = false; lastDistanceAt = 0;
    xSemaphoreGive(stateLock);
  }
}

void state(const String& next, const String& problem = "") {
  if (!stateLock) return;
  xSemaphoreTake(stateLock, portMAX_DELAY);
  stage = next; error = problem;
  xSemaphoreGive(stateLock);
}
void setMode(int next, bool cancel = false) {
  mode.store(next);
  if (cancel) ++cancelEpoch;
  if (!storeLock || !prefsReady) return;
  xSemaphoreTake(storeLock, portMAX_DELAY);
  prefs.putBool("enabled", next == 2);
  xSemaphoreGive(storeLock);
}
void queueOutcome(const String& value) {
  xSemaphoreTake(stateLock, portMAX_DELAY);
  outcome = value;
  xSemaphoreGive(stateLock);
  xSemaphoreTake(storeLock, portMAX_DELAY);
  prefs.putString("event", eventId);
  prefs.putString("outcome", value);
  prefs.putUInt("phase", 2); // Durable before any network report; safe to retry only report.
  xSemaphoreGive(storeLock);
  pending.store(true);
  state("outcome_pending");
}
String backend(const char* path) { return String("http://") + TEST_BACKEND_HOST + ":8000" + path; }

bool backendJSON(const char* method, const char* path, const String& body, JsonDocument& result,
                 uint16_t timeout = 8000) {
  WiFiClient socket;
  HTTPClient http;
  http.setReuse(false);
  http.setConnectTimeout(2000);
  http.setTimeout(timeout);
  if (!http.begin(socket, backend(path))) return false;
  int code;
  if (!strcmp(method, "GET")) code = http.GET();
  else {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  }
  bool ok = code == 200 && !deserializeJson(result, http.getString());
  http.end();
  return ok;
}

void resolveCamera(bool force = false) {
  static bool mdnsReady = false;
  static uint32_t lastLookup = 0;
  if (!force && lastLookup && millis() - lastLookup < 60000) return;
  lastLookup = millis();
  if (!mdnsReady) mdnsReady = MDNS.begin("waste-s11-controller");
  if (!mdnsReady) return;
  IPAddress ip = MDNS.queryHost("waste-s11-cam", 1000);
  if (ip != IPAddress(0, 0, 0, 0)) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    cameraHost = ip.toString();
    xSemaphoreGive(stateLock);
  }
}

bool cameraStatus(JsonDocument& result) {
  // Only a read-only status lookup is retried. Arrival is latched locally by
  // the camera; capture, inference and motion retain their one-shot rules.
  for (unsigned int attempt = 0; attempt < cameraStatusAttempts; ++attempt) {
    WiFiClient socket;
    HTTPClient http;
    http.setReuse(false); http.setConnectTimeout(4000); http.setTimeout(20000);
    if (!http.begin(socket, String("http://") + cameraHost + "/status")) return false;
    int code = http.GET();
    result.clear();
    bool ok = code == 200 && !deserializeJson(result, http.getString());
    http.end();
    if (ok) return true;
    if (!mode.load()) break;
    if (attempt + 1 < cameraStatusAttempts) vTaskDelay(pdMS_TO_TICKS(200));
  }
  return false;
}
bool enableInlet() {
  if (strlen(STATION_CAMERA_PASSWORD) < 16) return false;
  WiFiClient socket;
  HTTPClient http;
  http.setReuse(false); http.setConnectTimeout(4000); http.setTimeout(20000);
  if (!http.begin(socket, String("http://") + cameraHost + "/inlet/enable")) return false;
  http.setAuthorization("admin", STATION_CAMERA_PASSWORD);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST("{\"wiring_confirmed\":true,\"detection_mode\":\"drop\"}");
  http.end();
  return code == 200;
}
bool capture(String& jpeg, const String& arrivalKey) {
  WiFiClient socket;
  HTTPClient http;
  http.setReuse(false); http.setConnectTimeout(2000); http.setTimeout(15000);
  if (!http.begin(socket, String("http://") + cameraHost + "/capture?arrival_id=" + arrivalKey)) return false;
  int code = http.GET();
  int expected = http.getSize();
  bool ok = code == 200 && expected >= 4 && expected <= 64000;
  if (ok) {
    jpeg = http.getString();
    ok = static_cast<int>(jpeg.length()) == expected &&
         static_cast<uint8_t>(jpeg[0]) == 0xff && static_cast<uint8_t>(jpeg[1]) == 0xd8;
  }
  http.end();
  return ok;
}

class Multipart : public Stream {
  String prefix, suffix;
  const String& jpeg;
  size_t cursor = 0;
public:
  Multipart(const String& id, const String& image) : jpeg(image) {
    String boundary = "station-" + id;
    auto field = [&boundary](const char* name, const String& value) {
      return "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n";
    };
    prefix = field("station_id", TEST_STATION_ID) + field("device_id", STATION_CAMERA_DEVICE) + field("request_id", id);
    prefix += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"camera.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
    suffix = "\r\n--" + boundary + "--\r\n";
  }
  size_t length() const { return prefix.length() + jpeg.length() + suffix.length(); }
  int available() override { return length() - cursor; }
  int peek() override {
    if (cursor >= length()) return -1;
    if (cursor < prefix.length()) return static_cast<uint8_t>(prefix[cursor]);
    size_t offset = cursor - prefix.length();
    return static_cast<uint8_t>(offset < jpeg.length() ? jpeg[offset] : suffix[offset - jpeg.length()]);
  }
  int read() override { int value = peek(); if (value >= 0) ++cursor; return value; }
  void flush() override {}
  size_t write(uint8_t) override { return 0; }
};

bool classify(const String& jpeg, JsonDocument& result) {
  WiFiClient socket;
  HTTPClient http;
  http.setReuse(false); http.setConnectTimeout(3000); http.setTimeout(65000);
  if (!http.begin(socket, backend("/api/classify"))) return false;
  http.addHeader("Content-Type", "multipart/form-data; boundary=station-" + eventId);
  Multipart body(eventId, jpeg);
  // Exactly one paid inference request. No automatic retry after ambiguity.
  int code = http.sendRequest("POST", &body, body.length());
  bool ok = code == 200 && !deserializeJson(result, http.getString()) &&
            result["id"].as<String>() == eventId && result["provider"] == STATION_PROVIDER;
  http.end();
  return ok;
}

void reportPending() {
  JsonDocument body, result;
  body["event_id"] = eventId; body["outcome"] = outcome; body["simulated"] = false;
  String text; serializeJson(body, text);
  if (!backendJSON("POST", "/api/outcomes", text, result) || result["id"].as<String>() != eventId ||
      result["outcome"].as<String>() != outcome || result["simulated"].as<bool>()) {
    state("outcome_pending", "Outcome not confirmed; retrying report only, never movement");
    return;
  }
  xSemaphoreTake(storeLock, portMAX_DELAY);
  prefs.putUInt("phase", 0);
  xSemaphoreGive(storeLock);
  pending.store(false);
  Serial.printf("AUTO outcome persisted: %s / %s\n", eventId.c_str(), outcome.c_str());
  state(mode.load() ? "waiting_clear" : "off");
}

void processItem(unsigned int epoch, const String& arrivalKey) {
  if (epoch != cancelEpoch.load()) return;
  busy.store(true);
  state("capturing");
  JsonDocument summary;
  if (!backendJSON("GET", "/api/summary", "", summary) || summary["inference_provider"] != STATION_PROVIDER) {
    setMode(0); state("off", "Backend unavailable/provider mismatch; item consumed without inference retry");
    busy.store(false); return;
  }
  String jpeg;
  if (!capture(jpeg, arrivalKey)) {
    setMode(0); state("off", "Camera JPEG capture failed; no inference or movement");
    busy.store(false); return;
  }
  char id[37]; uuid4(id);
  xSemaphoreTake(stateLock, portMAX_DELAY);
  eventId = id; decision = ""; outcome = "";
  xSemaphoreGive(stateLock);
  state("classifying");
  Serial.printf("AUTO JPEG %u bytes; request=%s\n", jpeg.length(), eventId.c_str());
  JsonDocument result;
  if (!classify(jpeg, result)) {
    setMode(0); state("off", "Classification unconfirmed; no paid retry or motor replay. Check event before resuming");
    busy.store(false); return;
  }
  jpeg = "";
  xSemaphoreTake(stateLock, portMAX_DELAY);
  decision = result["decision"].as<String>();
  xSemaphoreGive(stateLock);
  int route = prototypeRoute(decision.c_str());
  Serial.printf("AUTO decision=%s route=%d event=%s\n", decision.c_str(), route, eventId.c_str());
  if (route < 0 || epoch != cancelEpoch.load()) {
    queueOutcome("disabled"); busy.store(false); return;
  }
  JsonDocument motor;
  ServoBench::status(motor);
  unsigned int completedBefore = motor["servo_bench_completed"].as<unsigned int>();
  xSemaphoreTake(storeLock, portMAX_DELAY);
  prefs.putString("event", eventId);
  prefs.putUInt("phase", 1); // Persist BEFORE motor command; reboot never replays it.
  xSemaphoreGive(storeLock);
  xSemaphoreTake(controlLock, portMAX_DELAY);
  bool cancelled = epoch != cancelEpoch.load();
  bool startedMotor = !cancelled && ServoBench::start(0, 0, 0, false, route);
  xSemaphoreGive(controlLock);
  if (!startedMotor) {
    if (!cancelled) setMode(0);
    queueOutcome(cancelled ? "disabled" : "failed"); busy.store(false); return;
  }
  state("sorting");
  uint32_t started = millis();
  bool completed = false;
  while (millis() - started < 20000) {
    vTaskDelay(pdMS_TO_TICKS(100));
    motor.clear(); ServoBench::status(motor);
    if (!motor["servo_bench_active"].as<bool>()) {
      completed = motor["servo_bench_completed"].as<unsigned int>() == completedBefore + 1 &&
                  motor["servo_holding_home"].as<bool>() &&
                  motor["classifier_command_us"] == ServoBenchPlan::classifierHomeUs &&
                  motor["opener_command_us"] == ServoBenchPlan::openerClosedUs;
      break;
    }
  }
  if (!completed) { ServoBench::stop(); setMode(0); }
  queueOutcome(completed ? "completed" : "failed");
  busy.store(false);
}

void task(void*) {
  xSemaphoreTake(storeLock, portMAX_DELAY);
  unsigned int previous = prefs.getUInt("phase", 0);
  if (previous) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    eventId = prefs.getString("event", "");
    outcome = previous == 1 ? "failed" : prefs.getString("outcome", "failed");
    xSemaphoreGive(stateLock);
  }
  xSemaphoreGive(storeLock);
  if (previous == 1) {
    setMode(0); queueOutcome("failed");
    Serial.println("AUTO interrupted motor cycle: no replay; reporting failed and remaining disarmed");
  } else if (previous == 2) pending.store(true);
  uint32_t lastReport = millis() - 5000;
  unsigned int gateEpoch = cancelEpoch.load();
  bool acquisitionConfigured = false;
  state(mode.load() ? "waiting_network" : "off");
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(mode.load() ? cameraPollIntervalMs : 200));
    if (gateEpoch != cancelEpoch.load()) { resetGate(); acquisitionConfigured = false; gateEpoch = cancelEpoch.load(); }
    if (WiFi.status() != WL_CONNECTED) { resetGate(); acquisitionConfigured = false; state("waiting_network"); continue; }
    if (pending.load()) {
      if (millis() - lastReport >= 5000) { lastReport = millis(); reportPending(); }
      continue;
    }
    if (!mode.load()) {
      acquisitionConfigured = false;
      resetGate();
      xSemaphoreTake(stateLock, portMAX_DELAY);
      if (!error.length()) stage = "off";
      xSemaphoreGive(stateLock);
      continue;
    }
    JsonDocument motor;
    ServoBench::status(motor);
    if (motor["servo_bench_active"].as<bool>()) continue;
    resolveCamera();
    JsonDocument camera;
    if (!cameraStatus(camera)) {
      resetGate(); acquisitionConfigured = false; state("waiting_camera", "Camera status unavailable; require clear inlet after reconnect");
      resolveCamera(true);
      continue;
    }
    if (camera["automatic_capture"].as<bool>() || camera["actuators_enabled"].as<bool>()) {
      resetGate(); setMode(0); state("off", "Another camera classification/control mode is active"); continue;
    }
    if (!camera["camera_ready"].as<bool>() || camera["outcome_pending"].as<bool>()) {
      resetGate(); state("waiting_camera", "Waiting for camera startup or prior outcome; auto mode remains armed"); continue;
    }
    if (!camera["inlet_arrival_pending"].is<bool>()) {
      resetGate(); setMode(0); state("off", "Camera needs the drop-capture firmware update"); continue;
    }
    if (!camera["inlet_enabled"].as<bool>() || camera["inlet_detection_mode"] != "drop" || !acquisitionConfigured) {
      resetGate(); state("enabling_inlet");
      acquisitionConfigured = enableInlet();
      if (!acquisitionConfigured) state("waiting_camera", "Could not enable camera drop detector");
      continue;
    }
    if (!mode.load() || gateEpoch != cancelEpoch.load()) { resetGate(); continue; }
    bool valid = camera["inlet_distance_valid"].as<bool>();
    float cm = camera["inlet_distance_cm"] | 0.0f;
    uint32_t uptime = camera["uptime_ms"] | 0u;
    float nearCm = camera["inlet_near_cm"] | InletThresholds::nearCm;
    float clearCm = camera["inlet_clear_cm"] | InletThresholds::clearCm;
    String arrivalKey = camera["inlet_arrival_key"] | "";
    bool trigger = camera["inlet_arrival_pending"].as<bool>() && arrivalKey.length() == 36;
    bool ready = !camera["inlet_waiting_for_clear"].as<bool>();
    xSemaphoreTake(stateLock, portMAX_DELAY);
    inletNearCm = nearCm; inletClearCm = clearCm; validDistance = valid; distance = cm; inletReady = ready; inletDetectionMode = "drop"; lastCameraUptime = uptime; lastDistanceAt = millis();
    xSemaphoreGive(stateLock);
    state(ready ? "waiting_item" : "waiting_clear");
    if (trigger) {
      // Claim once before any HTTP inference. The camera retains its frame/lock
      // through the cycle and outcome report; the next enable resets it only then.
      acquisitionConfigured = false;
      if (arrivalKey == claimedArrival) { setMode(0); state("off", "Arrival replay rejected"); continue; }
      xSemaphoreTake(stateLock, portMAX_DELAY); claimedArrival = arrivalKey; xSemaphoreGive(stateLock);
      if (!camera["inlet_arrival_frame_ready"].as<bool>()) {
        setMode(0); state("off", "Arrival snapshot failed; remove item before rearming"); continue;
      }
      unsigned int epoch = gateEpoch;
      if (!mode.load() || epoch != cancelEpoch.load()) { resetGate(); continue; }
      if (mode.load() == 1) setMode(0); // Consume one-shot before capture.
      processItem(epoch, arrivalKey);
    }
  }
}

void indicatorSetup() {
  if (STATION_LED_GPIO >= 0) { pinMode(STATION_LED_GPIO, OUTPUT); digitalWrite(STATION_LED_GPIO, !STATION_LED_ACTIVE_HIGH); }
}
void indicatorLoop() {
  static StationIndicator::Pattern previous = StationIndicator::Off;
  static uint32_t began = 0;
  if (STATION_LED_GPIO < 0 || !stateLock) return;
  if (xSemaphoreTake(stateLock, 0) != pdTRUE) return;
  auto pattern = StationIndicator::choose(stage.c_str(), error.length() > 0, WiFi.status() == WL_CONNECTED);
  xSemaphoreGive(stateLock);
  if (pattern != previous) { previous = pattern; began = millis(); }
  bool on = StationIndicator::level(pattern, millis() - began);
  digitalWrite(STATION_LED_GPIO, on ? STATION_LED_ACTIVE_HIGH : !STATION_LED_ACTIVE_HIGH);
}

void setup() {
  stateLock = xSemaphoreCreateMutex(); storeLock = xSemaphoreCreateMutex();
  controlLock = xSemaphoreCreateMutex();
  if (!stateLock || !storeLock || !controlLock) return;
  prefsReady = prefs.begin("waste-station", false);
  if (!prefsReady) return;
  mode.store(prefs.getBool("enabled", false) ? 2 : 0);
  taskReady = xTaskCreatePinnedToCore(task, "station-auto", 14336, nullptr, 1, nullptr, 0) == pdPASS;
  if (!taskReady) { mode.store(0); state("off", "Could not start autonomous controller task"); }
}
void status(JsonDocument& body) {
  body["automatic_supported"] = taskReady;
  body["camera_poll_interval_ms"] = cameraPollIntervalMs;
  body["camera_status_attempts"] = cameraStatusAttempts;
  body["automatic_sorting_enabled"] = mode.load() != 0;
  body["automatic_enabled"] = mode.load() != 0;
  body["automatic_continuous"] = mode.load() == 2;
  body["automatic_busy"] = busy.load();
  body["automatic_outcome_pending"] = pending.load();
  if (stateLock) {
    xSemaphoreTake(stateLock, portMAX_DELAY);
    body["automatic_stage"] = stage; body["automatic_error"] = error;
    body["automatic_event_id"] = eventId; body["automatic_decision"] = decision;
    body["automatic_last_outcome"] = outcome;
    body["camera_host"] = cameraHost;
    body["status_led_gpio"] = STATION_LED_GPIO;
    body["status_led_pattern"] = StationIndicator::name(StationIndicator::choose(stage.c_str(), error.length() > 0, WiFi.status() == WL_CONNECTED));
    body["inlet_distance_valid"] = validDistance;
    if (lastDistanceAt) body["inlet_sample_age_ms"] = uint32_t(millis() - lastDistanceAt);
    else body["inlet_sample_age_ms"] = nullptr;
    body["inlet_detection_mode"] = inletDetectionMode;
    body["inlet_claimed_arrival"] = claimedArrival;
    body["inlet_near_cm"] = inletNearCm;
    body["inlet_clear_cm"] = inletClearCm;
    body["inlet_ready"] = inletReady;
    body["inlet_distance_cm"] = validDistance ? distance : -1;
    body["camera_uptime_ms"] = lastCameraUptime;
    xSemaphoreGive(stateLock);
  }
}
}

void status() {
  JsonDocument body;
  body["mode"] = "usb-servo-bench"; // Backward-compatible USB console protocol.
  body["firmware_mode"] = "station-controller";
  body["uptime_ms"] = millis();
  body["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  body["mqtt_connected"] = mqtt.connected();
  body["ip"] = WiFi.localIP().toString();
  body["fill_sensor_enabled"] = FILL_WIRING_CONFIRMED == 1;
  body["fill_trig_gpio"] = FILL_TRIG_PIN; body["fill_echo_gpio"] = FILL_ECHO_PIN;
  body["fill_physical_category"] = FILL_CATEGORY_INDEX;
  body["fill_last_batch_ms"] = lastBatch;
  ServoBench::status(body);
  Station::status(body);
  String message;
  serializeJson(body, message);
  message += '\n';
  Serial.write(reinterpret_cast<const uint8_t*>(message.c_str()), message.length());
}
void stationStop() {
  if (Station::controlLock) xSemaphoreTake(Station::controlLock, portMAX_DELAY);
  Station::setMode(0, true);
  ServoBench::stop();
  if (Station::controlLock) xSemaphoreGive(Station::controlLock);
}
bool stationMotionBlocked() { return Station::mode.load() || Station::busy.load() || Station::pending.load(); }
bool stationCommand(const char* line) {
  if (strcmp(line, "auto on") && strcmp(line, "auto once") && strcmp(line, "auto off")) return false;
  if (!Station::taskReady) { Serial.println("ERROR autonomous task unavailable"); return true; }
  if (!strcmp(line, "auto off")) {
    xSemaphoreTake(Station::controlLock, portMAX_DELAY);
    Station::setMode(0, true); Station::state("off");
    xSemaphoreGive(Station::controlLock);
  } else if (Station::busy.load() || Station::pending.load()) {
    Serial.println("ERROR wait for current item/outcome before rearming"); return true;
  } else {
    xSemaphoreTake(Station::controlLock, portMAX_DELAY);
    Station::setMode(!strcmp(line, "auto on") ? 2 : 1, true);
    xSemaphoreGive(Station::controlLock);
  }
  status(); return true;
}
#include "../../common/usb_servo_console.h"

void setup() {
  Station::indicatorSetup();
  networkSetup();
  ServoBench::setup();
  ServoBench::start(0, 0, 0, false, -1, true);
  Station::setup();
  Serial.println("STATION controller: fill25/26, classifier27, opener33, camera debug RX16");
  Serial.println("auto once = one item; auto on = persistent continuous; auto off = disarm; stop = release PWM");
  status();
}
void loop() { usbServoConsoleLoop(); Station::indicatorLoop(); networkLoop(); }
