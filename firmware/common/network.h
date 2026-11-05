#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <MQTT.h>
#include <esp_system.h>
#include <time.h>
#include <sys/time.h>

#if __has_include("config.local.h")
#include "config.local.h"
#else
#include "config.example.h"
#endif

#if ACTUATORS_ENABLED
#error "Network tests never enable actuators."
#endif

WiFiClient mqttSocket;
MQTTClient mqtt(768);
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastHttpProbe = 0;
bool wifiWasConnected = false;
unsigned int sampleTick = 0;

void uuid4(char* output) {
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  snprintf(output, 37,
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],
    bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
}

bool utcTimestamp(char* output) {
  timeval clock;
  gettimeofday(&clock, nullptr);
  time_t timestamp = clock.tv_sec;
  if (timestamp < 1704067200) return false;
  tm utc;
  gmtime_r(&timestamp, &utc);
  char seconds[24];
  strftime(seconds, sizeof(seconds), "%Y-%m-%dT%H:%M:%S", &utc);
  snprintf(output, 40, "%s.%06ldZ", seconds, static_cast<long>(clock.tv_usec));
  return true;
}

bool publishMessage(const char* kind, const char* fields) {
  char id[37], timestamp[40], topic[160], payload[640];
  if (!utcTimestamp(timestamp)) {
    Serial.println("WAIT: UTC clock not synchronized; no timestamped MQTT data sent.");
    return false;
  }
  uuid4(id);
  snprintf(topic,sizeof(topic),"waste/v1/stations/%s/%s/%s",TEST_STATION_ID,TEST_DEVICE_ID,kind);
  snprintf(payload,sizeof(payload),
    "{\"schema_version\":1,\"message_id\":\"%s\",\"station_id\":\"%s\",\"device_id\":\"%s\",\"measured_at\":\"%s\",%s}",
    id,TEST_STATION_ID,TEST_DEVICE_ID,timestamp,fields);
  bool accepted = mqtt.publish(topic,payload,false,1);
  Serial.printf("MQTT %s: %s (broker acknowledgement only; verify API persistence)\n",kind,accepted?"ACK":"FAILED");
  return accepted;
}

void probeBackend() {
  WiFiClient transport;
  HTTPClient http;
  String url = String("http://") + TEST_BACKEND_HOST + ":8000/api/ready";
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  if (!http.begin(transport,url)) {
    Serial.println("HTTP readiness: could not initialize request");
    return;
  }
  int status = http.GET();
  Serial.printf("HTTP readiness: %d%s\n",status,status==200?" PASS":" (check LAN binding/firewall)");
  http.end();
}

#ifdef TEST_CAMERA_UPLOAD
void cameraTestSetup();
void cameraTestLoop();
#endif
#ifdef TEST_FILL_SENSOR
void fillSensorSetup();
void fillSensorLoop();
#endif
#ifdef TEST_CAMERA_SERIAL
void cameraSerialSetup();
void cameraSerialLoop();
#endif

#ifndef NETWORK_SETUP_NAME
#define NETWORK_SETUP_NAME setup
#endif
#ifndef NETWORK_LOOP_NAME
#define NETWORK_LOOP_NAME loop
#endif
void NETWORK_SETUP_NAME() {
  Serial.begin(115200);
  delay(300);
#ifdef TEST_CAMERA_SERIAL
  cameraSerialSetup();
#endif
#ifdef TEST_FILL_SENSOR
  Serial.printf("\nFILL SENSOR TEST / %s / camera and actuators disabled\n",TEST_DEVICE_ID);
  fillSensorSetup();
#elif defined(TEST_CAMERA_UPLOAD)
  Serial.printf("\nCAMERA TEST / %s / external sensors and actuators disabled\n",TEST_DEVICE_ID);
#else
  Serial.printf("\nNETWORK TEST / %s / no camera, GPIO, sensors or actuators initialized\n",TEST_DEVICE_ID);
#endif
  Serial.printf("Target backend: %s; SSID: %s\n",TEST_BACKEND_HOST,TEST_WIFI_SSID);
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event==ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.printf("Wi-Fi disconnected: reason=%u\n",info.wifi_sta_disconnected.reason);
    }
  });
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
  WiFi.begin(TEST_WIFI_SSID,TEST_WIFI_PASSWORD);
  mqtt.begin(TEST_BACKEND_HOST,1883,mqttSocket);
  mqtt.setOptions(30,true,2000);
}

void NETWORK_LOOP_NAME() {
#ifdef TEST_CAMERA_SERIAL
  // Drain camera logs even when this board cannot connect to Wi-Fi.
  cameraSerialLoop();
#endif
  unsigned long tick = millis();
  if (WiFi.status() != WL_CONNECTED) {
    wifiWasConnected = false;
    if (tick-lastWifiAttempt >= 15000) {
      lastWifiAttempt=tick;
      Serial.printf("Wi-Fi not connected (status %d); retrying\n",WiFi.status());
      WiFi.reconnect();
    }
    delay(20);
    return;
  }
  if (!wifiWasConnected) {
    wifiWasConnected=true;
    Serial.printf("Wi-Fi PASS: IP=%s RSSI=%d\n",WiFi.localIP().toString().c_str(),WiFi.RSSI());
    configTime(0,0,"pool.ntp.org","time.google.com");
#ifndef STATION_CONTROLLER
    probeBackend();
#endif
    tick=millis();
    lastHttpProbe=tick;
    lastMqttAttempt=tick-10000;
  }
#ifndef STATION_CONTROLLER
  if (tick-lastHttpProbe >= 30000) {
    lastHttpProbe=tick;
    probeBackend();
  }
#endif
  if (!mqtt.connected() && tick-lastMqttAttempt >= 10000) {
    lastMqttAttempt=tick;
    if (mqtt.connect(TEST_DEVICE_ID,TEST_MQTT_USER,TEST_MQTT_PASSWORD)) {
      Serial.println("MQTT connected with device-scoped credentials");
      lastHeartbeat=tick-15000;
    } else {
      Serial.printf("MQTT unavailable: error=%d return=%d; retry in 10s\n",mqtt.lastError(),mqtt.returnCode());
    }
  }
  if (mqtt.connected()) {
    mqtt.loop();
    if (tick-lastHeartbeat >= 15000) {
      lastHeartbeat=tick;
      publishMessage("heartbeat","\"status\":\"online\"");
#if TEST_PUBLISH_SIMULATED_FILL && !defined(TEST_FILL_SENSOR)
      const char* categories[] = {"recyclable","non_recyclable","e_waste"};
      for (unsigned int i=0;i<3;i++) {
        char fields[200];
        unsigned int fill = (15+i*25+(sampleTick%10)*2)%100;
        snprintf(fields,sizeof(fields),"\"category\":\"%s\",\"fill_percentage\":%u,\"source\":\"simulated\",\"quality\":\"valid\"",categories[i],fill);
        publishMessage("fill",fields);
      }
      sampleTick++;
#endif
    }
  }
#ifdef TEST_CAMERA_UPLOAD
  cameraTestLoop();
#endif
#ifdef TEST_FILL_SENSOR
  fillSensorLoop();
#endif
  delay(10);
}
