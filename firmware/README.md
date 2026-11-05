# Firmware

Only the two active Arduino applications remain under board `src/` folders:

| Board project | Environment | Source | Responsibility |
| --- | --- | --- | --- |
| `esp32-cam` | `camera` (default) | [camera.cpp](esp32-cam/src/camera.cpp) | Inlet sensing, retained JPEG, HTTP/control and authenticated OTA |
| `esp32-monitor` | `station` (default) | [station.cpp](esp32-monitor/src/station.cpp) | Fill telemetry, camera/backend orchestration, servos and status LED |

`main.cpp` is not a required filename. Arduino calls `setup()` and `loop()`;
PlatformIO selects translation units with `build_src_filter` and an environment,
not an arbitrary `--file` upload argument. See [PlatformIO source selection](https://docs.platformio.org/en/stable/projectconf/sections/env/options/build/build_src_filter.html).
The old provisional/network/fill/servo bring-up environments have been retired.
The private header format and existing USB status protocol remain compatible.

[Repository guide](../README.md) · [Agent rules](AGENTS.md) · [Station operation/history](../docs/autonomous-station.md)

## Configure and build

Run from the repository root. Generate private headers without displaying secrets:

```sh
uv run --directory backend python ../scripts/configure-hardware.py --ssid YOUR_2_4_GHZ_SSID
uv run --directory backend python ../scripts/camera-control.py configure
uv run --directory backend python ../scripts/configure-station.py
./scripts/check-firmware.sh
```

The setup helpers create ignored `config.local.h` (both boards), `ota.local.h`
(camera) and `station.local.h` (brain). Copy `esp32-monitor/include/fill.example.h`
to `fill.local.h` and set actual wiring/calibration before physical sensing.
Existing configured headers should be preserved. Roboflow API keys remain on
the backend; neither board needs one.

Build without uploading:

```sh
uv tool run --from platformio==6.2.0 pio run -d firmware/esp32-cam -e camera
uv tool run --from platformio==6.2.0 pio run -d firmware/esp32-monitor -e station
```

Add `-t upload` for an explicitly intended USB flash. Uploading the brain runs its
startup close/home sequence; saved continuous mode can resume from NVS. Compile
checks do not require connected boards. VS Code's PlatformIO extension is optional.
Camera OTA builds the same `camera` environment:

```sh
uv run --directory backend python ../scripts/camera-control.py update --host waste-s11-cam.local
```

## Shared runtime and tests

`common/network.h`, `fill_sensor.h`, `servo_controller.h`, `servo_plan.h`,
`usb_servo_console.h`, `drop_detector.h`, `station_indicator.h` and the inlet/routing
headers are actual firmware dependencies, not disposable test code. Legacy
`ServoBench` names and `TEST_*` flags remain internally for protocol/private-header
compatibility. `tests/` contains native C++ regressions and stays committed.

The current camera uses the AI Thinker-style pin map with an OV3660 sensor and
8MHz XCLK. Inlet TRIG13/ECHO14; brain fill TRIG25/ECHO26; classifier27/opener33;
optional camera TX to brain RX16. Preserve safe GPIO logic levels/common ground.

Classifier home700us/side2000us; opener closed1800us/open700us. Recyclable routes
home, e-waste side; other categories do not move the mechanism. Drop detection
locks immediately; a configurable delayed fresh exposure is retained until the
controller finishes. Current local capture delay is800ms; calibration is stored
on the camera and depends on the assembled mount. Firmware compilation does not
establish correct item imaging, calibrated fullness or successful physical sorting.
