"""Verify MQTT logins and repair the hardware broker once before arming.

Healthy logins need no Docker/sudo access. Never sends telemetry or motor commands.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import paho.mqtt.client as mqtt
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def credentials():
    if not (ROOT / ".env.hardware").exists():
        raise RuntimeError("Missing .env.hardware; restore the hardware configuration before arming.")
    hardware = dotenv_values(ROOT / ".env.hardware")
    base = dotenv_values(ROOT / ".env")
    host = hardware.get("HARDWARE_BIND_IP")
    if not host:
        raise RuntimeError("HARDWARE_BIND_IP is missing; configure the computer's LAN address first.")
    targets = [("worker", "worker", base.get("MQTT_PASSWORD") or "worker-local")]
    for board, user, key in [
        ("esp32-cam", "camera-s11", "MQTT_CAMERA_PASSWORD"),
        ("esp32-monitor", "monitor-s11", "MQTT_MONITOR_PASSWORD"),
    ]:
        password = hardware.get(key)
        if not password:
            raise RuntimeError(f"Missing {key}; restore hardware credentials before arming.")
        header = ROOT / f"firmware/{board}/include/config.local.h"
        if not header.exists():
            raise RuntimeError(f"Missing {board} local configuration; refusing to replace broker accounts.")
        values = {
            name: json.loads(value)
            for name, value in re.findall(
                r'^#define (TEST_MQTT_USER|TEST_MQTT_PASSWORD|TEST_BACKEND_HOST) ("[^"\n]*")$',
                header.read_text(), re.MULTILINE,
            )
        }
        if values.get("TEST_MQTT_USER") != user or values.get("TEST_MQTT_PASSWORD") != password:
            raise RuntimeError(f"{board} credentials differ from .env.hardware; synchronize configuration first.")
        if values.get("TEST_BACKEND_HOST") != host:
            raise RuntimeError(f"{board} broker address differs from .env.hardware; synchronize configuration first.")
        targets.append((board, user, password))
    return host, targets


def login(host, user, password):
    result = []
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sws-preflight-{uuid4().hex[:12]}")
    client.connect_timeout = 3
    client.username_pw_set(user, password)

    def connected(_client, _userdata, _flags, reason, _properties):
        result.append((not reason.is_failure, str(reason)))

    client.on_connect = connected
    try:
        client.connect(host, 1883, keepalive=10)
        deadline = time.monotonic() + 4
        while not result and time.monotonic() < deadline:
            client.loop(timeout=0.2)
        return result[0] if result else (False, "No broker acknowledgement")
    except OSError:
        return False, "Broker unreachable"
    finally:
        client.disconnect()


def check(host, targets):
    failures = []
    for label, user, password in targets:
        accepted, reason = login(host, user, password)
        if not accepted:
            failures.append(f"{label}: {reason}")
    return failures


def repair():
    try:
        docker = subprocess.run(["docker", "info"], capture_output=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("Docker is unavailable; start Docker before arming.") from None
    command = [str(ROOT / "scripts/repair-hardware-broker.sh")]
    if docker.returncode:
        # A user terminal can authenticate normally. Automated/noninteractive
        # callers must fail promptly instead of hanging on a password request.
        command = ["sudo", *([] if sys.stdin.isatty() else ["-n"]), "--", *command]
        print("Broker repair needs Docker privileges; sudo may request your local password.", flush=True)
    try:
        subprocess.run(command, cwd=ROOT, check=True)
    except (OSError, subprocess.CalledProcessError):
        raise RuntimeError("Broker repair did not finish. No new arm command was sent; rerun in your terminal.") from None


def ensure(check_only=False):
    host, targets = credentials()
    failures = check(host, targets)
    if not failures:
        print("MQTT ready: worker, camera and brain logins accepted.", flush=True)
        return
    print("MQTT check failed: " + "; ".join(failures), flush=True)
    if check_only:
        raise RuntimeError("Broker repair required; no changes made (--check-only).")
    print("Restoring hardware broker accounts before arming…", flush=True)
    repair()
    # Recheck actual logins after repair, not just the container exit status.
    failures = check(host, targets)
    if failures:
        raise RuntimeError("Broker still rejects logins after one repair: " + "; ".join(failures) + ". Sorting not armed.")
    print("MQTT repaired: all logins accepted. Boards reconnect automatically.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        ensure(args.check_only)
    except RuntimeError as error:
        raise SystemExit(str(error)) from None


if __name__ == "__main__":
    main()
