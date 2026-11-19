#pragma once
// Copy to config.local.h (ignored), or use scripts/configure-hardware.py.
#define TEST_WIFI_SSID "YOUR_2_4_GHZ_SSID"
#define TEST_WIFI_PASSWORD "SET_LOCALLY"
#define TEST_BACKEND_HOST "192.168.1.100"
#define TEST_STATION_ID "s11"
#define TEST_DEVICE_ID "s11-monitor"
#define TEST_MQTT_USER "monitor-s11"
#define TEST_MQTT_PASSWORD "SET_LOCALLY"
// Synthetic transport test only; never label these percentages as sensor readings.
#define TEST_PUBLISH_SIMULATED_FILL 1
