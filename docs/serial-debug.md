# Camera serial logs through the DevKit

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


For a direct USB-baseboard capture, explicitly set both DTR and RTS false
before opening the port (as the Python USB helpers do). A raw OS port reader
asserted the baseboard's reset control during the November 2 diagnosis; its
missing logs and failed network probes were misleading. Opening the port can
still cause a brief reset, so wait for boot before starting a soak check. Avoid
opening a second reader on the same serial device.

The camera already writes diagnostic logs on UART0 U0T/GPIO1 at115200 baud.
The monitor's opt-in `fill-debug-test` build receives them on UART2 RX2/GPIO16
and prints `[CAM]` lines to its own CP2102 USB serial interface. Its real fill
sensor remains on GPIO25/26 with the existing temporary20/5 cm range.

The relay, standard fill and network monitor modes compiled. The connected
DevKit was USB-flashed with `fill-debug-test`, and its serial boot reported
receive-only RX2/GPIO16 ready. Fresh physical fill telemetry still passed
`verify-fill.py` (98.4% at2026-11-01T15:11:33.722974Z with temporary calibration).
After the user connected the debug wire, real `[CAM] HTTP readiness: 200 PASS`
and `[CAM] MQTT heartbeat: ACK` messages arrived through the DevKit USB port.
The relay also exposed camera HTTP/MQTT network failures during inlet testing.
The fallback is physically verified for logs; it does not eliminate those network
failures or provide a wired inference transport.

This is a receive-only, best-effort log relay. It is not a programming bridge,
camera command channel, or a substitute for Wi-Fi/API/MQTT classification.
It services camera input before checking Wi-Fi, including when the monitor
cannot connect. The UART receive buffer is2KB, each line is bounded191 characters,
and excess line characters are marked truncated. Data can be lost during lengthy
blocking operations; it is not a durable diagnostic recorder.

## Wiring

Disconnect power before changing wires. With the camera removed from its USB
baseboard, connect:

| Camera | DevKit |
| --- | --- |
| U0T / TX / GPIO1 | RX2 / GPIO16 |
| GND | GND |

Leave DevKit TX2/GPIO17 and camera U0R/RX disconnected. Do not connect TX to TX,
and do not use the DevKit's RX0/TX0 pins: UART0 remains connected to its onboard
CP2102 USB adapter. These ESP32 UART signals are3.3V logic, not RS-232 voltages.
The divider on the ultrasonic sensor's ECHO is unrelated to this MCU-to-MCU wire.

For reading logs on the computer, power the **DevKit from USB only** and the
**camera from the regulated external5V supply only**. Leave the supply's positive
lead to DevKit5V disconnected while its USB is attached. Share supply/camera/
DevKit ground. Never feed external5V and USB power to the same board together.

Power the DevKit first, open the serial monitor, then power the camera to catch
its boot logs. Opening the DevKit serial port may reset the DevKit; it should
not reset the camera over this one-way signal connection. Disconnect the debug
wire before using the camera USB baseboard again for recovery.

## Build and USB flash

```sh
uv tool run --from platformio pio run -d firmware/esp32-monitor -e fill-debug-test -t upload \
  --upload-port /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0
```

Other monitor environments do not initialize this optional UART. The camera
continues to use its existing inlet firmware and GPIO13/14 for its inlet sensor.

Source: [Espressif UART documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/serial.html).
The project's pinned Arduino2.0.17 HardwareSerial implementation was also
inspected: specifying RX16 explicitly with TX=-1 leaves UART2 without a TX pin
on first initialization.
