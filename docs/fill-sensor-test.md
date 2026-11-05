# Step 6: one real fill sensor

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


## Current prototype result

The temporary 20 cm empty / 5 cm full configuration was flashed successfully.
`verify-fill.py --category recyclable` passed with a fresh, valid physical reading
of 56.4% at 2026-11-01T14:13:31.643079Z. Subsequent readings changed to 0.0%
at 14:13:41.658526Z and remained fresh, verifying that changing distance updates
persisted percentages. Other compartments remain explicitly simulated.
Basic sensor→MQTT→worker→database→API functionality passes. Real bin calibration,
precision checks and a physical missing-echo test remain deferred/unverified;
0% is a valid echo at or beyond the temporary empty distance, not a timeout.

## Earlier setup and checks

Status: user selected standard HC-SR04 with ECHO divider/level shifting, TRIG D25,
ECHO D26, VCC 5 V and shared GND. Monitor fill-test was flashed and verified;
serial reports 5/5 valid echoes around 54–55 cm. Calibration and persisted sensor
telemetry validation are pending. MQTT connection was rejected with return code 5
(not authorized); run `sudo ./scripts/repair-hardware-broker.sh` to restore the
existing hardware credentials/ACLs without changing API inference settings.
With the user holding a book in front of the sensor, subsequent serial samples
changed to 16.62, 18.59, 17.28 and 16.64 cm, each with 5/5 usable echoes.
This confirms response to a nearby target, not measured-distance accuracy or
empty/full calibration. MQTT still returned not authorized during this check.
After the user ran the broker repair, `verify-fill.py --category recyclable
--quality invalid` passed: a fresh physical monitor reading persisted at
2026-11-01T14:10:08.274217Z with sensor source and invalid/null (uncalibrated),
while both other compartments had fresh simulated readings. Monitor heartbeat
was online. Calibration, valid percentages and missing-echo validation remain.
The user deferred measured bin dimensions and precision checks. The local test
configuration now uses a provisional 20 cm empty / 5 cm full range for functional
demonstration. These are assumed test distances, not measured bin calibration;
replace them when the actual bin dimensions are available. No ruler is required
to check that approaching targets increase fullness and receding targets reduce it.
Image/model accuracy work is
deferred; steps 7 (inlet trigger), 8 (servos) and 9 (complete cycle) follow this step.

Preparation checks: monitor provisional/network-test/fill-test compile, including
a temporary compile-only configured sensor fixture, and camera roboflow-test
compile passed. The compile fixture was removed; the later user-confirmed wiring
was configured locally and uploaded successfully (flash hash verified). Python helper
lint and CLI checks passed. API readiness initially returned 503, but subsequently
returned ready after the user restored services.

Use the DevKit monitor, not the camera board. Its existing per-device MQTT
credentials and station s11 identity remain unchanged. No backend migration is
needed: the existing contract accepts sensor/simulated sources and valid/invalid/
missing quality. The camera can keep running independently.

## Confirm hardware before uploading

The user initially identified the sensor as HC-SR04P, then selected standard
HC-SR04 with level shifting. For a low-voltage variant, use it from
the DevKit's 3V3 supply for direct GPIO connections; the P suffix does not by
itself establish safe ECHO levels when powered from 5 V. Proposed connections
for a P variant are VCC→3V3, GND→GND, TRIG→D25 and ECHO→D26.
For the user's selected standard module, VCC→5 V and ECHO must pass through
the divider/level shifter before D26. First physical compartment defaults to recyclable. Disconnect power
before changing wiring.

The HC-SR04 specification uses a 5 V supply and a 10 microsecond trigger pulse.
Use an appropriate divider or level shifter on ECHO; never connect a 5 V ECHO
directly to an ESP32 input. Share ground. Confirm the DevKit supply pin before
connecting power. Sources:

- [HC-SR04P supplier specifications: direct GPIO use with 3.3 V power](https://shop.4tronix.co.uk/products/hc-sr04p-low-voltage-ultrasonic-distance-sensor)
- [HC-SR04 module datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)
- [ESP32-WROOM electrical specifications](https://documentation.espressif.com/esp32-wroom-32_datasheet_en.html)

## Configure and build

Copy `firmware/esp32-monitor/include/fill.example.h` to `fill.local.h` in the same
directory. This ignored file has no credentials. After checking wiring, set the
confirmed TRIG/ECHO GPIOs, category index and `FILL_WIRING_CONFIRMED=1`.
The default remains disarmed: no GPIO initialization and no fill messages.

First leave calibration values zero and inspect serial distance readings. Hold
a flat target in front of the sensor at measured distances. Firmware takes five
samples at least 70 ms apart every five seconds, accepts at least three echoes
in the module's 2–400 cm range and uses their median. Each echo wait is bounded
to 25 ms. Serial logs distance and calibration state without credentials.

Measure sensor-to-bottom distance for `FILL_EMPTY_CM` and sensor-to-intended-full
surface for `FILL_FULL_CM`; full must be at least 2 cm, empty greater than full
and no greater than 400 cm. Set those values and rebuild/upload. These are
installation measurements, not model/image-quality tuning.

```sh
uv tool run --from platformio pio run -d firmware/esp32-monitor -e fill-test
# Only after wiring confirmation:
uv tool run --from platformio pio run -d firmware/esp32-monitor -e fill-test -t upload \
  --upload-port /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0
```

Fullness = `100 * (empty_distance - measured_distance) / (empty_distance - full_distance)`,
bounded to 0–100. This estimates height, not waste volume. Insufficient echoes
publish `source=sensor, quality=missing, fill_percentage=null`; a reliable distance
without calibration publishes invalid/null. A timeout never invents 0% or 100%.
The other two compartments continue publishing explicitly simulated values.

## Acceptance check

Keep the hardware stack and worker running, with the simulator stopped. First
check `curl -fsS http://localhost:8000/api/ready`. If it fails, inspect database/API
logs before treating sensor results as an integration failure.

For the chosen category, run the helper with a flat target at the empty,
midpoint and full distances; expected fill should be approximately 0, 50 and
100 respectively. Example only (replace category with the chosen compartment):

```sh
cd backend
uv run python ../scripts/diagnostics/verify-fill.py --category recyclable --expected-fill 0
uv run python ../scripts/diagnostics/verify-fill.py --category recyclable --expected-fill 50
uv run python ../scripts/diagnostics/verify-fill.py --category recyclable --expected-fill 100
# Remove the target so there is no usable echo within range:
uv run python ../scripts/diagnostics/verify-fill.py --category recyclable --quality missing
```

The helper requires a new persisted reading after it starts and fresh simulated
values for the other two compartments. Finally check the dashboard sensor label
and updates. Step 6 is complete only after physical movement changes persisted
fill and a failed echo clears the reading to null. No servo movement is involved.
