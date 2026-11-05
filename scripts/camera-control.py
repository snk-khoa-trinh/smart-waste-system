"""Private LAN camera controls and authenticated Arduino OTA (no secret CLI arguments)."""

import argparse
import importlib.util
import ipaddress
import json
import logging
import os
import re
import secrets
import socket
import subprocess
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
KEYFILE = ROOT / "firmware/esp32-cam/include/ota.local.h"


def password():
    if not KEYFILE.exists():
        raise SystemExit("First run camera-control.py configure, then USB-flash the inlet firmware.")
    match = re.search(r'^#define TEST_OTA_PASSWORD ("[^"\n]+")$', KEYFILE.read_text(), re.MULTILINE)
    if match is None:
        raise SystemExit("Invalid private OTA header.")
    value = json.loads(match.group(1))
    if len(value) < 16:
        raise SystemExit("OTA password must have at least 16 characters.")
    return value


def safe_request(client, method, path, *, attempts=3, **kwargs):
    """Retry only read-only status or idempotent disarm; never re-arm on ambiguity."""
    for attempt in range(attempts):
        try:
            return client.request(method, path, **kwargs)
        except httpx.TransportError:
            if attempt == attempts - 1:
                raise
            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["configure", "status", "enable", "arm", "disarm", "update"]
    )
    parser.add_argument("--host", help="Camera private LAN IPv4 address or .local hostname")
    parser.add_argument("--wiring-confirmed", action="store_true", help="Confirm GPIO13/14 and safe ECHO wiring")
    parser.add_argument("--capture-delay-ms", type=int)
    parser.add_argument("--detection-mode", choices=["proximity", "drop"])
    parser.add_argument("--baseline-cm", type=float)
    parser.add_argument("--drop-cm", type=float)
    parser.add_argument("--near-cm", type=float)
    parser.add_argument("--clear-cm", type=float)
    parser.add_argument("--max-captures", type=int, default=1)
    parser.add_argument(
        "--environment", choices=["camera"], default="camera"
    )
    args = parser.parse_args()
    thresholds = {}
    if args.capture_delay_ms is not None:
        if args.command != "enable" or not 0 <= args.capture_delay_ms <= 1500:
            parser.error("--capture-delay-ms requires enable and a value 0..1500")
        thresholds["capture_delay_ms"] = args.capture_delay_ms
    if args.detection_mode:
        if args.command != "enable":
            parser.error("--detection-mode is supported with enable only")
        thresholds["detection_mode"] = args.detection_mode
    if args.baseline_cm is not None or args.drop_cm is not None:
        if args.command != "enable" or args.baseline_cm is None or args.drop_cm is None:
            parser.error("Supply --baseline-cm and --drop-cm together with enable")
        if not 4 <= args.baseline_cm <= 400 or not 1 <= args.drop_cm <= args.baseline_cm - 2:
            parser.error("Baseline must be 4..400cm; drop must be 1..baseline-2cm")
        thresholds.update({"detection_mode": "drop", "baseline_cm": args.baseline_cm, "drop_cm": args.drop_cm})
    if args.near_cm is not None or args.clear_cm is not None:
        if args.command not in {"enable", "arm"} or args.near_cm is None or args.clear_cm is None:
            parser.error("Supply --near-cm and --clear-cm together with enable or arm")
        if not 2 <= args.near_cm < args.clear_cm <= 400:
            parser.error("Require 2 <= near-cm < clear-cm <= 400")
        thresholds.update({"near_cm": args.near_cm, "clear_cm": args.clear_cm})
    if args.command == "configure":
        if KEYFILE.exists():
            password()
            print("Existing private OTA password preserved.")
            return
        value = secrets.token_hex(24)
        fd = os.open(KEYFILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write("#pragma once\n// Private camera OTA/control credential. Never commit.\n")
            stream.write(f"#define TEST_OTA_PASSWORD {json.dumps(value)}\n")
        print("Private OTA/control password created; no password displayed. USB-flash inlet firmware next.")
        return
    if not args.host:
        parser.error("--host is required")
    try:
        address = ipaddress.IPv4Address(args.host)
    except ipaddress.AddressValueError:
        if not args.host.lower().endswith(".local"):
            parser.error("Use a private LAN IPv4 address or the camera's .local hostname")
        address = ipaddress.IPv4Address(socket.gethostbyname(args.host))
    if not address.is_private or address.is_loopback or address.is_unspecified:
        parser.error("Use the camera's private LAN IPv4 address")
    # Resolve once and connect directly to the validated private address.
    args.host = str(address)
    if not 1 <= args.max_captures <= 10:
        parser.error("--max-captures must be 1..10")
    if args.command in {"enable", "arm"} and not args.wiring_confirmed:
        parser.error("Confirm the selected mode's physical wiring with --wiring-confirmed")
    with httpx.Client(base_url=f"http://{args.host}", timeout=15) as client:
        if args.command == "status":
            response = safe_request(client, "GET", "/status")
        elif args.command in {"enable", "arm", "disarm"}:
            response = safe_request(
                client,
                "POST",
                f"/inlet/{args.command}",
                attempts=3 if args.command == "disarm" else 1,
                auth=("admin", password()),
                json={"wiring_confirmed": args.wiring_confirmed, "max_captures": args.max_captures, **thresholds},
            )
        else:
            subprocess.run(
                [
                    "uv",
                    "tool",
                    "run",
                    "--from",
                    "platformio",
                    "pio",
                    "run",
                    "-d",
                    "firmware/esp32-cam",
                    "-e",
                    args.environment,
                ],
                cwd=ROOT,
                check=True,
            )
            status = safe_request(client, "GET", "/status")
            status.raise_for_status()
            if not status.json().get("ota_authenticated"):
                raise SystemExit("Camera has no authenticated OTA. USB-flash the inlet firmware first.")
            response = safe_request(client, "POST", "/inlet/disarm", auth=("admin", password()), json={})
            response.raise_for_status()
            # Call the framework uploader in-process: password never enters the
            # shell, process command line, environment or debug output.
            platformio_home = Path(os.environ.get("PLATFORMIO_CORE_DIR", str(Path.home() / ".platformio")))
            uploader = platformio_home / "packages/framework-arduinoespressif32/tools/espota.py"
            spec = importlib.util.spec_from_file_location("camera_espota", uploader)
            if spec is None or spec.loader is None:
                raise SystemExit("PlatformIO Arduino OTA uploader unavailable.")
            ota = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(ota)
            ota.TIMEOUT = 20
            ota.PROGRESS = False
            logging.basicConfig(level=logging.WARNING)
            image = ROOT / f"firmware/esp32-cam/.pio/build/{args.environment}/firmware.bin"
            with socket.socket() as probe:
                probe.bind(("0.0.0.0", 0))
                upload_port = probe.getsockname()[1]
            try:
                code = ota.serve(args.host, "0.0.0.0", 3232, upload_port, password(), str(image))
            except NameError as exc:
                # The pinned framework uploader's final-timeout handler contains
                # `except e`, masking its socket timeout with this NameError.
                if str(exc) != "name 'e' is not defined":
                    raise
                raise SystemExit(
                    "OTA completion was not confirmed: framework uploader timed out. "
                    "Check camera status; use the USB baseboard for recovery."
                ) from None
            if code:
                raise SystemExit("OTA failed. Keep USB baseboard available for recovery.")
            print("Authenticated OTA upload passed; camera is rebooting with inlet detection disabled.")
            return
        if response.is_error:
            try:
                detail = response.json().get("error", "Request rejected")
            except ValueError:
                detail = "Request rejected"
            raise SystemExit(f"Camera returned HTTP {response.status_code}: {detail}")
        print(json.dumps(response.json(), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"Camera control failed: {exc}") from None
