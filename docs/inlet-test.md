# Step 7: inlet detection and Wi-Fi firmware updates

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


## Current prototype result: first automatic cycle passed

After external wiring and camera restart, the wired debug relay received real
`[CAM]` readiness and MQTT messages. DHCP changed the camera from192.168.1.196
to192.168.1.199; `waste-s11-cam.local` resolved to the current address. The control
helper now accepts a `.local` hostname, resolving it once to a validated private
IPv4 address before connecting. Network connection failures remain intermittent.

An explicit one-capture arm succeeded. The user cleared the inlet, approached
with a book and triggered a real320×240 JPEG (5038bytes) upload. Event
`e1f594ca-3e65-493a-ba49-17c73988a32b` persisted at2026-11-01T15:33:18.865556Z:
provider roboflow, model waste-classifier-psdrg-0mtyc/1, raw label E-Waste,
confidence0.8669, normalized e_waste. A separate real-board MQTT **disabled**
outcome persisted at15:33:27.938669Z (simulated=false). No actuator moved.
This is a functionality check, not a classification-accuracy claim.

Follow-up status confirmed one capture attempt, budget0, automatic capture off,
matching last_event_id and disabled_outcome_broker_ack=true. API follow-up found
exactly one new event. This verifies the one-capture budget; the native detector
tests separately cover held-object latching. A second physical arrival cycle
and extended network reliability checks have not been performed. The camera
was left disarmed with distance sensing on. Private event evidence:
`.hardware-backups/inlet-first-classification.json`.

Step8 (servo/mechanism validation) is next; actual servo models, mounting, wiring,
power and travel limits must be established before any movement.

The camera's explicit `inlet-test` (mock) and `inlet-roboflow-test` (live) builds
add an HC-SR04 inlet sensor and password-protected Arduino OTA updates. Other
camera environments retain manual capture. Actuator movement remains disabled.
The monitor continues its separate fill sensing on DevKit GPIO25/26.

## Current verified state

Both inlet builds compile, as do the existing camera-test and roboflow-test
builds after the shared classification refactor. The native inlet detector test
and Python helper lint pass. The live inlet build was USB-flashed successfully
with hash verification. Camera boot confirmed OV3660, PSRAM, MQTT and HTTP readiness.

An initial wireless transfer failed partway through under weak Wi-Fi; the running
application remained usable. After the user moved the camera closer to the router,
an authenticated OTA transfer completed and the camera responded after reboot at
192.168.1.196. Read-only checks and idempotent disarm have bounded transport retries;
arming is never automatically replayed on a timeout.

Real HTTP checks passed: missing/wrong passwords rejected401, missing wiring
confirmation rejected400, authenticated disarm returned200. Post-OTA status
confirmed camera ready, password protection enabled, external sensor disabled,
automatic capture disabled, actuators disabled, and zero capture attempts.
Private diagnostic evidence is in `.hardware-backups/inlet-ota-verification.json`.
No paid inference request or external sensor trigger was issued during this stage.

Next physical action: disconnect USB and external power, remove the USB baseboard,
wire regulated 5 V/common ground and the inlet sensor as below, then power up.
Physical inlet sensing and automatic item classification remain to be verified.

After the user confirmed external power and inlet wiring, both boards had fresh
independent heartbeats. Authenticated detect-only enable succeeded. Real inlet
samples changed from 51.45/37.34/35.64 cm to 18.21/15.22/11.50/9.47 cm as the
user approached with a book, with no classification calls. Near detection
latched waiting-for-clear as expected. Arming was rejected by the combined
camera/MQTT/UTC/outcome readiness check; no automatic inference is claimed yet.
A diagnostic firmware update with individual readiness fields/errors and a
longer OTA receive timeout was built, but repeated wireless uploads failed during
transfer, including a retry after the user improved Wi-Fi positioning.
The previous working application remains installed, with detection disabled by
the failed update attempt. Current firmware installation must be verified before
assuming the new diagnostics are available.
The current diagnostic build compiles in all four camera/inlet provider modes.
It exposes MQTT connection/error/return code, Wi-Fi status/RSSI, UTC synchronization,
pending outcome, free heap and uptime. The user was asked to temporarily reconnect
the camera to the USB baseboard with external power/sensor wiring disconnected
for installation. This physical reconnection and USB upload remain pending.

Subsequently the user reconnected the USB baseboard, and the diagnostic build was
USB-flashed successfully with hash verification. On the observed boot UTC was
initially unsynchronized; at uptime70 seconds status showed camera ready,
MQTT connected (error0/return0), UTC synchronized, and no pending outcome.
These are the current readiness conditions, not proof of the cause of every
earlier rejection. Inlet GPIOs and capture remained disabled after this upload.
The optional DevKit serial relay is documented in [serial-debug.md](serial-debug.md).

A further OTA test with the longer receive timeout sent its payload but timed
out waiting for the final completion response. It is not counted as a passing
update. The pinned framework uploader also has an `except e` typo which masks
that timeout with NameError; the local wrapper now reports that known error as
unconfirmed OTA completion without a traceback. Further OTA tuning is deferred
in favor of USB recovery and the wired diagnostic fallback. No automatic
classification or physical actuator test has run during these recovery checks.
The camera was subsequently recovered by a successful USB flash (hash verified).
Post-recovery status confirmed camera ready, MQTT connected, synchronized UTC,
no pending outcome, RSSI−68dBm, and inlet/automatic capture disabled. Evidence:
`.hardware-backups/camera-recovered-readiness.json`. The DevKit log relay is
installed; physically wiring and verifying relayed camera logs is the next action.

## Prepare while the camera is on its USB baseboard

```sh
cd backend
uv run python ../scripts/camera-control.py configure
cd ..
uv tool run --from platformio pio run -d firmware/esp32-cam -e inlet-roboflow-test -t upload \
  --upload-port /dev/serial/by-id/usb-1a86_USB_Serial-if00-port0
```

The helper creates a random private password in ignored `ota.local.h` (mode0600)
without displaying it. Keep this file to update/control this camera later.
The initial USB flash changes the board's original no-OTA partition layout to
Arduino `min_spiffs.csv`: two 1,966,080-byte application slots on 4 MB flash.
Later OTA updates send only the application image, not the partition table.
The original full-flash backup remains in `.hardware-backups`.

On every boot inlet GPIOs remain uninitialized and automatic capture is off.
GET `/status` reports OTA availability, build, camera, inlet distance/validity,
armed state, remaining capture budget, and latest decision/outcome state.

## External power and sensor wiring

Power off and disconnect USB before removing the baseboard or changing wires.
Use regulated 5 V in parallel to ESP32-CAM's **5V** and DevKit's confirmed **5V**
inputs; connect both grounds to supply ground. Never feed 5 V into 3V3.
The supply's available current must cover both boards and peripherals; its
current rating has not yet been confirmed. Keep wires short and firm.
Use only one power source per board at a time: disconnect external power before
reattaching USB. USB baseboard remains the recovery path if Wi-Fi/OTA fails.

For a standard HC-SR04:

| Sensor | ESP32-CAM connection |
| --- | --- |
| VCC | 5 V supply |
| GND | Common supply/camera ground |
| TRIG | GPIO13 (IO13) |
| ECHO | GPIO14 (IO14), through a suitable divider or level shifter |

For a confirmed 3.3 V-compatible HC-SR04P variant, use 3V3 power for direct GPIO
logic instead. Do not assume 5 V ECHO is safe for an ESP32 input.
GPIO13/14 are reserved for this inlet in these builds; do not use microSD.
GPIO25/26 on the camera board are already used by the onboard camera and cannot
be reused for the external sensor. No servo pins or angles are assigned yet.

## Detect first, then explicitly arm classification

Commands below run from `backend/`; substitute the camera's current LAN IP.
The helper also accepts `--host waste-s11-cam.local` on this computer, where
system mDNS resolution is available.

```sh
uv run python ../scripts/camera-control.py status --host CAMERA_IP
# Only after confirming the actual sensor wiring above:
uv run python ../scripts/camera-control.py enable --host CAMERA_IP --wiring-confirmed
```

`enable` only starts ranging. It does not classify or call Roboflow. Move a book
in/out and inspect `/status` to validate `inlet_distance_cm` and validity.
Then arm one classification:

```sh
uv run python ../scripts/camera-control.py arm --host CAMERA_IP --wiring-confirmed --max-captures 1
```

The inlet must first be clear for three consecutive valid samples at ≥18 cm.
An item then within ≤12 cm for three samples triggers one fresh JPEG upload.
Sampling is every100 ms, echo wait bounded25 ms. Invalid/no echoes never count
as clearance. The 12–18 cm gap provides hysteresis. The same held item cannot
retrigger; clear the inlet before another item. Cooldown is five seconds.
These prototype thresholds can be changed later for the actual inlet geometry.

The arm budget is 1 by default (allowed1–10); attempts consume it even on failure.
The live build issues only one upload attempt per detected arrival, with no
automatic paid retry. Provider mismatch prevents arming/upload. Camera, MQTT,
UTC and pending-outcome checks prevent starting another incomplete cycle.
Every successful decision still reports a separate **disabled** physical outcome
via MQTT; no sorting completion is invented. Manual classification is blocked
while automatic capture is armed. Detection and arming reset on reboot/OTA.

```sh
uv run python ../scripts/camera-control.py disarm --host CAMERA_IP
```

Controls use HTTP Basic authentication with the private OTA password, handled
inside the helper. This is for the existing trusted-LAN prototype, without TLS;
do not expose its HTTP or OTA ports publicly.

## Wi-Fi updates after removing the baseboard

```sh
uv run python ../scripts/camera-control.py update --host CAMERA_IP --environment inlet-roboflow-test
```

This builds the matching environment, disarms inlet capture, and invokes the
framework's OTA uploader in-process with the private password. The password is
not placed in shell arguments, environment variables or logs. The computer must
accept the camera's TCP callback and reach the board's UDP3232 on the same LAN.
Updates need an idle camera: synchronous inference can delay OTA servicing.
If interrupted, reconnect with the USB baseboard to recover. Only use these
OTA-compatible inlet builds for wireless updates.

## Validation

The native detector test covers held objects at arming, near/clear debounce,
missing echoes, hysteresis, cooldown and timer rollover. CI compiles both inlet
provider environments with OTA disabled by the example's empty password.
Before declaring step7 complete, verify physical inlet distances, one arrival
event with a separately persisted outcome, no repeated event while held, and a
second event only after clearance and explicit rearming/budget. No physical
sensor or paid automatic inference test is claimed by compile checks alone.

Sources:

- [Espressif camera wiring](https://github.com/espressif/arduino-esp32/blob/2.0.17/libraries/ESP32/examples/Camera/CameraWebServer/camera_pins.h)
- [Espressif ArduinoOTA example](https://github.com/espressif/arduino-esp32/blob/2.0.17/libraries/ArduinoOTA/examples/BasicOTA/BasicOTA.ino)
- [Espressif development-board power guidance](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html#power-supply-options)
