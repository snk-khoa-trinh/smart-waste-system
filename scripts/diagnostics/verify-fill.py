"""Wait for new monitor sensor telemetry; never send synthetic test messages."""

import argparse
import time
from datetime import UTC, datetime

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True, choices=["recyclable", "non_recyclable", "e_waste"])
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--quality", choices=["valid", "missing", "invalid"], default="valid")
    parser.add_argument("--expected-fill", type=float)
    parser.add_argument("--tolerance", type=float, default=10)
    args = parser.parse_args()
    if args.tolerance < 0 or (args.expected_fill is not None and not 0 <= args.expected_fill <= 100):
        parser.error("Expected fill must be 0..100 and tolerance must be nonnegative.")
    if args.expected_fill is not None and args.quality != "valid":
        parser.error("Expected fill requires valid quality.")
    started = datetime.now(UTC)
    with httpx.Client(base_url=args.api, timeout=5) as client:
        ready = client.get("/api/ready")
        ready.raise_for_status()
        print("Waiting up to 45 seconds for a NEW physical monitor reading...", flush=True)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            response = client.get("/api/stations/s11/telemetry")
            response.raise_for_status()
            for row in response.json():
                if (
                    row["device_id"] != "s11-monitor"
                    or row["category"] != args.category
                    or row["source"] != "sensor"
                    or row["quality"] != args.quality
                    or datetime.fromisoformat(row["measured_at"]) < started
                ):
                    continue
                fill = row["fill"]
                if args.quality == "valid":
                    if fill is None or not 0 <= fill <= 100:
                        continue
                    if args.expected_fill is not None and abs(fill - args.expected_fill) > args.tolerance:
                        continue
                elif fill is not None:
                    continue
                station_response = client.get("/api/stations/s11")
                station_response.raise_for_status()
                station = station_response.json()
                others = [c for c in station["compartments"] if c["category"] != args.category]
                if len(others) != 2 or any(
                    c["source"] != "simulated"
                    or c["measured_at"] is None
                    or datetime.fromisoformat(c["measured_at"]) < started
                    for c in others
                ):
                    continue
                print(
                    f"PASS: {args.category} sensor quality={args.quality}, fill={fill}, "
                    f"measured_at={row['measured_at']}; other compartments explicitly simulated."
                )
                return
            time.sleep(2)
    raise SystemExit("No matching fresh sensor reading. Check serial, calibration, MQTT and worker logs.")


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise SystemExit(f"Verification failed: {exc}") from None
