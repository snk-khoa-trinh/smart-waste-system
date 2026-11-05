# Documentation index

[Repository guide](../README.md) · [Documentation agent rules](AGENTS.md)

## Current entrypoints

| Guide | Read for |
| --- | --- |
| [Architecture](architecture.md) | Services, device responsibilities and data flow |
| [HTTP API](api.md) | Routes, validation, inference and outcome contracts |
| [MQTT](mqtt.md) | Topic schemas, source/quality and device permissions |
| [Station operation and evidence](autonomous-station.md) | Autonomous controller, arrival/frame locking, calibration, broker recovery and chronological hardware findings |
| [Building previews](building-preview.md) | Shared 2D/3D geometry, interactions and validation |
| [Firmware README](../firmware/README.md) | Current camera/station source files and build/upload commands |
| [Scripts README](../scripts/README.md) | Current setup, operation and diagnostic commands |

The station guide includes experiments that later notes supersede. The current
source/configuration and folder READMEs determine supported commands. In particular,
only PlatformIO environments `camera` and `station` remain. Fast arrival transport
has been exercised, but capture timing on the assembled mount must be accepted by
checking that the saved image contains the intended item. The last local delay
was800ms; do not interpret an empty-tray Unknown result as item recognition evidence.

## Historical bring-up notes

These retain the development evidence, earlier wiring/profiles and failed checks.
Their provisional/network/fill/servo environments and some local helper commands
have been retired. Do not follow them as a fresh-install checklist.

- [Hardware/network](hardware-test.md), [camera](camera-test.md), [inlet](inlet-test.md).
- [Fill sensor](fill-sensor-test.md), [serial diagnostics](serial-debug.md).
- [Servo calibration](servo-bench.md), [old laptop sorting cycle](prototype-sort-cycle.md).
- [Roboflow configuration](roboflow.md), [live workflow experiments](roboflow-live-test.md).
- [Historical verification matrix](verification.md).

Do not add credentials, private camera images or copied serial logs containing
secrets. Store local artifacts under ignored `.hardware-backups/` instead.
