# Smart Waste System: narration recording script

This narration explains the purpose of the project: connecting waste separation at disposal with information that helps caretakers plan collection. Hardware names remain in the on-screen labels; the voice explains how the parts work together and why the features matter. Benefits are design goals, not measured deployment results.

[Video guide](README.md) · [Project overview](../README.md)

## Timeline and proposed changes

The saved `SWS-demo.kdenlive` timeline inspected on 18 November 2026 is **03:02:26**, at **1920 × 1080, 30 fps**. The Kdenlive file has not been changed. Source titles, clip placement, and result screenshots were inspected; this is not a full playback or audio review.

**The recording cues below assume these three proposed extensions:**

- Prototype reveal: **5 → 12 seconds**, adding 7 seconds for the purpose of the system.
- Current limitations: **6.5 → 9 seconds**, adding 2.5 seconds.
- Next steps: **6.5 → 9 seconds**, adding 2.5 seconds.

The resulting target duration is **03:14:26** (194.87 seconds), 12 seconds longer than the saved edit. All other scene lengths stay the same. Use spare source footage or a still hold for the extensions, then realign titles and the music ending. These revised times are proposed edit targets, not the current saved timeline.

Timecodes use **minutes:seconds:frames**, not decimal seconds. End boundaries are exclusive.

Target durations in parentheses use **seconds:frames** at 30 fps; for example, **3.53s (03:16)** means 3 seconds and 16 frames.

## Recording instructions

Read only the quoted narration, one passage per take. Leave about a second of silence around each take, then trim and align it in the editor. Pause naturally when a line ends early. Do not force your delivery to match every clip boundary; group the hardware and dashboard passages into natural sentences if that sounds better.

Pronunciation: ESP32 = “E-S-P thirty-two”; Roboflow = “robo-flow”; 2D/3D = “two-dimensional / three-dimensional”. The script deliberately avoids making you name every component already labeled onscreen.

## Scene timing

| Scene | Current saved timing | Proposed recording timing |
| --- | --- | --- |
| Introduction | 00:00:00–00:03:16 | 00:00:00–00:03:16 |
| The problem | 00:03:16–00:13:16 | 00:03:16–00:13:16 |
| Why I built it | 00:13:16–00:24:01 | 00:13:16–00:24:01 |
| Prototype reveal and purpose | 00:24:01–00:29:01 | 00:24:01–00:36:01 |
| Hardware | 00:29:01–00:58:26 | 00:36:01–01:05:26 |
| Monitoring Center transition | 00:58:26–01:03:26 | 01:05:26–01:10:26 |
| Dashboard overview | 01:03:26–01:29:26 | 01:10:26–01:36:26 |
| Mechanism introduction | 01:29:26–01:34:26 | 01:36:26–01:41:26 |
| Recyclable | 01:34:26–01:44:26 | 01:41:26–01:51:26 |
| Non-recyclable demonstration | 01:44:26–01:54:26 | 01:51:26–02:01:26 |
| E-waste | 01:54:26–02:04:26 | 02:01:26–02:11:26 |
| Fill monitoring | 02:04:26–02:21:11 | 02:11:26–02:28:11 |
| Collection planning | 02:21:11–02:46:11 | 02:28:11–02:53:11 |
| Current limitations | 02:46:11–02:52:26 | 02:53:11–03:02:11 |
| Next steps | 02:52:26–02:59:11 | 03:02:11–03:11:11 |
| Thank you | 02:59:11–03:02:26 | 03:11:11–03:14:26 |

## Full narration

### 01 · 00:00:00–00:03:16 · Introduction · Target: 3.53s (03:16)

> Hi. My name is Kelvin.

### 02 · 00:03:16–00:13:16 · The problem · Target: 10.00s (10:00)

> Mixed waste is harder to separate. Caretakers also need to know which bins need emptying. Could one system help with both?

### 03 · 00:13:16–00:24:01 · Why I built it · Target: 10.50s (10:15)

> I’ve always enjoyed building with LEGO, electronics, and code. I wanted to turn that interest into something that addresses an everyday problem.

### 04 · 00:24:01–00:36:01 · Prototype reveal · Target: 12.00s (12:00)

> Smart Waste System has two goals: help separate waste at disposal, and help caretakers decide which bins need collection and how to reach them.

### 05 · 00:36:01–00:41:11 · Hardware: wiring and power · Target: 5.33s (05:10)

> A five-volt supply powers the mechanism; a capacitor helps smooth voltage changes.

### 06 · 00:41:11–00:46:26 · Hardware: inlet and camera · Target: 5.50s (05:15)

> The inlet sensor detects an item, and the camera captures its image.

### 07 · 00:46:26–00:50:26 · Hardware: controller · Target: 4.00s (04:00)

> The controller requests a Roboflow prediction through my backend.

### 08 · 00:50:26–00:56:11 · Hardware: sorting servo · Target: 5.50s (05:15)

> For a supported category, one servo aims the chute toward its destination.

### 09 · 00:56:11–01:01:26 · Hardware: flap servo · Target: 5.50s (05:15)

> The second opens the flap only after the chute is positioned.

### 10 · 01:01:26–01:05:26 · Hardware: chute and flap · Target: 4.00s (04:00)

> This separates choosing a destination from releasing the item.

### 11 · 01:05:26–01:10:26 · Monitoring Center transition · Target: 5.00s (05:00)

> But sorting is only half the problem: caretakers also need information.

### 12 · 01:10:26–01:16:26 · Dashboard: buildings and floors · Target: 6.00s (06:00)

> The dashboard gives caretakers one place to find bins across buildings and floors.

### 13 · 01:16:26–01:22:26 · Dashboard: 2D and 3D · Target: 6.00s (06:00)

> Two-dimensional and three-dimensional views connect each reading to a physical location.

### 14 · 01:22:26–01:26:26 · Dashboard: bin preview · Target: 4.00s (04:00)

> Fill levels and connectivity show where attention may be needed.

### 15 · 01:26:26–01:30:26 · Dashboard: bin details · Target: 4.00s (04:00)

> Opening a bin provides more detail before a collection decision.

### 16 · 01:30:26–01:36:26 · Dashboard: records · Target: 6.00s (06:00)

> Records separate predictions from motion outcomes, so I can investigate what happened.

### 17 · 01:36:26–01:41:26 · Mechanism demonstration introduction · Target: 5.00s (05:00)

> These staged tests show the mechanism; I selected the categories manually.

### 18 · 01:41:26–01:51:26 · Recyclable demonstration · Target: 10.00s (10:00)

> For recyclable waste, the flap releases the item into its compartment. The accompanying dashboard entry is a sample showing how results are presented.

### 19 · 01:51:26–02:01:26 · Non-recyclable demonstration · Target: 10.00s (10:00)

> For non-recyclable waste, this staged test shows the chute positioning and release sequence. The sample dashboard record illustrates the corresponding category.

### 20 · 02:01:26–02:11:26 · E-waste demonstration · Target: 10.00s (10:00)

> For e-waste, the chute turns to a different destination, the flap opens, and the mechanism returns home, ready for another item.

### 21 · 02:11:26–02:28:11 · Fill monitoring · Target: 16.50s (16:15)

> Sorting alone does not tell caretakers when to collect. As I add items to the bin, the sensor detects the rising waste level. The illustrative dashboard shows how fill information could help prioritize bins before they overflow.

### 22 · 02:28:11–02:31:11 · Collection route: open page · Target: 3.00s (03:00)

> The next step is planning collection.

### 23 · 02:31:11–02:35:11 · Collection route: filters · Target: 4.00s (04:00)

> Caretakers set the building, fill threshold, and travel options.

### 24 · 02:35:11–02:39:11 · Collection route: eligible bins · Target: 4.00s (04:00)

> The planner selects eligible bins, avoiding unnecessary visits.

### 25 · 02:39:11–02:44:11 · Collection route: stop order · Target: 5.00s (05:00)

> It orders those stops along modeled walking paths to reduce backtracking.

### 26 · 02:44:11–02:49:11 · Collection route: floors · Target: 5.00s (05:00)

> Floor connections help turn a list of bins into a practical itinerary.

### 27 · 02:49:11–02:53:11 · Collection route: savings · Target: 4.00s (04:00)

> This demonstration uses synthetic readings; savings are model estimates.

### 28 · 02:53:11–03:02:11 · Closing: limitations · Target: 9.00s (09:00)

> Reliable use still needs clearer images, broader recognition testing, and handling of mixed waste. Forecasting also needs more historical data.

### 29 · 03:02:11–03:11:11 · Closing: next steps · Target: 9.00s (09:00)

> Next, I’ll improve capture, test real disposal patterns, and collect fill history to support better collection decisions.

### 30 · 03:11:11–03:14:26 · Closing: thanks · Target: 3.50s (03:15)

> Thank you for your time.

## Caption adjustments that support the story

- During the extended reveal, show **“Sort at disposal”** followed by **“Monitor bins · Plan collection”**. These are the two goals explained in the voiceover.
- Keep hardware names as concise labels; avoid duplicating every spoken sentence.
- The dashboard can use purpose-led labels such as **“Locate bins”**, **“Check where attention is needed”**, and **“Review what happened”**.
- Non-recyclable: use **“Non-recyclable · Mechanism test”**.
- Result screenshots: use **“Sample dashboard record”** rather than implying the sample entries were generated by the filmed motion. Their confidence values and completed outcomes are illustrative.
- Fill scene: label the physical camera panel **“Physical sensor test”** and the synthetic dashboard panel **“Illustrative fill-data demonstration”**. Do not imply that the edited panels are synchronized live measurements.
- Collection route: keep **“Synthetic fill scenario · Estimated route”** visible. Model savings are not measured time savings from a real collection trial.

## Pacing notes

- Keep the mechanism demonstrations at 10 seconds each. Leave the movements visible rather than narrating every small action. The 2.33-second result inserts are intended for a quick glance, not detailed reading.
- Keep the collection planning scene at 25 seconds. Its value is the connection from fill readings to collection decisions, not just switching filters.
- The proposed 12-second reveal introduces the purpose explicitly. Avoid speeding through it to preserve the old runtime.
- The closing keeps the four agreed development priorities: image quality, recognition, disposal behavior, and historical data. Forecasting is future work; collection route planning already exists.
- Speaking-rate estimates are a planning aid. Record naturally, then make small timing adjustments if technical terms or pauses take longer.

## Audio assembly

- In the inspected project, music is on A1, named Narration; A2, named Music, is empty. Move the music to A2 or rename the tracks before adding voice.
- Align separate voice takes to the revised scenes. Keep the original Kdenlive project as the editing source.
- Adjust the background music under the recorded voice and move its final fade to the revised ending.
- Use headphones while recording a timing reference so the background track does not bleed into the microphone.
