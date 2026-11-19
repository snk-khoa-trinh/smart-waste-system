"""Generate ignored local network-test credentials without displaying passwords."""

import argparse
import getpass
import json
import os
import secrets
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_private(path, contents):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(contents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssid", required=True)
    parser.add_argument("--host", help="Computer LAN IPv4 address; inferred if omitted")
    parser.add_argument(
        "--from-networkmanager", action="store_true", help="Read saved Wi-Fi password locally, without printing it"
    )
    args = parser.parse_args()
    password = ""
    if args.from_networkmanager:
        result = subprocess.run(
            ["nmcli", "--show-secrets", "-g", "802-11-wireless-security.psk", "connection", "show", args.ssid],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            password = result.stdout.strip()
        if not password:
            raise SystemExit("Saved Wi-Fi password unavailable. Run without --from-networkmanager to enter it locally.")
    else:
        password = getpass.getpass("2.4 GHz Wi-Fi password (hidden): ")
    if not password:
        raise SystemExit("Wi-Fi password required for this WPA test configuration.")
    host = args.host
    if not host:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 9))
            host = sock.getsockname()[0]
    import ipaddress

    address = ipaddress.IPv4Address(host)
    if not address.is_private or address.is_loopback or address.is_unspecified:
        raise SystemExit("Use the specific private LAN address of this computer.")
    envpath = ROOT / ".env.hardware"
    previous = {}
    if envpath.exists():
        previous = dict(
            line.split("=", 1) for line in envpath.read_text().splitlines() if "=" in line and not line.startswith("#")
        )
    camera = previous.get("MQTT_CAMERA_PASSWORD") or secrets.token_hex(16)
    monitor = previous.get("MQTT_MONITOR_PASSWORD") or secrets.token_hex(16)
    write_private(envpath, f"HARDWARE_BIND_IP={host}\nMQTT_CAMERA_PASSWORD={camera}\nMQTT_MONITOR_PASSWORD={monitor}\n")
    for project, device, user, key, fill in [
        ("esp32-cam", "s11-cam", "camera-s11", camera, 0),
        ("esp32-monitor", "s11-monitor", "monitor-s11", monitor, 1),
    ]:
        values = {
            "TEST_WIFI_SSID": args.ssid,
            "TEST_WIFI_PASSWORD": password,
            "TEST_BACKEND_HOST": host,
            "TEST_STATION_ID": "s11",
            "TEST_DEVICE_ID": device,
            "TEST_MQTT_USER": user,
            "TEST_MQTT_PASSWORD": key,
        }
        text = "#pragma once\n// Private local configuration. Do not commit or display.\n"
        text += "".join(f"#define {name} {json.dumps(value)}\n" for name, value in values.items())
        text += f"#define TEST_PUBLISH_SIMULATED_FILL {fill}\n"
        write_private(ROOT / f"firmware/{project}/include/config.local.h", text)
    print(f"Configured {args.ssid} → {host}; private headers and .env.hardware saved. No passwords displayed.")


if __name__ == "__main__":
    main()
