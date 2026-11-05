# Firmware agent rules

Read [root baseline](../AGENTS.md) and [firmware guide](README.md).

- Active sources/environments are camera.cpp/camera and station.cpp/station.
  Preserve PlatformIO platform/library pins and min_spiffs OTA partition layout.
  Update scripts, docs and CI together if source or environment names change.
- Build with uv-run PlatformIO; do not flash connected boards for refactors or
  compile checks. Physical uploads and arming follow task/session authorization.
- Files in `common/` are shared runtime. Keep native tests under `tests/` committed;
  run `scripts/check-firmware.sh` for compile and logic checks without uploads.
- Preserve wiring: inlet13/14, fill25/26, classifier27, opener33, debugRX16 and
  configured LED2. Do not infer clone LED polarity, safe ECHO voltage, calibration
  or physical servo angles solely from software command values.
- Keep calibrated pulses700/2000 and1800/700, output ordering, timer separation,
  startup homing, clear-before-rearm, retained frame/arrival locks, timestamp
  freshness checks and NVS motion/outcome journals. Do not replay motor motion or
  paid inference after uncertain transport/restart outcomes.
- Preserve private header contents and the USB protocol used by servo-usb.py.
  `ServoBench`/`TEST_*` names are compatibility names used by real runtime code.
- Hardware success requires observed behavior and correctly imaged items. Document
  failed/incomplete captures honestly; a disabled Unknown outcome is not a sort.
