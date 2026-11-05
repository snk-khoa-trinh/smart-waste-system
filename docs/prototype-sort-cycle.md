# Two-position sorting prototype

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


Step 8's bench observations were accepted for the prototype: the classifier appeared to span roughly 120 degrees despite nominal commands through 180. This is an observation, not measured calibration. Two positions can be used if the mounted chute reaches the chosen compartments. Three-compartment routing remains unfinished.

Step 9 now has a computer-mediated, one-shot integration path. The first full recyclable/home cycle passed with user confirmation that the item dropped and the flap closed. The user has now selected recyclable/home and e-waste/side for the two-position prototype; a full e-waste side cycle remains to be verified. Do not force the servo shaft/gears to adjust home; use a commanded position or refit a removable horn with power off.

## Data flow

The computer requests `/capture` from the ESP32-CAM, submits that actual JPEG to `/api/classify` as device `s11-cam`, selects one of two explicitly configured categories, and sends one USB command to the DevKit. The DevKit runs a timer-driven cycle, returns home, and keeps the home holding pulses active. Only after confirmed controller completion does the computer submit `/api/outcomes` with `completed` and `simulated=false`.

This path never calls the camera's `/classify` or arms its automatic classification, which would report a conflicting disabled outcome. The third category and `unknown` produce `disabled` without servo commands. An optional clear-then-near inlet wait uses the camera's sensor readings and triggers only one cycle. A computer and USB connection are required. The standalone DevKit cycle firmware continues to pause fill telemetry and the camera UART log relay.

There is no feedback proving that the flap opened or trash reached the bin. `completed` means the commanded PWM sequence finished. The cycle does not establish classification accuracy or mechanical routing accuracy.

## Mechanism positions still need verification

Signals stay on DevKit GPIO27 (classifier) and GPIO33 (opener), with servo power external 5V and shared ground. Keep DevKit powered by USB only when using USB control.

After manual pulse testing, the user selected classifier home/recyclable at **700us** and side/e-waste at **2000us**. The user tested `./scripts/test-opener.sh 1800 700` and selected **1800us closed/home / 700us open** for the opener. These are working pulse settings; actual physical angles and full-cycle alignment remain unmeasured. Earlier 1000us classifier-home and 1333us/1000us opener notes below are historical.

The updated pulse plan in `firmware/common/servo_plan.h` is:

| Phase | Classifier pulse | Opener pulse | Hold |
| --- | --- | --- | --- |
| Close flap | No drive; no rotation commanded | 1800us closed | 1s |
| Initialize home | 700us home | 1800us closed | 1s |
| Position chute | 700us home or 2000us side | 1800us closed | 2s |
| Open flap | Chosen route | 700us open | 2s |
| Close flap | Chosen route | 1800us closed | 1s |
| Return home | 700us | 1800us closed | 1s |

After completion, classifier PWM stays at700us and opener PWM stays at1800us. There is no additional neutral command or detach. The calibrated pulses have been selected by the user. The first phase drives only the opener closed; classifier PWM is off until that closure interval ends. The opener is mounted on the rotating chute, so its closed/open commands are the same for either route. No position feedback confirms actual closure. Adjust the plan and rebuild if mounted alignment differs. No 240-degree travel is claimed.

## Commands after mounted positions are verified

Build/upload the updated `servo-bench` environment only after the mounting review:

```sh
uv tool run --from platformio pio run -d firmware/esp32-monitor -e servo-bench -t upload
```

A manual mechanical cycle (no image, inference or backend outcome):

```sh
uv tool run --from platformio python scripts/servo-usb.py cycle --route home --wiring-confirmed --clearance-confirmed
```

For the current recyclable/home and e-waste/side mapping:

```sh
uv run --directory backend python ../scripts/sort-prototype.py \
  --camera-host waste-s11-cam.local \
  --home-category recyclable --side-category e_waste \
  --provider roboflow --actuate --wiring-confirmed --positions-confirmed
```

Add `--wait-for-inlet` for one clear-then-near triggered cycle. Without `--actuate`, this still calls the configured inference provider, records a disabled outcome, and sends no servo commands. The camera IP may change with DHCP. The physical alignment still needs a successful mounted cycle test.

Each invocation writes a private journal under ignored `.hardware-backups/sort-cycles/`. Motion is marked requested before USB transmission. Unknown completion is recorded as `motion_unconfirmed` and is never automatically replayed or reported completed. If an outcome request fails after movement, inspect the event/journal and retry only the outcome report; do not rerun the physical cycle.

## Validation

The portable C++ plan checks verify both route sequences, flap closure before return, pulse bounds and the updated eight-second cycle duration. Six Python bridge tests cover both category routes, unknown/unsupported rejection, pending camera outcomes, journal-before-motion ordering and no replay after an ambiguous USB result. Firmware compilation and these software checks do not establish physical sorting success.

### First mounted home command

After the user clarified the mounted positions, the updated DevKit firmware was built, USB-flashed with verification, and sent exactly one `cycle home`. All five phases completed in seven seconds; the controller reported `sorting_route=home`, `servo_bench_completed=1`, `servo_bench_active=false`, no error, and PWM off. This was a manual mechanism test without inference or a backend outcome. User observation is still required before testing the side route. Both board bench environments compile, and the C++ cycle checks plus six host bridge tests pass.

The readiness check in the same session returned HTTP503 from the backend and a connection error at the last known camera address 192.168.1.199. The live classification-to-movement test remains pending recovery of those services.

### Separate home and closed-position check

The user did not observe the first home cycle; it is not physically validated. At their request, the USB bench supports separate fixed five-second holds for classifier home (1000us, previous nominal 0 command) and opener closed (1333us, nominal 60 command). Each hold switches PWM off after five seconds. Neither command opens the flap or triggers inference. Use `hold --servo classifier --pulse-us 1000` and `hold --servo opener --pulse-us 1333` with the existing wiring/clearance confirmation flags. Command labels are not measured physical angles. Power off before refitting a removable horn; do not force the powered shaft or servo gears.

For a classifier-only home → observed ~120-degree side → home sequence, run `./scripts/test-classifier-home-side.sh`. It now sends 700us, 2000us, then 700us holds (0.75s home, 5s side), with PWM off between commands. It never commands the opener, never opens the flap, and stops on the first unconfirmed command. The 2000us side target is the previous nominal 180 command selected by the user. It requires the updated `servo-bench` firmware allowing the 2000us hold; no physical angle measurement is implied.

### Lower-home calibration in progress

1000us is a provisional command reference, not a verified mechanical endpoint. The next classifier-only diagnostic permits exactly 975us for 750ms, then PWM off. All previous fixed holds retain five seconds. The firmware and USB helper reject the 975us check on the opener, and 950us remains unsupported until the first extension is observed. The routing cycle remains at its existing 1000us home; it is not automatically changed by this diagnostic. No absolute endpoint or additional travel is established by a successful controller response.

### Adjustable classifier-only pulse command

`./scripts/classifier-pulse.sh 900` accepts any integer pulse from 700 through 2000 microseconds, including intermediate values such as 850. This supersedes the earlier discrete endpoint whitelist. It sends only one classifier hold; it does not move the opener, run a sweep, or return home automatically. Previously used reference pulses (1000, 1333, 1400, 1500, 1600, 2000) hold five seconds; other values hold 750ms. PWM then stops. These software bounds are not measured mechanical limits: stop testing if the mechanism binds, buzzes hard, or stops gaining travel. Firmware rejects sub-1000us commands on the opener. No endpoint movement tests were run while adding this adjustable script.


### Selected routing pulse update

The cycle and classifier-only home/side/home script now use 700us home and 2000us side. This configuration update does not run movement tests. The cycle still closes the flap before driving the classifier, closes it again before returning home, and stops both PWM outputs at completion. Home is held longer during a full seven-second cycle than in the short manual pulse check; watch for strain during the mounted cycle test. Controller status exposes all four selected pulse settings for verification without commanding motion.

### Side-cycle controller check with selected settings

The user confirmed the classifier-only 700→2000→700 sequence works. One full `cycle side` was then sent: opener closed at 1333us with classifier off for 1s, classifier2000/opener1333 for 2s, classifier2000/opener1000 for 2s, classifier2000/opener1333 for 1s, classifier700/opener1333 for 1s, then both PWM outputs off. The controller completed all five phases without error; visual confirmation of the combined mounted cycle is pending.

The camera was rediscovered through `waste-s11-cam.local` at **192.168.1.207** (MAC04:b2:47:98:ca:cc). `/status` returned camera_ready=true, automatic_capture=false, outcome_pending=false, actuators_enabled=false, inlet_enabled=false, MQTT disconnected, RSSI−64. The old .199 address is stale. Backend `/api/ready` still returns503 “Database or migrations unavailable.” Direct Docker inspection was denied; passwordless sudo also required interactive authentication. Container status from the user's local terminal is needed to diagnose the database before the classification-to-motion test.

### Opener adjustment script

The combined side cycle requires flap adjustment according to the user; it is not physically validated. `./scripts/test-opener.sh HOME_US OPEN_US` tests GPIO33 only in the sequence closed/home → open → closed/home. Both pulse inputs are validated as integers from 700 through 2000 before any movement. Example with the selected positions: `./scripts/test-opener.sh 1800 700`. Firmware and helper now permit this entire pulse interval for the opener, superseding the previous sub-1000us restriction. The script stops on the first failed or unconfirmed command. Reference pulses hold five seconds; others hold 750ms, with PWM off after each command. It does not save the inputs into the sorting cycle; report the working pair before updating production cycle settings. The classifier is untouched.

The supplied Docker status shows db, broker, and frontend stopped, while api and worker are running unhealthy. Restart the existing containers with `sudo docker compose start db broker frontend`, then `sudo docker compose restart api worker`. This preserves the currently installed inference configuration, broker credentials, and database volume. No simulator start is needed. Interactive sudo authentication is still required from the user's terminal.


### Selected opener positions

The user reports `./scripts/test-opener.sh 1800 700` fits the mechanism best. The sorting cycle now closes at 1800us and opens at 700us on GPIO33. Classifier home/recyclable remains 700us and side/non-recyclable remains 2000us on GPIO27. This supersedes the earlier opener 1333us/1000us settings. The individual opener calibration is user-confirmed; a combined sorting cycle with the new pair still needs physical validation. Updating firmware does not initiate movement.

### First complete recyclable cycle — passed

On 2026-11-02, the camera at192.168.1.207 recovered after reset and the backend was ready with Roboflow. The first inlet wait stopped after an HTTP status read timeout, before classification or motion. The host wait now retries read-only transport failures up to three consecutive failures and requires a fresh clear inlet after each gap; it does not retry capture, inference or motion. Eight host bridge tests pass, including interruption/re-clear and repeated-timeout behavior.

The retry observed a clear inlet around39–40cm, then the item around7.5cm. It captured a JPEG, submitted real Roboflow inference, selected the recyclable/home route, completed the five-phase DevKit cycle with classifier700us and opener1800us closed/700us open, and persisted the separate completed outcome. Both PWM outputs were off at completion. The host process exited; no repeat cycle is armed.

Verified backend event: `6e86fde9-5092-4b4a-a752-16b4a4e6633d`, created `2026-11-02T11:22:05.819881Z`, raw label `Recyclable`, normalized `recyclable`, confidence0.7669, provider`roboflow`, model`waste-classifier-psdrg-0mtyc/1`, outcome`completed` at`2026-11-02T11:22:13.788101Z`, simulated=false. The private host journal is `.hardware-backups/sort-cycles/6e86fde9-5092-4b4a-a752-16b4a4e6633d.json`.

The user explicitly confirmed the item dropped into the recyclable compartment and the flap closed. This validates one computer-mediated recyclable cycle. The non-recyclable route still needs its own full classification-to-drop test using the final opener settings. Standalone operation, three-compartment routing, fill telemetry during USB bench mode, measured bin calibration, and broader classifier accuracy are not established by this test.

### Repeat the full test independently

From the project root, run `./scripts/test-full-sequence.sh`. It uses camera hostname `waste-s11-cam.local`; if hostname resolution fails, pass the current camera IP, for example `./scripts/test-full-sequence.sh 192.168.1.207`. Keep the backend and camera powered, DevKit connected to USB, and servo power/grounds as tested. The laptop runs the bridge throughout the cycle.

Keep the inlet clear until the terminal prints `ready=True`, then insert one item 5–10cm in front of the inlet sensor and in camera view. Keep hands clear of moving parts. The terminal reports capture, inference decision, route, controller completion, and persisted outcome. Each invocation handles only one item and exits. Recyclable maps to classifier700us, e-waste to2000us, opener closed1800us/open700us. Non-recyclable/unknown does not actuate. This uses real Roboflow inference; the selected route follows the prediction rather than an operator-forced label. To test the other route, use an appropriate sample and inspect the returned decision.

If the camera drops out, read-only status polling tolerates brief interruptions and requires clear inlet again. It does not automatically replay capture, inference or movement. If completion is ambiguous, inspect the private journal before running another invocation. Ctrl+C can stop the host wait; an already-started DevKit cycle has its own bounded timer, so cut servo power if the mechanism binds.

The repeat script allows 300 seconds for the inlet wait to accommodate slow camera replies; direct Python usage retains a120-second default and accepts `--inlet-timeout 30..600`. It prints progress at capture, JPEG receipt, inference decision, and motion start. Hold the sample near the inlet until JPEG receipt, then keep hands clear. The first non-recyclable attempt timed out before capture after seeing only two near HTTP observations; no event or motion was issued in that attempt.

### Second full test — rejection path verified

The longer-wait retry received a4380-byte camera JPEG after a clear-to-near inlet transition. Roboflow returned raw `Recyclable` at confidence0.4028, below the configured threshold, normalized to`unknown`. No USB motion command was sent. Verified event`848f4308-8ff5-4f59-9654-8f43ed305830` persisted outcome`disabled`, simulated=false, at`2026-11-02T11:30:23.659894Z`. The host exited normally. This is a successful rejection-path check, not a non-recyclable sorting pass; the non-recyclable full route remains unverified. Classification thresholds were not changed. The repeat script is `scripts/test-full-sequence.sh`.


### Current two-category prototype mapping

At the user's request, `scripts/test-full-sequence.sh` now runs recyclable→home700us and e_waste→side2000us. Non-recyclable and unknown predictions report disabled without movement. Use the side compartment as the e-waste compartment for this prototype. Existing inference labels and backend events keep their real categories; e-waste is not relabeled as non-recyclable. Opener settings remain closed1800us/open700us. This changes the host routing arguments only; no firmware upload or movement test is needed to apply the selection. Earlier non-recyclable side-test notes above are historical.


### Hold calibrated home at startup and completion

The user observed additional flap movement after the cycle ended. The previous firmware stopped PWM after commanding the final home positions; that releases the holding signal and could allow mechanical movement. It did not intentionally command a1000us opener neutral after completion.

The DevKit now explicitly homes on boot: opener1800us with classifier undriven for1s, then classifier700us/opener1800us for1s. It keeps those PWM values active while idle. Every sorting cycle now closes, initializes classifier home, selects route, opens, closes, and returns home (eight seconds total). Completion marks the sequence inactive while preserving final700/1800us duties. Existing initialized LEDC channels/timer are reused between commands, avoiding duty resets on each new cycle. USB probing waits for startup homing to finish before proceeding. The camera firmware's own setup still does not initialize servos automatically.

Status distinguishes `servo_bench_active` (sequence in progress) from `actuators_enabled` (PWM currently active), exposes `servo_holding_home`, `classifier_command_us` and `opener_command_us`, and lets the USB helper verify home pulses before reporting cycle success. The explicit `stop` command and fault handling release both outputs. Manual calibration tests retain their bounded PWM-off finish; use a full cycle or reboot afterward to restore idle holding. No physical angle feedback is present, and holding cannot be maintained while power is off or the MCU is in reset.


Startup homing was USB-flashed and verified from real DevKit status: classifier_command_us700, opener_command_us1800, servo_holding_home=true, sequence inactive, PWM active, no error. One manual side cycle then completed all six phases in eight seconds and retained the same700/1800us commands with servo_holding_home=true. The user confirmed the flap stayed closed afterward without the previously observed extra movement. Both board bench environments compile, portable phase checks pass, and all11 host bridge tests pass. Calibration scripts may also cause startup homing if opening USB resets the DevKit.
