#!/usr/bin/env bash
# One-time mode configuration. The DevKit then runs each item itself over Wi-Fi.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# Only arming paths can repair/restart the broker. Status and emergency controls
# must remain available even when Docker/MQTT is down.
case "${1:-status}" in
  on|once) uv run --directory backend python ../scripts/ensure-hardware-broker.py ;;
esac
case "${1:-status}" in
  on) exec uv tool run --from platformio python scripts/servo-usb.py auto-on --wiring-confirmed --clearance-confirmed ;;
  once) exec uv tool run --from platformio python scripts/servo-usb.py auto-once --watch --wiring-confirmed --clearance-confirmed ;;
  off) exec uv tool run --from platformio python scripts/servo-usb.py auto-off ;;
  status) exec uv tool run --from platformio python scripts/servo-usb.py status ;;
  stop) exec uv tool run --from platformio python scripts/servo-usb.py stop ;;
  *) echo 'Usage: ./scripts/station-auto.sh on|once|off|status|stop' >&2; exit 2 ;;
esac
