#include <WiFi.h>
#include <HTTPClient.h>
#include <MQTT.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <esp_camera.h>
#include <esp_timer.h>
#ifdef TEST_INLET
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include "../../common/inlet_detector.h"
#include "../../common/drop_detector.h"
#if __has_include("ota.local.h")
#include "ota.local.h"
#else
#include "ota.example.h"
#endif
#endif
#include "camera_pins.h"
#include "../../common/network.h"

#ifdef TEST_ROBOFLOW
constexpr const char* expectedProvider = "roboflow";
constexpr int uploadAttempts = 1;
constexpr int inferenceTimeoutMs = 60000;
#else
constexpr const char* expectedProvider = "mock";
constexpr int uploadAttempts = 3;
constexpr int inferenceTimeoutMs = 20000;
#endif

WebServer cameraServer(80);
bool cameraReady = false;
bool cameraServerStarted = false;
bool outcomePending = false;
bool outcomeBrokerAck = false;
unsigned long outcomeNotBefore = 0;
unsigned long lastOutcomeAttempt = 0;
uint16_t sensorPid = 0;
String lastEventId;
String lastDecision;
String lastProvider;
String lastError;
size_t lastImageBytes = 0;
size_t lastImageWidth = 0;
size_t lastImageHeight = 0;
// Single-frame prototype capture does not need the highest sensor clock.
// 8 MHz coexistence experiment: arduino-esp32 issue #5834 reports interference
// at 5/10/20 MHz. Verify captures and connectivity on the installed sensor.
// Keep this configurable for controlled camera/Wi-Fi coexistence checks.
#ifndef CAMERA_XCLK_HZ
#define CAMERA_XCLK_HZ 8000000
#endif
#ifdef TEST_INLET
constexpr int inletTrig = 13, inletEcho = 14; // No microSD in this build.
InletDetector inletDetector;
DropDetector dropDetector;
Preferences dropPrefs;
bool dropPrefsReady = false;
bool dropMode = false;
camera_fb_t* dropFrame = nullptr;
uint32_t dropArrivalId = 0, dropCapturedAt = 0, dropTriggeredAt = 0;
uint32_t dropCaptureDelayMs = 350;
int64_t dropNotBeforeUs = 0;
bool dropCapturePending = false;
String dropArrivalKey;
void releaseDropFrame() {
  if (dropFrame) { esp_camera_fb_return(dropFrame); dropFrame = nullptr; }
}
bool inletEnabled = false, inletArmed = false, inletDistanceValid = false;
bool otaReady = false, otaUpdating = false;
float inletDistanceCm = 0;
unsigned long lastInletSample = 0;
unsigned int inletRemaining = 0, inletAttempts = 0;
void inletSetup();
void inletLoop();
#endif

// Stream the multipart envelope and JPEG directly; no second image-sized buffer.
class MultipartFrame : public Stream {
  String prefix;
  String suffix;
  const uint8_t* image;
  size_t imageLength;
  size_t cursor = 0;
public:
  MultipartFrame(String before, camera_fb_t* frame, String after)
    : prefix(before),suffix(after),image(frame->buf),imageLength(frame->len) {}
  size_t length() const { return prefix.length()+imageLength+suffix.length(); }
  int available() override { return length()-cursor; }
  int peek() override {
    if (cursor>=length()) return -1;
    if (cursor<prefix.length()) return static_cast<uint8_t>(prefix[cursor]);
    size_t offset=cursor-prefix.length();
    return offset<imageLength ? image[offset] : static_cast<uint8_t>(suffix[offset-imageLength]);
  }
  int read() override { int value=peek(); if (value>=0) cursor++; return value; }
  void flush() override {}
  size_t write(uint8_t) override { return 0; }
};

String formField(const String& boundary,const char* name,const char* value) {
  return "--"+boundary+"\r\nContent-Disposition: form-data; name=\""+String(name)+"\"\r\n\r\n"+value+"\r\n";
}

void sendJson(int status,JsonDocument& body) {
  String output;
  serializeJson(body,output);
  cameraServer.sendHeader("Cache-Control","no-store");
  cameraServer.send(status,"application/json",output);
}

void failRequest(int status,const String& message) {
  lastError=message;
  Serial.println("Camera test error: "+message);
  JsonDocument body;
  body["error"]=message;
  sendJson(status,body);
}

camera_fb_t* captureJpeg(int64_t notBeforeUs = 0) {
  // A queued image may predate the arrival. Only accept an exposure whose
  // first DMA timestamp is at/after the requested capture time (since boot).
  if (!notBeforeUs) notBeforeUs=esp_timer_get_time();
  for (unsigned int attempt=0;attempt<8;++attempt) {
    camera_fb_t* frame=esp_camera_fb_get();
    if (!frame) return nullptr;
    int64_t frameUs=int64_t(frame->timestamp.tv_sec)*1000000LL+frame->timestamp.tv_usec;
    if (frameUs<notBeforeUs) { esp_camera_fb_return(frame); continue; }
    if (frame->format!=PIXFORMAT_JPEG || frame->len<4 || frame->len>250000 || frame->buf[0]!=0xff || frame->buf[1]!=0xd8) {
      esp_camera_fb_return(frame); return nullptr;
    }
    lastImageBytes=frame->len;
    lastImageWidth=frame->width;
    lastImageHeight=frame->height;
    Serial.printf("JPEG captured: %ux%u, %u bytes, frame_start_ms=%llu\n",frame->width,frame->height,frame->len,
                  static_cast<unsigned long long>(frameUs/1000));
    return frame;
  }
  return nullptr; // Never silently substitute an older frame.
}

void captureRoute() {
  if (!cameraReady) { failRequest(503,"Camera initialization failed; inspect serial log"); return; }
#ifdef TEST_INLET
  bool cached = cameraServer.hasArg("arrival_id");
  if (cached && (!dropMode || !dropDetector.locked() || !dropFrame ||
      cameraServer.arg("arrival_id") != dropArrivalKey)) {
    failRequest(409,"Arrival JPEG unavailable; no replacement capture"); return;
  }
  if (!cached && (dropFrame || dropCapturePending)) { failRequest(409,"Arrival JPEG reserved for the controller"); return; }
  camera_fb_t* frame=cached ? dropFrame : captureJpeg();
#else
  camera_fb_t* frame=captureJpeg();
#endif
  if (!frame) { failRequest(503,"JPEG capture failed"); return; }
  cameraServer.sendHeader("Cache-Control","no-store");
  cameraServer.sendHeader("Content-Disposition","inline; filename=camera-test.jpg");
  // Use the framework's binary response writer instead of a manually timed
  // chunk loop, which could terminate a slow preview transfer prematurely.
  cameraServer.send_P(200,"image/jpeg",reinterpret_cast<const char*>(frame->buf),frame->len);
#ifdef TEST_INLET
  if (!cached) esp_camera_fb_return(frame);
#else
  esp_camera_fb_return(frame);
#endif
}

bool expectedProviderActive() {
  WiFiClient transport;
  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  http.begin(transport,String("http://")+TEST_BACKEND_HOST+":8000/api/summary");
  int status=http.GET();
  JsonDocument summary;
  bool allowed=status==200 && !deserializeJson(summary,http.getString()) && summary["inference_provider"]==expectedProvider;
  http.end();
  return allowed;
}

bool classifyItem(bool respond) {
  auto fail = [respond](int status, const String& message) {
    if (respond) failRequest(status, message);
    else { lastError = message; Serial.println("Inlet classification error: " + message); }
    return false;
  };
  if (!cameraReady) return fail(503,"Camera not ready");
#ifdef TEST_INLET
  if (dropFrame || dropCapturePending) return fail(409,"Arrival JPEG reserved for the controller");
#endif
  char timestamp[40];
  if (!mqtt.connected() || !utcTimestamp(timestamp)) return fail(503,"Wait for MQTT connection and UTC synchronization");
  if (outcomePending) return fail(409,"Previous disabled outcome is still awaiting broker acknowledgement");
  // A separate build opts in to cloud inference; never accept a provider mismatch.
  if (!expectedProviderActive()) return fail(409,String("Camera test requires backend provider ")+expectedProvider+"; no image uploaded");
  camera_fb_t* frame=captureJpeg();
  if (!frame) return fail(503,"JPEG capture failed");
  char requestId[37];
  uuid4(requestId);
  String boundary=String("esp32-")+requestId;
  String prefix=formField(boundary,"station_id",TEST_STATION_ID)
    +formField(boundary,"device_id",TEST_DEVICE_ID)
    +formField(boundary,"request_id",requestId);
#ifndef TEST_ROBOFLOW
  prefix+=formField(boundary,"scenario","plastic");
#endif
  prefix+="--"+boundary+"\r\nContent-Disposition: form-data; name=\"image\"; filename=\"esp32-capture.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  String suffix="\r\n--"+boundary+"--\r\n";
  int status=-1;
  String response;
  for (int attempt=0;attempt<uploadAttempts;attempt++) {
    WiFiClient transport;
    HTTPClient http;
    http.setConnectTimeout(3000);
    http.setTimeout(inferenceTimeoutMs);
    http.begin(transport,String("http://")+TEST_BACKEND_HOST+":8000/api/classify");
    http.addHeader("Content-Type","multipart/form-data; boundary="+boundary);
    MultipartFrame body(prefix,frame,suffix);
    status=http.sendRequest("POST",&body,body.length());
    response=status>0 ? http.getString() : "";
    http.end();
    Serial.printf("Classification HTTP %d; request_id=%s; attempt=%d\n",status,requestId,attempt+1);
    if (status==200 || (status>=400 && status<500 && status!=408 && status!=429)) break;
    // Preserve the exact JPEG and UUID for every retry.
    for (int i=0;i<100;i++) { mqtt.loop(); delay(10); }
  }
  esp_camera_fb_return(frame);
  if (status!=200) return fail(502,"Backend classification failed after bounded retries; no outcome reported");
  JsonDocument result;
  if (deserializeJson(result,response) || !result["id"].is<const char*>() || result["id"]!=requestId || result["provider"]!=expectedProvider) {
    return fail(502,"Unexpected classification response; no outcome reported");
  }
  lastEventId=result["id"].as<String>();
  lastDecision=result["decision"].as<String>();
  lastProvider=result["provider"].as<String>();
  lastError="";
  outcomePending=true;
  outcomeBrokerAck=false;
  outcomeNotBefore=millis()+2000;
  lastOutcomeAttempt=millis()-5000;
  Serial.printf("Decision: %s / provider=%s; actuators DISABLED\n",lastDecision.c_str(),lastProvider.c_str());
  if (respond) sendJson(200,result);
  return true;
}

void classifyRoute() {
#ifdef TEST_INLET
  if (inletArmed) { failRequest(409,"Disarm automatic inlet capture before manual classification"); return; }
#endif
  classifyItem(true);
}

void statusRoute() {
  JsonDocument status;
  char timestamp[40];
  status["mqtt_connected"]=mqtt.connected();
  status["mqtt_last_error"]=mqtt.lastError();
  status["mqtt_return_code"]=mqtt.returnCode();
  status["uptime_ms"]=millis();
  status["free_heap"]=ESP.getFreeHeap();
  status["wifi_status"]=static_cast<int>(WiFi.status());
  status["wifi_rssi"]=WiFi.RSSI();
  status["wifi_bssid"]=WiFi.BSSIDstr();
  status["wifi_channel"]=WiFi.channel();
  status["max_alloc_heap"]=ESP.getMaxAllocHeap();
  status["reset_reason"]=static_cast<int>(esp_reset_reason());
  status["camera_xclk_hz"]=CAMERA_XCLK_HZ;
  bool synchronized=utcTimestamp(timestamp);
  status["utc_synchronized"]=synchronized;
  if (synchronized) status["utc_time"]=timestamp;
  status["outcome_pending"]=outcomePending;
  status["camera_ready"]=cameraReady;
  status["sensor_pid"]=sensorPid;
  status["sensor"]=sensorPid==OV3660_PID ? "OV3660" : sensorPid==OV2640_PID ? "OV2640" : "unconfirmed";
  status["psram"]=psramFound();
  status["actuators_enabled"]=false;
  status["automatic_capture"]=false;
#ifdef TEST_INLET
  status["automatic_capture"]=inletArmed;
  status["inlet_near_cm"]=inletDetector.nearThreshold();
  status["inlet_clear_cm"]=inletDetector.clearThreshold();
  status["inlet_enabled"]=inletEnabled;
  status["inlet_trig_gpio"]=inletTrig;
  status["inlet_echo_gpio"]=inletEcho;
  status["inlet_distance_valid"]=inletDistanceValid;
  if (inletDistanceValid) status["inlet_distance_cm"]=inletDistanceCm;
  else status["inlet_distance_cm"]=nullptr;
  status["inlet_detection_mode"]=dropMode ? "drop" : "proximity";
  status["inlet_waiting_for_clear"]=dropMode ? !dropDetector.ready() : inletDetector.waitingForClear();
  status["inlet_calibration_persistent"]=dropPrefsReady;
  status["inlet_baseline_cm"]=dropDetector.baselineCm();
  status["inlet_drop_cm"]=dropDetector.deltaCm();
  status["inlet_drop_locked"]=dropDetector.locked();
  status["inlet_arrival_id"]=dropArrivalId;
  status["inlet_arrival_key"]=dropArrivalKey;
  status["inlet_arrival_pending"]=dropMode && dropDetector.locked() && !dropCapturePending;
  status["inlet_arrival_frame_ready"]=dropFrame!=nullptr;
  status["inlet_arrival_captured_ms"]=dropCapturedAt;
  status["inlet_arrival_triggered_ms"]=dropTriggeredAt;
  status["inlet_capture_delay_ms"]=dropCaptureDelayMs;
  status["inlet_arrival_capture_pending"]=dropCapturePending;
  status["inlet_sample_interval_ms"]=dropMode ? 60 : 100;
  status["inlet_captures_remaining"]=inletRemaining;
  status["inlet_capture_attempts"]=inletAttempts;
  status["ota_enabled"]=otaReady;
  status["ota_authenticated"]=otaReady;
#ifdef TEST_ROBOFLOW
  status["firmware_mode"]="inlet-roboflow-test";
#else
  status["firmware_mode"]="inlet-test";
#endif
  status["firmware_build"]=__DATE__ " " __TIME__;
#endif
  status["expected_provider"]=expectedProvider;
  status["upload_attempts_per_trigger"]=uploadAttempts;
  status["last_image_bytes"]=lastImageBytes;
  status["last_image_width"]=lastImageWidth;
  status["last_image_height"]=lastImageHeight;
  status["last_event_id"]=lastEventId;
  status["last_decision"]=lastDecision;
  status["last_provider"]=lastProvider;
  status["disabled_outcome_broker_ack"]=outcomeBrokerAck;
  status["last_error"]=lastError;
  sendJson(200,status);
}

void cameraTestSetup() {
  Serial.printf("Camera startup: free internal heap=%u bytes\n",ESP.getFreeHeap());
  camera_config_t config={};
  config.ledc_channel=LEDC_CHANNEL_0;
  config.ledc_timer=LEDC_TIMER_0;
  config.pin_pwdn=CAMERA_PWDN;
  config.pin_reset=CAMERA_RESET;
  config.pin_xclk=CAMERA_XCLK;
  config.pin_sccb_sda=CAMERA_SDA;
  config.pin_sccb_scl=CAMERA_SCL;
  config.pin_d0=CAMERA_D0; config.pin_d1=CAMERA_D1;
  config.pin_d2=CAMERA_D2; config.pin_d3=CAMERA_D3;
  config.pin_d4=CAMERA_D4; config.pin_d5=CAMERA_D5;
  config.pin_d6=CAMERA_D6; config.pin_d7=CAMERA_D7;
  config.pin_vsync=CAMERA_VSYNC;
  config.pin_href=CAMERA_HREF;
  config.pin_pclk=CAMERA_PCLK;
  config.xclk_freq_hz=CAMERA_XCLK_HZ;
  config.pixel_format=PIXFORMAT_JPEG;
#ifdef TEST_ROBOFLOW
  config.frame_size=FRAMESIZE_QVGA;
#else
  config.frame_size=psramFound()?FRAMESIZE_VGA:FRAMESIZE_QVGA;
#endif
  config.jpeg_quality=12;
  config.fb_count=1;
  config.fb_location=psramFound()?CAMERA_FB_IN_PSRAM:CAMERA_FB_IN_DRAM;
  config.grab_mode=CAMERA_GRAB_WHEN_EMPTY;
  esp_err_t error=esp_camera_init(&config);
  if (error!=ESP_OK) {
    lastError=String("Camera initialization error: ")+static_cast<unsigned int>(error);
    Serial.printf("Camera initialization FAILED: 0x%x; no alternative pin maps attempted\n",error);
  } else {
    sensor_t* sensor=esp_camera_sensor_get();
    sensorPid=sensor->id.PID;
    cameraReady=sensorPid==OV3660_PID || sensorPid==OV2640_PID;
    if (sensorPid==OV3660_PID) {
      sensor->set_vflip(sensor,1);
      sensor->set_brightness(sensor,1);
      sensor->set_saturation(sensor,-2);
    }
    if (cameraReady) {
      for (int i=0;i<4;i++) { camera_fb_t* frame=esp_camera_fb_get(); if (frame)esp_camera_fb_return(frame); delay(80); }
      Serial.printf("Camera PASS: PID=0x%x (%s), PSRAM=%s\n",sensorPid,sensorPid==OV3660_PID?"OV3660":"OV2640",psramFound()?"yes":"no");
    } else {
      lastError="Unexpected camera sensor; capture disabled";
      esp_camera_deinit();
    }
  }
  cameraServer.on("/status",HTTP_GET,statusRoute);
  cameraServer.on("/capture",HTTP_GET,captureRoute);
  cameraServer.on("/classify",HTTP_POST,classifyRoute);
#ifdef TEST_INLET
  inletSetup();
#endif
}

void cameraTestLoop() {
  // Arduino initializes lwIP through WiFi; binding a server during the earlier
  // camera-only setup would assert with "Invalid mbox" on this core version.
  if (!cameraServerStarted) {
    cameraTestSetup();
    cameraServer.begin();
    cameraServerStarted=true;
    Serial.printf("Camera diagnostics ready: http://%s/status\n",WiFi.localIP().toString().c_str());
  }
  cameraServer.handleClient();
  if (outcomePending && mqtt.connected() && static_cast<int32_t>(millis()-outcomeNotBefore)>=0 && millis()-lastOutcomeAttempt>=5000) {
    lastOutcomeAttempt=millis();
    String fields=String("\"event_id\":\"")+lastEventId+"\",\"outcome\":\"disabled\",\"simulated\":false";
    outcomeBrokerAck=publishMessage("outcome",fields.c_str());
    if (outcomeBrokerAck)outcomePending=false;
  }
#ifdef TEST_INLET
  if (otaReady) ArduinoOTA.handle();
  inletLoop();
#endif
}

#ifdef TEST_INLET
bool inletAuthenticate() {
  if (strlen(TEST_OTA_PASSWORD) < 16) {
    failRequest(503,"Configure a private OTA/control password before enabling inlet detection");
    return false;
  }
  if (cameraServer.authenticate("admin",TEST_OTA_PASSWORD)) return true;
  cameraServer.requestAuthentication();
  return false;
}

void inletControl(bool arm) {
  if (!inletAuthenticate()) return;
  JsonDocument request;
  if (deserializeJson(request,cameraServer.arg("plain")) ||
      !request["wiring_confirmed"].is<bool>() || !request["wiring_confirmed"].as<bool>()) {
    failRequest(400,"Confirm external sensor wiring with wiring_confirmed=true"); return;
  }
  float nearCm=inletDetector.nearThreshold(), clearCm=inletDetector.clearThreshold();
  if (!request["near_cm"].isNull() || !request["clear_cm"].isNull()) {
    if (!request["near_cm"].is<float>() || !request["clear_cm"].is<float>()) {
      failRequest(400,"near_cm and clear_cm must both be numbers"); return;
    }
    nearCm=request["near_cm"].as<float>(); clearCm=request["clear_cm"].as<float>();
    if (!(nearCm>=2 && nearCm<clearCm && clearCm<=400)) {
      failRequest(400,"Require 2 <= near_cm < clear_cm <= 400"); return;
    }
  }
  String detectionMode=request["detection_mode"] | (dropMode ? "drop" : "proximity");
  bool requestedDrop=detectionMode=="drop";
  if (detectionMode!="drop" && detectionMode!="proximity") { failRequest(400,"Choose drop or proximity detection"); return; }
  if ((!request["baseline_cm"].isNull() && !request["baseline_cm"].is<float>()) ||
      (!request["drop_cm"].isNull() && !request["drop_cm"].is<float>())) {
    failRequest(400,"baseline_cm and drop_cm must be numbers"); return;
  }
  float baseline=request["baseline_cm"] | dropDetector.baselineCm();
  float delta=request["drop_cm"] | dropDetector.deltaCm();
  if (requestedDrop && (!(baseline>=4 && baseline<=400 && delta>=1 && delta<=baseline-2) || arm)) {
    failRequest(400,"Drop mode requires enable (controller capture), baseline4..400cm and drop1..baseline-2cm"); return;
  }
  uint32_t captureDelay=request["capture_delay_ms"] | dropCaptureDelayMs;
  if ((!request["capture_delay_ms"].isNull() && !request["capture_delay_ms"].is<unsigned int>()) || captureDelay>1500) {
    failRequest(400,"capture_delay_ms must be an integer 0..1500"); return;
  }
  unsigned int captures = 1;
  if (arm) {
    if (!request["max_captures"].isNull() && !request["max_captures"].is<unsigned int>()) {
      failRequest(400,"max_captures must be an integer 1..10"); return;
    }
    if (request["max_captures"].is<unsigned int>()) captures=request["max_captures"].as<unsigned int>();
    if (captures<1 || captures>10) { failRequest(400,"max_captures must be 1..10"); return; }
    char timestamp[40];
    if (!cameraReady) { failRequest(409,"Camera is not ready"); return; }
    if (!mqtt.connected()) { failRequest(409,"MQTT is disconnected; wait for broker reconnect"); return; }
    if (!utcTimestamp(timestamp)) { failRequest(409,"UTC clock is not synchronized"); return; }
    if (outcomePending) { failRequest(409,"Previous outcome is awaiting broker acknowledgement"); return; }
    if (!expectedProviderActive()) { failRequest(409,"Backend provider mismatch; no capture armed"); return; }
  }
  if (!inletEnabled) {
    digitalWrite(inletTrig,LOW);
    pinMode(inletTrig,OUTPUT);
    pinMode(inletEcho,INPUT);
    inletEnabled=true;
  }
  releaseDropFrame();
  dropMode=requestedDrop; dropCapturePending=false; dropCaptureDelayMs=captureDelay;
  dropDetector.configure(baseline,delta);
  if (dropPrefsReady && (!request["baseline_cm"].isNull() || !request["drop_cm"].isNull())) {
    dropPrefs.putFloat("baseline",baseline); dropPrefs.putFloat("delta",delta);
  }
  if (dropPrefsReady && !request["capture_delay_ms"].isNull()) dropPrefs.putUInt("capture-ms",captureDelay);
  dropCapturedAt=0; dropTriggeredAt=0;
  inletDistanceValid=false;
  inletDetector.configure(nearCm,clearCm);
  inletArmed=arm;
  inletRemaining=arm ? captures : 0;
  Serial.printf("Inlet GPIO13/14 enabled; classification=%s; budget=%u; clear inlet first\n",
                arm ? "armed" : "disabled",inletRemaining);
  statusRoute();
}

void inletSetup() {
  dropPrefsReady=dropPrefs.begin("inlet-drop",false);
  if (dropPrefsReady) {
    dropDetector.configure(dropPrefs.getFloat("baseline",10.5f),dropPrefs.getFloat("delta",2.0f));
    dropCaptureDelayMs=dropPrefs.getUInt("capture-ms",350);
    if (dropCaptureDelayMs>1500) dropCaptureDelayMs=350;
  }
  cameraServer.on("/inlet/enable",HTTP_POST,[](){ inletControl(false); });
  cameraServer.on("/inlet/arm",HTTP_POST,[](){ inletControl(true); });
  cameraServer.on("/inlet/disarm",HTTP_POST,[](){
    if (!inletAuthenticate()) return;
    releaseDropFrame(); dropDetector.reset(); dropCapturePending=false;
    inletArmed=false;
    inletRemaining=0;
    inletDistanceValid=false;
    inletDetector.reset();
    if (inletEnabled) {
      digitalWrite(inletTrig,LOW);
      pinMode(inletTrig,INPUT);
      pinMode(inletEcho,INPUT);
    }
    inletEnabled=false;
    statusRoute();
  });
  if (strlen(TEST_OTA_PASSWORD) < 16) {
    Serial.println("OTA and inlet controls disabled: no private password configured");
    return;
  }
  ArduinoOTA.setHostname("waste-s11-cam");
  ArduinoOTA.setPassword(TEST_OTA_PASSWORD);
  ArduinoOTA.setTimeout(15000);
  ArduinoOTA.onStart([](){
    releaseDropFrame(); dropDetector.reset(); dropCapturePending=false;
    inletArmed=false; inletEnabled=false; inletRemaining=0; otaUpdating=true;
    // OTA runs synchronously after the current HTTP handler has returned its
    // framebuffer. Release the camera driver/XCLK before receiving firmware so
    // camera activity cannot compete with Wi-Fi and flash writes during OTA.
    if (cameraReady) {
      cameraReady=false;
      esp_err_t stopped=esp_camera_deinit();
      Serial.printf("OTA camera suspended: 0x%x\n",static_cast<unsigned int>(stopped));
    }
    Serial.println("Authenticated OTA starting; inlet capture and camera disabled");
  });
  ArduinoOTA.onError([](ota_error_t error){
    otaUpdating=false;
    if (!cameraReady) lastError="Firmware update failed; reset camera before capture";
    Serial.printf("OTA failed: code=%u; inlet remains disarmed; camera reset may be required\n",static_cast<unsigned int>(error));
  });
  ArduinoOTA.begin();
  otaReady=true;
  Serial.println("Password-protected LAN OTA ready; external inlet GPIOs remain disabled");
}

void inletLoop() {
  if (!inletEnabled || otaUpdating) return;
  if (dropMode && dropCapturePending && uint32_t(millis()-dropTriggeredAt)>=dropCaptureDelayMs) {
    dropFrame=cameraReady ? captureJpeg(dropNotBeforeUs) : nullptr;
    dropCapturedAt=dropFrame ? uint32_t(int64_t(dropFrame->timestamp.tv_sec)*1000LL+dropFrame->timestamp.tv_usec/1000) : 0;
    dropCapturePending=false;
    lastError=dropFrame ? "" : "Arrival snapshot failed; item locked, no older replacement frame";
    Serial.printf("DROP snapshot arrival=%u frame=%s trigger_ms=%u frame_ms=%u\n",dropArrivalId,
                  dropFrame ? "ready" : "failed",dropTriggeredAt,dropCapturedAt);
  }
  if (millis()-lastInletSample<(dropMode ? 60u : 100u)) return;
  lastInletSample=millis();
  digitalWrite(inletTrig,LOW); delayMicroseconds(2);
  digitalWrite(inletTrig,HIGH); delayMicroseconds(10);
  digitalWrite(inletTrig,LOW);
  unsigned long duration=pulseIn(inletEcho,HIGH,25000UL);
  inletDistanceCm=duration/58.0f;
  inletDistanceValid=duration>0 && inletDistanceCm>=2 && inletDistanceCm<=400;
  bool trigger=dropMode ? dropDetector.sample(inletDistanceValid,inletDistanceCm) : inletDetector.sample(inletDistanceValid,inletDistanceCm,millis());
  if (dropMode) {
    if (trigger) {
      ++dropArrivalId;
      if (!dropArrivalId) ++dropArrivalId;
      char key[37]; uuid4(key); dropArrivalKey=key;
      dropTriggeredAt=millis(); dropCapturedAt=0;
      dropNotBeforeUs=esp_timer_get_time()+int64_t(dropCaptureDelayMs)*1000LL;
      releaseDropFrame();
      dropCapturePending=true;
      Serial.printf("DROP arrival=%u distance=%.2f baseline=%.2f; locked, snapshot scheduled in %ums\n",
                    dropArrivalId,inletDistanceCm,dropDetector.baselineCm(),dropCaptureDelayMs);
    }
    return;
  }
  if (!trigger || !inletArmed || inletRemaining==0) return;
  // Consume the item even on transport failure; never repeatedly charge for it.
  --inletRemaining;
  ++inletAttempts;
  if (inletRemaining==0) inletArmed=false;
  if (!cameraReady || !mqtt.connected() || outcomePending) {
    lastError="Inlet item skipped: camera/MQTT unavailable or outcome pending; remove and reinsert item";
    Serial.println(lastError);
    return;
  }
  Serial.printf("Inlet arrival: %.2f cm; capture attempt=%u, remaining=%u\n",
                inletDistanceCm,inletAttempts,inletRemaining);
  classifyItem(false);
}
#endif
