"""Finite synthetic fill animation in a separate filming-demo bin; no physical telemetry overwritten."""

import argparse
import math
import time
from uuid import uuid4

import httpx


def fill_values(end, step):
    if not 0 <= end <= 100 or step <= 0:
        raise ValueError("end must be 0..100 and step must be positive")
    values = list(range(0, end + 1, step))
    return values if values[-1] == end else [*values, end]


def animate(api, category, end, step, interval):
    values = fill_values(end, step)
    for index, value in enumerate(values):
        response = api.post("/api/filming/fill", json={
            "message_id": str(uuid4()), "category": category, "fill": value,
        })
        response.raise_for_status()
        print(f"Filming demo (SYNTHETIC): {category} = {value}%", flush=True)
        if index + 1 < len(values):
            time.sleep(interval)
    print("Finished. Open Bins → Filming demo (synthetic). The reading stays labelled synthetic and ages normally.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", choices=["recyclable", "non_recyclable", "e_waste"], default="recyclable")
    parser.add_argument("--end", type=int, default=50)
    parser.add_argument("--step", type=int, default=10)
    parser.add_argument("--interval", type=float, default=1)
    parser.add_argument("--prepare", action="store_true", help="Create/reset only the synthetic demo reading to zero percent")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval < 1:
        parser.error("interval must be a finite value of at least 1 second")
    try:
        fill_values(args.end, args.step)
        with httpx.Client(base_url=args.api, timeout=15, trust_env=False) as api:
            animate(api, args.category, 0 if args.prepare else args.end, args.step, args.interval)
    except (ValueError, httpx.HTTPError):
        raise SystemExit("Fill demo stopped; check arguments/backend. No automatic retries or hardware actions.") from None


if __name__ == "__main__":
    main()
