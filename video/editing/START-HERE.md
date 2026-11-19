> Historical workspace preparation notes. The project has since been edited and narrated; use [the current video guide](../README.md) for the final export and editing entrypoint.

# SWS video editing workspace

Kdenlive 26.08.3 is installed from the official KDE AppImage, with its SHA-256 verified.
Open Kdenlive from Ubuntu's Applications menu, or run ~/.local/bin/kdenlive.

## Prepared project

Open `06-project/SWS-demo.kdenlive`. It is already open in Kdenlive.

- Profile: 1920 x 1080, progressive, 30 fps, landscape 16:9.
- Imported: 16 videos and 3 ESP32-CAM photos. All media paths were checked.
- Four video tracks and two audio tracks; timeline intentionally empty.
- The two variable-frame-rate screencasts have 30 fps editing copies in
  `02-screen-recordings`; the project uses those copies. Originals are preserved.
- The smaller screencasts should be framed against a background rather than
  stretched out of proportion. The portrait capture is 416 x 644.

## Media folders

- 01-footage: original downloaded camera videos (keep the originals and filenames).
- 02-screen-recordings: web dashboard and route-planner screen recordings.
- 03-camera-images: the three ESP32-CAM photos, already copied from the project.
- 04-graphics: background cards, frames, logos and arrows.
- 05-audio: narration and background music.
- 06-project: save the editable SWS-demo.kdenlive project here.
- 07-exports: render the final presentation MP4 here.
- 08-proxies: optional editing proxies; original media is kept intact.

The downloaded Google Drive ZIP and extracted originals are retained in 01-footage.
Avoid renaming or moving media after it is linked in Kdenlive.

## Suggested timeline

- V4: labels, captions, arrows and callouts.
- V3: photo inserts / picture-in-picture.
- V2: main hardware footage and screen recordings.
- V1: backgrounds and section title cards.
- A2: narration.
- A1: quiet music / original audio as needed.

Arrange and trim clips first; add titles and overlays next; finish audio and transitions.
Save the project regularly, and export a separate MP4 instead of overwriting originals.
Keep scripted/synthetic/estimated demo labels visible where required.

## Your first editing pass

1. Double-click a clip in Project Bin to preview it. Identify the wide introduction.
2. Drag it onto V2 (Main footage). Trim its edges to keep the useful section.
3. Add hardware close-ups, web overview, item input and mechanism clips, camera
   photo/results, fill monitoring, route planning, then the closing wide shot.
   Use FILMING-HANDOFF.md for the planned story and demonstration labels.
4. Watch the rough cut before adding transitions or music. Save with Ctrl+S.
5. Add text using a title clip on V4; place camera photos on V3 and backgrounds
   on V1. Keep `Scripted prototype demonstration` and `Illustrative fill data`
   labels visible on the relevant staged sections.
6. Render a separate H.264/AAC MP4 into 07-exports when the edit is finished.

The project is ready for editing; no automatic cut or final MP4 has been created.
