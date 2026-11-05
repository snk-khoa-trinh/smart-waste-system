"""Read camera inlet distances without arming capture, inference or motors.

Run: uv run --directory backend python ../scripts/diagnostics/watch-inlet.py
"""
import argparse
import datetime
import time

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="waste-s11-cam.local")
    parser.add_argument("--samples", type=int, default=120)
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args()
    if args.samples < 1 or args.interval < 0.1:
        parser.error("samples must be positive and interval must be at least 0.1 seconds")
    distances = []
    last_mode = None
    with httpx.Client(base_url=f"http://{args.host}", timeout=4, trust_env=False) as client:
        for _ in range(args.samples):
            started = time.monotonic()
            stamp = datetime.datetime.now().strftime("%H:%M:%S")
            try:
                response = client.get("/status")
                response.raise_for_status()
                data = response.json()
                mode = data.get("inlet_detection_mode", "proximity")
                if mode != last_mode:
                    limits = (f"baseline={data.get('inlet_baseline_cm')}cm drop={data.get('inlet_drop_cm')}cm"
                              if mode == "drop" else f"near={data.get('inlet_near_cm')}cm clear={data.get('inlet_clear_cm')}cm")
                    print(f"Detection: {mode}; {limits}", flush=True)
                    last_mode = mode
                valid = data.get("inlet_distance_valid") is True
                cm = data.get("inlet_distance_cm")
                if valid and isinstance(cm, (float, int)):
                    distances.append(cm)
                    value = f"{cm:.1f} cm"
                else:
                    value = "NO VALID ECHO"
                latch = "waiting for clear" if data.get("inlet_waiting_for_clear") else "clear latch ready"
                if data.get("inlet_arrival_pending"):
                    latch = f"DROP LOCKED #{data.get('inlet_arrival_id')}; frame={data.get('inlet_arrival_frame_ready')}"
                print(f"{stamp}  {value:>15}  {latch}; sensor enabled={data.get('inlet_enabled')}", flush=True)
            except (httpx.HTTPError, ValueError) as error:
                print(f"{stamp}  Camera unavailable: {type(error).__name__}", flush=True)
            time.sleep(max(0, args.interval - (time.monotonic() - started)))
    if distances:
        print(f"Observed {len(distances)} valid replies: min {min(distances):.1f} cm, max {max(distances):.1f} cm")
    else:
        print("No valid distance replies. Check camera connectivity, sensor enablement and wiring.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
