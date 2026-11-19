# Smart Waste System: demo video

[Project overview](../README.md) · [Technical documentation](../docs/README.md)

The demo introduces the motivation for Smart Waste System, shows the physical
prototype and monitoring dashboard, and closes with limitations and next steps.

**[Watch or download the demo](video.mp4)** — 3:14.84 · 1920 × 1080 · 30 fps ·
H.264 video with AAC audio.

## Editing project and source material

Open **[SWS-demo.kdenlive](editing/06-project/SWS-demo.kdenlive)** in Kdenlive to
continue editing with the local source-media archive. The project uses relative
media paths inside this folder; keep the directory structure together when
copying the workspace. A Git clone includes the project file, final demo, script,
and small graphics, but excludes the large source-media archive.

| Location | Contents |
| --- | --- |
| [Final export](video.mp4) | Completed demo video |
| `editing/01-footage/` (local only) | Original camera footage, 30 fps editing copies, the source download bundle, and stock clips |
| `editing/02-screen-recordings/` (local only) | Dashboard, fill-monitoring, and collection-route captures |
| [Camera images](editing/03-camera-images/) | Staged inlet images used in result inserts |
| [Graphics](editing/04-graphics/) | Photos, code screenshot, and sample dashboard result screenshots |
| `editing/05-audio/narration/` (local only) | All 30 original voice takes and their download archive |
| `editing/05-audio/music/` (local only) | Background music used in the edit |
| [Project files](editing/06-project/) | Latest Kdenlive project; manual backups are local only |
| `editing/06-project/history/` (local only) | Automatic project snapshots and original recovery copies |
| [Media manifest](media-manifest.json) | Original locations, repository locations, file sizes, and SHA-256 checksums from the relocation |

The full local archive contains approximately 1.63 GiB of media and project files.
Raw footage, screen recordings, source audio, ZIP bundles, backup projects,
generated caches, proxies, and intermediate exports are excluded through the root
`.gitignore`. The completed `video.mp4` remains available to Git. No source files
are deleted by these exclusions. Original recovery copies retain their historical
paths; use the main project or the relinked automatic snapshots for editing.

Third-party music and stock footage retain their own license terms. Inclusion
in this local editing archive does not grant rights to redistribute those assets
as standalone downloads.

## Narration

The [recording script](narration-script.md) includes frame-accurate scene timings,
spoken narration, and suggested pacing adjustments for the saved edit.

## What the demonstration covers

- The waste-sorting problem and motivation for building the project.
- Hardware components and the sorting mechanism.
- Building navigation, bin status, and sorting records in the dashboard.
- Recyclable, non-recyclable, and e-waste mechanism demonstrations.
- Fill monitoring, current limitations, and future development.

Mechanism demonstrations use operator-selected categories to show the chute
positioning and release sequence.
Sample records and synthetic fill animations are labeled as demonstrations;
these scenes do not establish autonomous classification accuracy.

## Music attribution

Music I Use: https://www.bensound.com/free-music-for-videos

License code: I6P9U3P3JIWKAWYA

Artist: Benjamin Tissot
