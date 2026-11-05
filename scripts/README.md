# Scripts

Commands run from the repository root. Python uses the backend's uv environment;
USB console helpers use uv-run PlatformIO for pyserial. Shell scripts locate the
repository themselves. No helper requires the VS Code PlatformIO extension.

[Repository guide](../README.md) · [Agent rules](AGENTS.md) · [Firmware](../firmware/README.md)

## Normal operation

| Command | Purpose |
| --- | --- |
| `./scripts/station-auto.sh once` | Arm and observe one autonomous item |
| `./scripts/test-full-sequence.sh` | Same one-item test through the station controller |
| `./scripts/station-auto.sh on` | Enable saved continuous mode |
| `./scripts/station-auto.sh off` | Disable new arrivals |
| `./scripts/station-auto.sh stop` | Disable automatic mode and release PWM |
| `./scripts/station-auto.sh status` | Read controller state |
| `./scripts/check-firmware.sh` | Native tests plus both firmware builds; no upload |
| `sudo ./scripts/seed-locations.sh` | Apply additive location seed |
| `sudo ./scripts/update-inference-api.sh` | Rebuild API with current hardware/provider overlays |

Arming commands run `ensure-hardware-broker.py`: check actual worker/camera/brain
logins, repair once if needed, and recheck before sending a new arm command.
Healthy accounts need no Docker privileges. Failed checks/repair block arming;
sudo may ask for your local password when repair needs Docker access. Status,
off and stop skip preflight. `repair-hardware-broker.sh` remains a manual recovery
command, preserving API/provider settings and the database.

`test-full-sequence.sh` now delegates to `station-auto.sh once`; it no longer
needs a camera-IP argument or a separate laptop-controlled sorting bridge.
Wait for `waiting_item: ready=True`, then insert one item with hands clear.
One-shot mode ends off after a reported completed/disabled/failed result. Unknown
or an unsupported routing category does not move the servos.

## Setup and low-level control

```sh
uv run --directory backend python ../scripts/configure-hardware.py --ssid YOUR_2_4_GHZ_SSID
uv run --directory backend python ../scripts/camera-control.py configure
uv run --directory backend python ../scripts/configure-station.py
```

- `configure-hardware.py`: generates matching local Wi-Fi/MQTT configuration.
- `configure-station.py`: copies the private camera control credential to the brain.
- `camera-control.py`: status, diagnostic enable/disarm, calibration and authenticated
  OTA. `update` builds environment `camera`; credentials never enter CLI arguments.
- `servo-usb.py`: shared USB console client used by station-auto; also supports
  bounded calibration commands. Do not run manual motor commands alongside auto.
- `ensure-hardware-broker.py --check-only`: login diagnosis without repair.

After generating the local hardware configuration, create `.env.roboflow` from
its example on a fresh installation and set the real API key in `.env`. Start
the hardware stack (simulator remains off) with:

```sh
sudo docker compose \
  --env-file .env --env-file .env.hardware --env-file .env.roboflow \
  -f compose.yaml -f compose.hardware.yaml -f compose.roboflow.yaml \
  up -d --build --wait
```

Use the root guide's frontend-dev overlay instead when working on UI source.
Do not overwrite existing configured environment files.

For example, a sensor/photo-only camera setup (first disarm the station):

```sh
./scripts/station-auto.sh off
uv run --directory backend python ../scripts/camera-control.py disarm --host waste-s11-cam.local
# Remove the item while detection is off, then enable with the actual empty baseline:
uv run --directory backend python ../scripts/camera-control.py enable \
  --host waste-s11-cam.local --wiring-confirmed --detection-mode drop \
  --baseline-cm 11.2 --drop-cm 2 --capture-delay-ms 800
```

These numbers reflect the last local calibration, not every future mount.
Arming, uploading, seed/rebuild commands and calibration writes have side effects;
reading `--help`, running firmware checks and mocked tests do not.

## Reusable diagnostics and local experiments

Tracked [diagnostics](diagnostics/) are useful for setup and support:

```sh
uv run --directory backend python ../scripts/diagnostics/watch-inlet.py
uv run --directory backend python ../scripts/diagnostics/check-camera.py --capture-every 0
uv run --directory backend python ../scripts/diagnostics/verify-fill.py --category recyclable
```

They inspect real status/telemetry and do not classify or command motors. Camera
JPEG checks require no retained arrival frame to be reserved. Private snapshots,
logs and backup journals belong outside Git (`.hardware-backups/` is ignored).

Personal/retired calibration and bring-up wrappers are kept locally in ignored
`scripts/local/`; they are not shipped, linked as required tools, or used by CI.
The old per-item `sort-prototype.py` bridge and its obsolete bridge-only tests
were removed. Historical commands in older hardware notes are not current setup
instructions; use this guide and the firmware README.
