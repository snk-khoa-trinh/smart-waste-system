#pragma once
// Built-in camera wiring only: Espressif's CAMERA_MODEL_AI_THINKER mapping.
// Photo matches this common ESP32-CAM layout; verify actual sensor PID at boot.
// This does not assign any inlet, fill-sensor or servo pins. Flash LED is unused.
// Source: espressif/arduino-esp32 CameraWebServer/camera_pins.h
constexpr int CAMERA_PWDN = 32;
constexpr int CAMERA_RESET = -1;
constexpr int CAMERA_XCLK = 0;
constexpr int CAMERA_SDA = 26;
constexpr int CAMERA_SCL = 27;
constexpr int CAMERA_D0 = 5;
constexpr int CAMERA_D1 = 18;
constexpr int CAMERA_D2 = 19;
constexpr int CAMERA_D3 = 21;
constexpr int CAMERA_D4 = 36;
constexpr int CAMERA_D5 = 39;
constexpr int CAMERA_D6 = 34;
constexpr int CAMERA_D7 = 35;
constexpr int CAMERA_VSYNC = 25;
constexpr int CAMERA_HREF = 23;
constexpr int CAMERA_PCLK = 22;
