# Stage 1: physical-board network test (no sensors or movement)

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


This test runs on two USB-connected ESP32 boards. It initializes Wi-Fi, HTTP, UTC time synchronization and MQTT only. Camera capture, sensor GPIOs, servos and actuators remain disabled. Board-specific camera pins and mechanisms are still pending. A passing network test does not validate the camera or a physical sensor.

Identified during this session: CP2102 DevKit at `/dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0`, CH340 camera baseboard at `/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0`; both chips report ESP32-D0WD-V3 and 4 MB flash. USB adapter identification does not prove the camera module model. The network-only build avoids that pin-map dependency. Keep attached mechanisms disconnected during first tests.

## Private configuration

From the repository root:

```sh
python3 scripts/configure-hardware.py --ssid YOUR_2_4_GHZ_SSID --host YOUR_COMPUTER_LAN_IP
```

The script prompts for the Wi-Fi password without displaying it. Alternatively, on Linux with a saved NetworkManager connection:

```sh
python3 scripts/configure-hardware.py --ssid YOUR_2_4_GHZ_SSID --host YOUR_COMPUTER_LAN_IP --from-networkmanager
```

It creates private, ignored `config.local.h` files for each firmware project and `.env.hardware` containing the LAN address and independent random MQTT passwords. It never reads or embeds the Roboflow key. Local headers, built firmware and flash backups can contain secrets: they are ignored by Git and excluded from Docker contexts. Re-running configuration preserves existing device MQTT passwords unless you delete `.env.hardware`.

The firmware falls back to safe placeholder `config.example.h` for CI compilation; it cannot connect with those placeholders. All network-test serial output uses 115200 baud. MQTT uses QoS 1; an acknowledgement proves broker acceptance, while the API verifier below proves persistence. NTP must synchronize before timestamped telemetry is sent. The UI must continue to label all generated fill values simulated.

## Preserve existing firmware, then flash explicitly

Before overwriting a board, obtain a complete flash backup using [Espressif's read-flash command](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/basic-commands.html), substituting the verified serial port:

```sh
mkdir -p .hardware-backups
chmod 700 .hardware-backups
uv tool run --from esptool esptool --port YOUR_VERIFIED_PORT --baud 115200 \
  read-flash 0 ALL .hardware-backups/BOARD-original.partial
# Rename only after the command succeeds; confirmed flash size here is 4,194,304 bytes.
mv .hardware-backups/BOARD-original.partial .hardware-backups/BOARD-original.bin
chmod 600 .hardware-backups/BOARD-original.bin
```

If backup fails, do not treat a partial file as a recovery image. Resolve USB/serial failures before overwriting that board. Backups belong to that exact physical board; do not restore one board's NVS/identity to another.

```sh
uv tool run --from platformio pio run -d firmware/esp32-cam -e network-test
uv tool run --from platformio pio run -d firmware/esp32-monitor -e network-test
# Only after that board has a successful backup:
uv tool run --from platformio pio run -d firmware/esp32-cam -e network-test -t upload --upload-port VERIFIED_CAMERA_PORT
uv tool run --from platformio pio run -d firmware/esp32-monitor -e network-test -t upload --upload-port VERIFIED_DEVKIT_PORT
```

The default `provisional` environment still builds the disabled starter; select `-e network-test` deliberately. No GPIO pin or servo angle is selected by network-test firmware.

## Expose the test interfaces to the trusted LAN

Start the normal Docker stack first. Then from the repository root run:

```sh
sudo ./scripts/start-hardware-test.sh
```

This stops the simulator, generates broker credentials with a hardware-specific ACL, exposes API port 8000 and MQTT port 1883 on the configured private LAN IP and recreates the API/broker/worker/frontend. PostgreSQL volumes are preserved. The browser dashboard stays on loopback port 5173. No router port forwarding or public deployment is needed. This is a temporary trusted-LAN test of an otherwise unauthenticated API.

The camera credential can publish only `s11-cam` heartbeat/outcome topics. The monitor credential can publish only `s11-monitor` heartbeat/fill topics. The hardware ACL excludes the simulator, preventing the simulator from making a disconnected physical board look online. The Compose override adds a specific LAN API binding while preserving the original localhost API binding; see [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/).

On each board, serial output should show:

```text
Wi-Fi PASS: IP=... RSSI=...
HTTP readiness: 200 PASS
MQTT connected with device-scoped credentials
MQTT heartbeat: ACK (broker acknowledgement only; verify API persistence)
```

The monitor also reports fill ACKs. Values are generated by software and use `source: simulated`; no physical sensor is read. The camera sends heartbeat only during stage 1.

```sh
cd backend
uv run python ../scripts/verify-hardware.py
```

The verifier requires both devices and three compartment measurements to be fresh and newer than the hardware-test start marker. In the dashboard select Atrium 1 (`s11`). Unplug only one board and wait over 90 seconds: only that board should become offline. Reconnect and check recovery; the monitor's readings should become stale when it is unplugged.

If API requests fail, check host firewall/router client isolation and the configured IP. If MQTT connects but nothing persists, inspect worker logs and clock synchronization. Changing Wi-Fi networks or DHCP addresses requires reconfiguring and rebuilding the firmware.

To return to the original local-only demo, remove the hardware override from the Compose invocation, restore default broker credentials and recreate the published ports:

```sh
sudo docker compose run --rm --no-deps broker-init
sudo docker compose --profile demo up -d --force-recreate --no-deps --wait broker api worker frontend simulator
```

Hardware-test boards will then lose broker access and the simulator resumes. Future stages: confirm exact camera model, capture JPEGs and classify, then add calibrated physical sensing; actuator integration remains a separate task.
