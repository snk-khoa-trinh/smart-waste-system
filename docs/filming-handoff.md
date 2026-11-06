# SWS demo video: filming handoff

Use this checklist while filming, then give the clips and this document to the
person editing. Short separate recordings are fine: film in a convenient order
and assemble them into the story below.

Target: a 2–3 minute video showing what SWS does, a real sorting cycle, and the
dashboard that supports the operator. Durations below are approximate **edited**
lengths; record longer takes so there is room to cut.

## Before recording

- [ ] Choose landscape or portrait and keep that orientation throughout. For a
  laptop presentation, landscape is a practical default.
- [ ] Clean the camera lens, light the inlet, and stabilize the phone/camera.
- [ ] Secure the wiring and label the recyclable and e-waste compartments.
- [ ] Check that the backend, camera and brain are connected.
- [ ] Confirm the saved arrival image actually contains the inserted item. The
  last local capture delay was 800 ms; its timing on the assembled mount still
  needs an actual-drop acceptance check. See [operation notes](autonomous-station.md).
- [ ] Prepare one recyclable item and one safe e-waste example that the current
  classifier recognizes consistently. Use an intact item, not a damaged battery.
- [ ] Rehearse a complete cycle for each item before filming the final takes.
- [ ] Close notifications and private configuration files before screen recording.
- [ ] Keep demo/synthetic readings distinguishable from physical sensor readings.

## Shot list in final video order

| Clip | Length | Framing / screen | Action to record | Suggested caption |
| --- | --- | --- | --- | --- |
| 01 — Introduction | 5–8 s | Wide view of the complete prototype | Hold the shot steady with the inlet and compartments visible. | Smart Waste System · Automatic sorting and bin monitoring |
| 02 — Hardware | 12–18 s total | Separate closeups of the inlet sensor, camera, DevKit and servos | Record each part for 5–8 seconds. Point to it if useful; keep hands out of moving parts. | Detect arrival → capture image → classify → sort |
| 03 — Operator overview | 10–15 s | Direct dashboard screen recording | Open Overview, select a building/floor, switch 2D/3D, and click a bin to show its details. Move the cursor slowly. | Locate bins and check their status |
| 04 — Recyclable cycle | 20–35 s | Fixed view showing inlet, chute and flap together | Start with an empty inlet. Wait for ready, insert the recyclable item, withdraw hands, and record until the item drops, the flap closes and the chute returns home. | Recyclable → home compartment |
| 05 — E-waste cycle | 20–35 s | Same framing as clip 04 | Repeat with the accepted e-waste item. Show rotation to the side, release, flap closure and return home. | E-waste → side compartment |
| 06 — Recorded result | 8–12 s | Direct screen recording of Records | Select the physical bin and show the entries from clips 04/05, including prediction and motion outcome. | Prediction and sorting outcome recorded separately |
| 07 — Fill monitoring | 10–15 s | Sensor closeup plus matching dashboard recording | Move a flat target closer to the physical fill sensor, hold it steady, then show the updated reading. Allow for telemetry and dashboard refresh time. | Physical sensor reports compartment fill |
| 08 — Inference lab | 8–12 s | Direct screen recording | Select one image, show its preview, run one deliberate classification and show the decision. | Test an image without moving the mechanism |
| 09 — Closing | 5–8 s | Wide prototype shot, optionally followed by the dashboard | Hold a clean final view. Add the project name and repository link during editing. | SWS · Prototype demonstration |

Clips 01, 04, 05 and 06 form the essential story. If time is limited, shorten the
hardware montage and omit the lab demonstration first. Keep full sorting cycles.

## Repeatable sorting take: clips 04 and 05

Run commands from the repository root. These operate the real mechanism and may
make a paid inference request. Only the station controller should control motors
during a take; do not run manual servo tests alongside it.

1. Disable new arrivals before arranging the shot:

   ```sh
   ./scripts/station-auto.sh off
   ```

2. Remove the previous item, leave the inlet empty, and keep hands clear.
3. Start the phone recording. Hold still for 2–3 seconds before the action.
4. Arm one full cycle:

   ```sh
   ./scripts/test-full-sequence.sh
   ```

5. Wait for `waiting_item: ready=True` before inserting the item.
6. Insert one item, withdraw your hand, and let the whole cycle finish.
7. Keep recording for 2–3 seconds after the flap closes and the chute returns home.
8. Check the physical destination and the matching Records entry. Note the time,
   item and take number so the editor can match the recordings.
9. Repeat the command for a new take; one-shot mode ends off after its result.

If the decision is Unknown or unsupported, no movement is expected. Retake after
checking the image/result; do not present that recording as a completed sort.
Use `./scripts/station-auto.sh off` to disable new arrivals after filming. The
`stop` command also releases servo PWM, so support any mechanism that can fall
before using it. Details: [scripts guide](../scripts/README.md).

## What each take must show

- **Sorting:** the real item enters, the mechanism moves, the item drops into the
  intended compartment, the flap closes, and the classifier returns home.
- **Records:** the displayed entry belongs to the filmed run. A prediction alone
  does not prove physical completion.
- **Monitoring:** show the physical sensor-backed compartment; identify synthetic
  values if they remain visible. Calibration is still provisional.
- **Lab:** this is an isolated image test, not a command to sort an item.

Keep an uninterrupted raw recording of each successful sorting cycle. Edited
closeups can accompany it, but preserve enough continuity to understand the action.

## Recording and file handoff

- Record at least two takes of the important actions. Watch each back before
  changing the setup.
- Use the same orientation, lighting and camera position for both sorting takes.
- Record dashboard footage directly on the computer for readable text. Keep the
  phone footage for physical actions.
- Leave 2–3 seconds still at the start and end of every clip.
- Record voice-over later if live room noise makes explanation difficult.
- Store footage outside the repository or in ignored local storage. Do not add
  raw videos, private snapshots or credentials to Git.

Suggested filenames:

```text
01-intro-take01.mp4
02-camera-closeup-take01.mp4
02-brain-closeup-take01.mp4
03-overview-screen-take01.mp4
04-recyclable-full-cycle-take01.mp4
05-ewaste-full-cycle-take01.mp4
06-records-screen-take01.mp4
07-fill-sensor-take01.mp4
07-fill-dashboard-take01.mp4
08-inference-lab-screen-take01.mp4
09-closing-take01.mp4
```

Keep a small take log next to the footage:

| Clip / take | Item / event time | Result | Best take? / edit note |
| --- | --- | --- | --- |
| 04 / 01 | | | |
| 05 / 01 | | | |

## Editing checklist

- [ ] Assemble the clips in the shot-list order; trim unused setup time.
- [ ] Use simple cuts and short captions. Add arrows only where they clarify an
  inlet, compartment or dashboard value.
- [ ] Show the complete action at normal speed at least once. Label any shortened
  or sped-up waiting period; do not imply an edited wait is the actual latency.
- [ ] Match dashboard results to the physical run rather than a different take.
- [ ] Keep music quiet enough to hear narration; optional music is sufficient.
- [ ] Add a brief limitations caption: two sorting positions, one physical fill
  sensor, provisional calibration, recognition dependent on the current model.
- [ ] Review the export for readable text, correct labels and exposed secrets.
- [ ] Keep original clips and the editing project alongside the final export.
