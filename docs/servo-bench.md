# Step 8: identify and test the two servos

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


Current DevKit behavior has advanced beyond this identification history: it now homes on boot and holds classifier700us/opener1800us after sorting cycles. See [current sorting cycle](prototype-sort-cycle.md). Earlier no-boot-motion/PWM-off descriptions below refer to the original identification firmware.

The user has two SG90-labelled servos, initially wired to camera GPIO12
(classifier) and GPIO15 (opener), with external5V and common ground. The user
confirmed they are free to turn. Exact servo type/travel still needs observation;
TowerPro sells an ordinary positional SG90 and a separate continuous-rotation
SG90. Never assume that a 360° label provides absolute angle positioning.

## Current isolated USB test

Camera connectivity became unreliable again before installing the bench build.
For servo identification the user moved only the signals to DevKit GPIO27
(classifier) and GPIO33 (opener). Servo power stays on the external5V supply;
DevKit power is USB only, with shared ground. The existing fill/debug firmware
is preserved in source and can be restored after this test.

The DevKit standalone `servo-bench` firmware compiled, was USB-flashed with
hash verification, and booted with no active output. It runs no Wi-Fi,
classification or fill reporting; dashboard readings can become stale during
this bench session. The camera's installed inlet firmware is unchanged.

The first explicit classifier test completed with selected=classifier, phase5,
completed1, active=false and no controller error. The user could not clearly see
that original2.8-second sequence and requested slower60/120-degree targets.
They also clarified that the final classifier mechanism requires **±120 degrees
from center (240 degrees total)**; the current small-angle test does not validate
that travel or establish that an SG90 can provide it.

The revised firmware was USB-flashed/hash-verified. The slower classifier
sequence finished at phase4 after8seconds; opener finished at phase3 after5seconds.
Both reported active=false, completed1 and no controller error. Actual motor
behavior/type still needs the user's visual observations. Nominal angle commands
are not measured positions and no position feedback exists.

The user subsequently reported a small initial move followed by further spinning
on both servos; that observation was inconclusive because the test changed targets.
A fixed-pulse diagnostic was added to avoid that ambiguity. USB `hold classifier
1500` completed one constant1500µs command for5seconds, then PWM off, without
controller errors. The user observed it moved once and settled. This is consistent
with a positional servo but also possible at a continuous servo's neutral point.
A follow-up fixed1600µs hold on GPIO27 also completed for5seconds with no
controller error and PWM off afterward. The user again observed one movement
then holding, consistent with a positional classifier servo, not continuous
rotation. Its full travel remains unverified. A fixed1600µs hold on GPIO33 opener
also completed without error/PWM left on; the user observed one move then holding.
Both servos therefore behave consistently with position control in these tests.
Neither was observed rotating continuously under the off-neutral fixed pulse.
This does not certify the manufacturer, maximum angle range, torque or mechanism.
These raw
pulses assert no calibrated angle. No240-degree travel test has been commanded
or verified.

## Bounded sequence

The shared controller uses classic ESP32 LEDC high-speed timer2, channels6/7,
50Hz and16-bit duty. In the optional camera build this avoids the onboard
camera's XCLK timer0/channel0. No servo GPIO is initialized at boot.

One explicit command runs one selected motor. The provisional mapping is
1000..2000µs for0..180 nominal degrees, not calibrated travel:

| Motor | Sequence (nominal degrees / hold) | Total |
| --- | --- | --- |
| Classifier GPIO27 | 90/1s → 60/3s → 120/3s → 90/1s → PWM off | 8s |
| Opener GPIO33 | 90/1s → 60/3s → 90/1s → PWM off | 5s |

The corresponding pulses are1500µs (90),1333µs (60) and1666µs (120).
An `esp_timer` task advances the bounded sequence independently of the
Arduino HTTP/serial loop, then stops PWM. Only one motor can run at a time.
No angle360 command, full-range sweep, automatic sorting, or inference request
is sent. The host sends a motion command exactly once and does not replay it
on an ambiguous response. A `stop` command stops PWM immediately.

1500µs is only a conventional neutral: a continuous servo may need trim and
may drift. PWM off is not a guaranteed mechanical stop for every servo variant;
switch off external servo power if it keeps turning, binds or buzzes hard.
Do not force the horn by hand or test an unvalidated mounted mechanism.

## Repeatable commands

Run from the repository root:

```sh
uv tool run --from platformio pio run -d firmware/esp32-monitor -e servo-bench -t upload \
  --upload-port /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0
uv tool run --from platformio python scripts/servo-usb.py status
uv tool run --from platformio python scripts/servo-usb.py test --servo classifier --wiring-confirmed --clearance-confirmed
uv tool run --from platformio python scripts/servo-usb.py test --servo opener --wiring-confirmed --clearance-confirmed
uv tool run --from platformio python scripts/servo-usb.py hold --servo classifier --pulse-us 1500 --wiring-confirmed --clearance-confirmed
uv tool run --from platformio python scripts/servo-usb.py stop
```

Observe whether each3-second segment produces a quick positional move then a hold,
or sustained rotation which changes direction with pulse width. No movement or
buzzing is inconclusive: inspect power/wiring before another motion command.
These observations identify behavior; they do not calibrate full travel or
prove a usable sorting mechanism. Continuous rotation needs a different
positioning strategy from an angle servo before routing among compartments.
The native plan test checks pulse bounds, return to nominal center, three-second
target holds, required60/120 classifier targets, opener60-only target and total
duration no longer than8seconds. Both USB and camera bench variants compiled.

The USB `hold` command allows only1400/1500/1600µs, fixed for5seconds, with no
target transitions. It is useful for distinguishing sustained rotation from
position settling. Constant1500µs may still move a positional servo to center,
or drift on an untrimmed continuous servo; an observation is required before
choosing further diagnostic pulses. The native plan test checks those fixed
pulse bounds and the5-second deadline as well.

## Optional camera bench build

Camera `servo-bench` compiled using user-selected GPIO12/15. It has authenticated
`POST /servo/test` and `/servo/stop`, with explicit wiring/clearance flags. It is
not installed or physically tested. All automatic capture/classification routes
are blocked in that build, and outputs start off. `camera-control.py` supports
`servo-test`, `servo-stop`, and updating the explicit `servo-bench` environment.
The camera remains on its prior inlet firmware during USB identification.

GPIO12 is a flash-voltage strapping pin, and GPIO15 also has a boot-strapping
role. If servo loading causes a camera boot problem, power down and disconnect
that signal for diagnosis; do not burn eFuses to bypass the issue. Final camera
servo assignments, travel and power qualification are pending.

## Restore the monitor after bench testing

Power servos off, disconnect their temporary DevKit signals, then:

```sh
uv tool run --from platformio pio run -d firmware/esp32-monitor -e fill-debug-test -t upload \
  --upload-port /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0
```

The physical fill sensor onGPIO25/26 and camera debug RX2/GPIO16 resume.
Keep automatic sorting disabled until servo types, mechanism limits and final
power/wiring are established.

Sources:

- [TowerPro SG90 specifications](https://towerpro.com.tw/product/sg90-7/)
- [TowerPro SG90 continuous-rotation variant](https://towerpro.com.tw/product/sg90-360-degree-continuous-rotation-servo/)
- [Espressif GPIO12 strapping behavior](https://docs.espressif.com/projects/esp-idf/en/v4.3.6/esp32/api-reference/peripherals/sd_pullup_requirements.html)
- [Espressif LEDC timers and channels](https://docs.espressif.com/projects/esp-idf/en/v4.4.8/esp32/api-reference/peripherals/ledc.html)

### USB classifier endpoint sweep

Run `uv tool run --from platformio python scripts/servo-usb.py sweep --servo classifier --wiring-confirmed --clearance-confirmed` with the classifier signal on DevKit GPIO27, external servo 5V, common ground, and the mechanism free to turn.

The one-shot sequence uses provisional targets 0, 30, 60, 120, 150, 180, then 90 (center), followed by PWM off. Intermediate positions hold for 2.5 seconds; 0 and 180 hold for 0.75 seconds each, and the final center holds for one second. Total: 12.5 seconds. The opener on GPIO33 receives no command. Cut external servo power if the mechanism binds or buzzes hard.

These labels map 1000–2000 microseconds to nominal 0–180 degrees; actual angles and mechanical limits remain unmeasured. This sweep does not send 210 or 240 degree targets, which would extrapolate outside this provisional pulse envelope. Completing the controller sequence proves only that the commands finished and PWM stopped. Visual observation is needed to assess motion; angle measurements or manufacturer specifications are needed to establish travel.

### Prototype acceptance after sweep

The user observed that nominal 180 appeared similar to about 120 degrees of actual travel and accepted approximately 120 degrees total for a two-position prototype. Actual travel is not measured. Step 8 bench identification is accepted with this limitation; three-compartment routing and mounted alignment remain unverified. See [prototype sorting cycle](prototype-sort-cycle.md) for the prepared step 9 integration and its prerequisites.
