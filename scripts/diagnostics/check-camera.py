"""Read-only camera soak check: status and JPEGs, no inference or motor commands."""

import argparse
import io
import json
import time

import httpx
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="192.168.1.207")
    parser.add_argument("--samples", type=int, default=60)
    parser.add_argument("--interval", type=float, default=2)
    parser.add_argument("--capture-every", type=int, default=10, help="0 disables JPEG checks")
    args = parser.parse_args()
    if args.samples < 1 or args.interval < 0 or args.capture_every < 0:
        parser.error("samples must be positive; interval and capture-every must be nonnegative")
    failures = 0
    captures = 0
    previous_uptime = None
    with httpx.Client(base_url=f"http://{args.host}", timeout=httpx.Timeout(15, connect=4), trust_env=False) as client:
        for sample in range(1, args.samples + 1):
            started = time.monotonic()
            row = {"sample": sample}
            try:
                response = client.get("/status")
                response.raise_for_status()
                status = response.json()
                row.update({key: status.get(key) for key in (
                    "uptime_ms", "camera_ready", "mqtt_connected", "wifi_rssi", "free_heap",
                    "wifi_bssid", "wifi_channel", "camera_xclk_hz", "max_alloc_heap"
                )})
                problems = []
                if status.get("camera_ready") is not True:
                    problems.append("camera not ready")
                if status.get("mqtt_connected") is not True:
                    problems.append("MQTT disconnected")
                uptime = status["uptime_ms"]
                if previous_uptime is not None and uptime < previous_uptime:
                    problems.append("camera rebooted")
                previous_uptime = uptime
                if args.capture_every and sample % args.capture_every == 0:
                    response = client.get("/capture")
                    response.raise_for_status()
                    with Image.open(io.BytesIO(response.content)) as image:
                        if image.format != "JPEG":
                            raise ValueError("capture is not JPEG")
                        image.load()
                    captures += 1
                    row["jpeg_bytes"] = len(response.content)
                if problems:
                    row["error"] = "; ".join(problems)
            except (httpx.HTTPError, ValueError, KeyError, OSError) as error:
                row["error"] = f"{type(error).__name__}: {error}"
            row["elapsed_s"] = round(time.monotonic() - started, 3)
            failures += int("error" in row)
            print(json.dumps(row), flush=True)
            if sample < args.samples:
                time.sleep(args.interval)
    print(json.dumps({"samples": args.samples, "failed_samples": failures, "valid_jpegs": captures}))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
