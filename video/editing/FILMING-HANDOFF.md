> Archived filming brief from the original editing workspace. See [the current project handoff](../../docs/filming-handoff.md) and [video guide](../README.md) for subsequent revisions.

# SWS prototype demo: filming and editing handoff

This is the shared brief for the person filming, editing, narrating or helping as
an agent. Film short separate clips, then assemble them into the sequence below.
Target about 2–3 minutes; durations are edited lengths, not limits on raw footage.

## Recording progress and remaining work

Recorded: introduction, mounted hardware, item-input clips for all three
categories, all three mechanism clips, physical fill-monitoring action, and the
closing shot, plus the synthetic fill-value screen recording. The table below remains
the editing order; do not refilm completed
shots unless you want another take.

Remaining:

- [x] Web monitoring-center walkthrough.
- [ ] ESP32-CAM inlet-triggered still image for each of the three items.
- [ ] Results screen recording with the corresponding scripted database records.
- [x] Synthetic fill-value screen recording: 0 → 10 → 20 → 30 → 40 → 50%, 10 percentage points every second (a five-second ramp).
- [ ] Inference lab only if wanted; optional.

### Prepare the updated backend once

```sh
sudo ./scripts/update-inference-api.sh
```

This builds the API and matching initializer, starts the existing database,
applies additive migrations/location seeding, and updates the API service. Images are stored in the `filming-images` Docker volume;
existing database records remain intact. The demo-bin view must use the updated
frontend code to refresh twice per second (the normal views remain at five seconds).
Use the development frontend from the root guide or rebuild the frontend image.
No new firmware upload is needed for the image/fill helpers.

### Camera images for the three result clips

These are **separately staged stills**, associated with the previous filming motor
records. They are not the original images of those already filmed motor takes and
are not evidence of live model recognition.

1. Disable the station controller with `./scripts/station-auto.sh off`. Wait for
   pending work to finish. Keep auto off throughout the three photo sessions.
2. Clear the inlet with the camera disarmed; keep hands clear. Start one command
   below, then wait for its **READY** line before inserting that category's item.
3. Withdraw hands and leave the item resting for the delayed exposure. The helper
   uses the camera's saved drop thresholds/capture delay. An explicit
   `--capture-delay-ms 800` can be supplied if that tested setting fits the mount.
4. The script saves one retained JPEG, uploads it to the backend, and disarms the
   camera. Remove the item only after it finishes, then repeat for the next item.

```sh
./scripts/film-capture.sh recyclable --auto-disabled-confirmed --empty-confirmed
./scripts/film-capture.sh non_recyclable --auto-disabled-confirmed --empty-confirmed
./scripts/film-capture.sh e_waste --auto-disabled-confirmed --empty-confirmed
```

By default, each command chooses the latest completed provider=`filming` record
for that category in S11's latest 50 events. Use `--event-id UUID` to select a
particular matching take, and `--host PRIVATE_CAMERA_IP` if mDNS is unavailable.
It never runs motors, calls Roboflow, or changes a previous outcome. Do not run
`station-auto on/once` or a second camera helper during a photo session.

Files are copied to ignored `.hardware-backups/filming/captures/`. Each JPEG has a
JSON manifest with the event ID, category, arrival ID and capture timing/status;
backend metadata persists the event association, arrival ID, checksum and save
time. The command prints the browser image URL for viewing/downloading.
Original attachments are not overwritten. Review the photo before using it in
editing; an empty tray or hand-obscured frame is not an accepted item photo.
On upload failure the local image/manifest remain. Do not repeat a motor cycle to
recover an image upload. A new photo take should be associated with an appropriate
new scripted record rather than overwrite an accepted attachment.

### Web monitoring-center recording

Screen-record directly, with slow cursor movements:

1. Overview: select campus or mall, choose a floor, switch 2D/3D, select a bin.
2. Open that bin's detail to show connectivity and compartment readings.
3. Records: select Atrium 1 / S11 and show recyclable, non-recyclable and e-waste
   filming entries. Keep `filming · demo` visible. Use the saved still images as
   editing inserts or open their printed image URLs; the normal Records layout
   is unchanged and does not add an image gallery.
4. Record the synthetic fill sequence below in a separate screen clip.

### Fill-value screen recording: 10% each second

The real sensor action has already been filmed. This helper creates a separate
**Filming demo (synthetic)** bin on campus Level 01 and writes explicitly synthetic
telemetry. It never changes S11 or pretends these values came from its sensor.

```sh
# Prepare a visible demo bin at 0% before starting the screen recording:
./scripts/film-fill.sh --prepare
```

Open `http://localhost:5173/bins/filming-demo`, wait for the 0% reading, then start
screen recording and run:

```sh
./scripts/film-fill.sh
```

The default is recyclable, 0 → 10 → 20 → 30 → 40 → 50%, with one second between
successful updates. Network/request latency can add a little time. The demo bin
and its history poll every 500ms while visible; normal bin views keep their usual
refresh interval. Keep this detail page open in the foreground rather than the
all-bins view when recording the rapid steps. The final value remains 50% and ages
normally; no looping or background publisher stays running.

Options: `--category non_recyclable`, `--category e_waste`, `--end 100`,
`--step 10`, `--interval 1`. For a collection-alert demonstration, use a separate
shot and explain that synthetic demo values are intentionally excluded from real
collection-task counts.

In editing, caption the screen ramp **“Illustrative fill-data demonstration”**.
It illustrates the monitoring UI and is not synchronized measurement evidence
for the earlier physical sensor-action clip.

## Project context: what we are demonstrating

**Smart Waste System (SWS)** combines a sorting mechanism with a web monitoring
center. The intended operators are caretakers and guards: they need to find bins,
see which compartments need collection, check device connectivity and review
sorting/collection records. The purpose is practical operation, not a promotional
landing page or an accuracy benchmark.

The intended automatic flow is:

1. An ultrasonic inlet sensor sees a sudden distance decrease as an item arrives.
2. The ESP32-CAM locks that arrival and retains a delayed, fresh JPEG.
3. The ESP32 DevKit (brain) asks the FastAPI backend to classify that image.
4. The backend calls Roboflow, normalizes its prediction and stores the decision.
5. The brain controls the classifier/chute servo and opener/flap servo, then
   reports a separate outcome. A prediction is not proof that an item dropped.
6. MQTT carries independent board heartbeats and compartment fill readings to a
   worker. PostgreSQL stores readings and records; the dashboard reads the API.

Responsibilities and design choices:

| Part | Responsibility / reason |
| --- | --- |
| ESP32-CAM + inlet sensor | Detect arrival and retain the image associated with that arrival |
| DevKit + two servos | Coordinate sorting and motor timing independently of browser navigation |
| DevKit + fill sensor | Send physical fill telemetry; only one compartment is physically sensed |
| FastAPI + Roboflow | Keep the model integration and API key on the backend; preserve raw labels and normalized decisions |
| MQTT worker + PostgreSQL | Persist telemetry, heartbeats, predictions, outcomes and collection records |
| Vite/React dashboard | Overview with 2D/3D bin locations, Bins detail, Records and an independent Inference lab |

Arrival locks, clear-before-rearm checks, retained-frame checks and restart
journals help avoid duplicate captures and motor replay. The web UI monitors the
station; it does not need to remain open for each firmware-controlled cycle.
See [architecture](/home/shineekuwu/projects/smart-waste-system/docs/architecture.md), [API](/home/shineekuwu/projects/smart-waste-system/docs/api.md), [firmware](/home/shineekuwu/projects/smart-waste-system/firmware/README.md)
and [scripts](/home/shineekuwu/projects/smart-waste-system/scripts/README.md) for implementation details.

## What this video does and does not demonstrate

This filming plan deliberately separates **item insertion**, **scripted motor
movement**, and **record viewing**. It avoids relying on live recognition for
every take, reduces retakes and does not spend Roboflow credits on motor shots.
Use a small caption such as **“Scripted mechanism demonstration”** on these shots.
The distance-change animation explains the design; it is not a measured sensor
trace unless an actual trace was recorded.

The prototype has two calibrated rotation positions, not three independently
reachable compartments. Normal automatic routing is recyclable at home and e-waste
at the side; non-recyclable/Unknown decisions do not actuate. For filming only,
the non-recyclable shot reverses the e-waste motion using the same two positions.
Describe it as a staged routing concept, not evidence of three-way autonomous
sorting. Match temporary compartment labels to the shot, and do not imply all
three destinations were available simultaneously.

Filming records have provider `filming`, model `operator-selected`, no confidence
score, a scripted reason, and `simulated=true`. Motors are physical; the selected
category is scripted. A completed outcome confirms that the firmware command
sequence finished, not an independently sensed successful drop. Visually check it.
These records must remain distinguishable from Roboflow predictions.

Recognition reliability, capture timing on the final mount and fill calibration
remain prototype limitations. They are not prerequisites for filming the staged
motor shots. One fill compartment is physical; the other two remain synthetic.

## Before filming

- [ ] Choose one orientation and keep it consistent (landscape suits a laptop presentation).
- [ ] Stabilize the phone, light the mechanism and clean the camera lens.
- [ ] Disable automatic sorting before placing items or changing the setup.
- [ ] Secure wiring, keep hands clear and support the flap when servo power is off.
- [ ] Prepare representative items; do not use a damaged battery.
- [ ] Close notifications, terminals containing secrets and private configuration files.
- [ ] For scripted cycle records, install the updated backend and brain firmware
  described below. No camera firmware update is required for these clips.

## Scene sequence and action points

Record each row as its own clip. Leave 2–3 seconds still before and after action.

| Clip | Length | Framing | Action / edit cue |
| --- | --- | --- | --- |
| 01 — Introduction | 5–8 s | Wide view of the mounted prototype | Hold a clean view showing the inlet and compartments. Title: “Smart Waste System”. |
| 02 — Mounted hardware | 15–25 s total | Separate closeups | Film every mounted part: inlet sensor, camera, brain, fill sensor, classifier servo, opener servo and power/wiring. Add short component labels and role captions. Film this before unmounting the fill setup. |
| 03 — Web monitoring center | 15–25 s | Direct screen recording | Overview → building/floor filter → 2D/3D preview → select bin → bin details → Records. Show how an operator finds a bin, checks status/fill and reviews activity. Avoid fast cursor movements. |
| 04A — Item input, take A | 4–7 s | Inlet closeup | Drop one item and withdraw the hand. Nothing else needs to run. Add a distance-gap change animation in editing. |
| 04B — Item input, take B | 4–7 s | Same view or alternate angle | Record a second separate insertion clip for the second edited cycle. No sensor/camera trigger script is needed for either input shot. |
| 05 — Recyclable mechanism | 10–15 s | Chute and flap visible | With the item already placed, run the recyclable filming command once. Show release at home and the flap closing. Caption: “Scripted · Recyclable”. |
| 06 — Non-recyclable concept | 10–15 s | Same mechanism view | Run the non-recyclable filming command once: reversed origin/destination from the e-waste sequence. Caption: “Scripted · Non-recyclable routing concept”. |
| 07 — E-waste mechanism | 10–15 s | Same mechanism view | Run the e-waste command once: home → side → release → close → home. Caption: “Scripted · E-waste”. |
| 08 — Results | 10–15 s | Direct Records screen recording | Show the corresponding three filming entries and completed command outcomes. Keep the filming provider label visible. |
| 09 — Fill monitoring | 12–20 s | Separate sensor test setup, then screen | After mounted closeups are done, power down and unmount the brain/sensor as needed for short wires. Restore power/network and show a flat target moving toward the sensor, then the physical compartment value updating on screen. Caption: “Bench demonstration of fill monitoring”. |
| 10 — Inference lab (optional) | 6–10 s | Direct screen recording | Show the image preview and test controls. One deliberate model request is optional and may cost credits; omit this scene if it slows filming. It is separate from the scripted motor scenes. |
| 11 — Closing | 6–10 s | Close view moving out to a wide view | Start near a recognizable mechanism detail, then slowly pull back to the full prototype. Add SWS and the repository link. Record after reassembly, or film this before unmounting for clip 09. |

All three category insertion clips have now been recorded. Pair each with its
matching mechanism clip; the non-recyclable sequence remains a staged routing
concept using the same two physical rotation positions.

## Filming-only motor commands

These commands are implemented in [film-cycle.sh](/home/shineekuwu/projects/smart-waste-system/scripts/film-cycle.sh) and
[film-cycle.py](/home/shineekuwu/projects/smart-waste-system/scripts/film-cycle.py). They use the existing bounded USB motor
controller, not the inlet or camera, and never call `/api/classify` or Roboflow.

**Deployment prerequisite:** the backend needs a rebuild to expose
`POST /api/filming/events`. The brain needs the updated `station` image for
`cycle reverse`; the helper rejects an older image before sending reverse motion.
Follow the [backend guide](/home/shineekuwu/projects/smart-waste-system/backend/README.md) and
[firmware build/upload guide](/home/shineekuwu/projects/smart-waste-system/firmware/README.md). Compilation alone is not a
physical test. These changes have not automatically deployed or flashed anything.

Run from the repository root:

```sh
# Do this BEFORE arranging the item or recording an insertion clip:
./scripts/station-auto.sh off
```

Wait for any active cycle/outcome to finish. The filming helper refuses manual
motion while auto is enabled, busy or has a pending outcome. Opening USB can reset
and home the brain, so leave clearance even before the intended cycle starts.

Start recording, place the item with auto off, withdraw hands, then run ONE command:

```sh
./scripts/film-cycle.sh recyclable --wiring-confirmed --clearance-confirmed
./scripts/film-cycle.sh non_recyclable --wiring-confirmed --clearance-confirmed
./scripts/film-cycle.sh e_waste --wiring-confirmed --clearance-confirmed
```

Do not run all three together. Each invocation is one take and one new record.

| Selected category | Classifier movement | Opener | Ending position |
| --- | --- | --- | --- |
| `recyclable` | 700 → 700 µs | 1800 closed → 700 open → 1800 closed | 700 / 1800 µs |
| `non_recyclable` | 2000 → 700 → 2000 µs | Same closure/release sequence | 2000 / 1800 µs (filming origin) |
| `e_waste` | 700 → 2000 → 700 µs | Same closure/release sequence | 700 / 1800 µs |

The controller closes the flap before positioning the chute, opens only at the
destination, closes before returning and keeps the final pulses commanded.
The reverse cycle temporarily ends at 2000 µs; a following ordinary cycle starts
by closing and homing. Do not confuse this filming origin with the normal 700 µs home.

The helper checks API readiness, creates a labelled filming event, sends one
bounded motor command and posts its outcome only after acknowledged completion.
A local journal under ignored `.hardware-backups/filming/` records the event ID
and uncertainty before motion. An error never automatically repeats motors.
If completion or the outcome request fails, inspect the journal and station state;
do not blindly rerun a take that might already have moved. An incomplete record
can legitimately remain without an outcome.

## Fill monitoring with the short wiring

No dedicated fill firmware/script is needed: the current station firmware already
publishes physical fill readings independently of automatic sorting.

1. Finish the mounted hardware and closing shots before dismantling anything.
2. Disable auto. Switch power off before unmounting the brain and sensor. Secure
   the mechanism and disconnect servo power if relocating the board would pull wires.
3. Keep the sensor's existing wiring/calibration intact; arrange a separate bench
   test position, restore brain power and wait for connectivity.
4. Film a flat target moving closer, hold it steady, then move it farther away.
5. Screen-record the physical compartment's value/history. Allow for telemetry and
   dashboard polling; do not describe this as a sensor installed in its final bin.
6. If useful, inspect readings with the existing read-only diagnostic:

   ```sh
   uv run --directory backend python ../scripts/diagnostics/verify-fill.py --category recyclable
   ```

The current calibration is provisional. Show the change/trend rather than claim
precise volume accuracy, and keep synthetic values visibly distinct.

## File naming and editor handoff

Use names such as `04A-input-take01.mp4`, `05-recyclable-take02.mp4`,
`06-non-recyclable-concept-take01.mp4`, `08-records-screen.mp4` and
`09-fill-bench-take01.mp4`. Keep raw footage outside Git, together with this brief
and the editor project. Record two takes of important actions and review them
before moving the setup.

| Clip / take | Item / event ID or time | Observed action | Best take / edit note |
| --- | --- | --- | --- |
| 05 / 01 | | | |
| 06 / 01 | | | |
| 07 / 01 | | | |

## Editing notes

- Assemble separate insertion and motor clips; match item appearance and framing.
- Keep “Scripted mechanism demonstration” readable during staged actions/results.
- A distance animation can show “empty baseline → nearer object → arrival detected”.
  Use illustrative values or label them illustrative; do not invent measured logs.
- Show complete motor movement in each mechanism take; simple cuts and captions
  are sufficient. Label sped-up waits rather than implying faster real latency.
- Use Records entries from these takes and preserve the `filming` labels.
- Explain the three-category design and two-position prototype limitation briefly.
- Optional lab footage is a separate example of image inference, not the source
  of a scripted category used for motor footage.
- Finish with the close-to-wide pullback. Keep narration/music clear and quiet.
- Check the final export for readable text, correct compartment labels and secrets.

## New smart/IoT feature: cleaner route planning

Keep all completed hardware/mechanism/fill footage. Add a **30–45 second screen
recording** after the web overview, before the closing shot. This connects the
IoT measurements to an operator action: collect only bins that need service and
reduce walking/backtracking. It does not require refilming motors or paid inference.

Setup follows [collection routing](/home/shineekuwu/projects/smart-waste-system/docs/collection-routing.md): run the backend
update helper (which also migrates/seeds with a matching initializer), then start
the frontend. Riverside Complex has8 floors and96 bins;
its route demo uses explicitly synthetic request-only percentages.

Record these actions slowly (separate short clips are fine):

1. Overview → Riverside Complex. Briefly show its eight-floor3D cutaway; select a
   floor to show the12 bins. This establishes why planning is useful at scale.
2. Sidebar → Collection route. Select Riverside Complex, then **Demo fill scenario**.
   Pause on the explicit synthetic label and48 selected stops out of96 bins.
3. Pause on the ID-order baseline, planned travel and calculated savings. These
   are estimates for the same selected stops, not a measured cleaner time trial.
4. Toggle **ID order**, then **Planned** to show the different path/numbering.
5. Keep **Selected leg** on to show the blue direction arrows. Hover a bin to
   show percentages (explicitly synthetic in this scene); click to pin and Escape
   to close. Briefly switch **All legs** to show teal legs and the amber return.
   Change Route floor, select a numbered stop, then Next stop.
   Show that floor changes use the selected elevator/stairs connection.
6. Optionally switch Between floors from Elevator to Stairs to show recalculation,
   or raise Collect at from80% to90%. Return to80% for a consistent final take.
7. Hold the final screen still for3 seconds; stop recording.

Suggested filename: `12-cleaner-route-demo-take01.mp4` (the editor can place it
before the existing closing clip). Caption: **“IoT-driven collection planning ·
synthetic scenario · estimated route”**. Suggested narration:

> Fill readings identify which bins need collection. SWS groups the work and
> plans a walking circuit through corridors and between floors, helping the
> cleaner avoid unnecessary visits and backtracking.

Keep the heuristic/estimated label visible on the large plan. Do not call its
route a proven global optimum or imply all96 bins have installed hardware.
Small plans can be exact for the modeled graph; real distances, lift waits and
service times still require surveying and measurement.
