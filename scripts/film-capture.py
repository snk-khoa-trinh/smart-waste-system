"""Save one inlet-triggered JPEG against a prior scripted filming record; no inference or motors."""

import argparse
import importlib.util
import ipaddress
import json
import math
import socket
import time
from pathlib import Path
from uuid import UUID

import httpx

ROOT = Path(__file__).resolve().parents[1]


def camera_address(host):
    if host.endswith(".local"):
        host = socket.gethostbyname(host)
    address = ipaddress.IPv4Address(host)
    if not address.is_private or address.is_loopback or address.is_unspecified:
        raise ValueError("Use a private camera address or .local hostname")
    return str(address)


def select_event(api, category, event_id):
    response = api.get("/api/events", params={"station_id": "s11"})
    response.raise_for_status()
    candidates = [event for event in response.json()
                  if event["provider"] == "filming" and event["decision"] == category
                  and event["outcome"] == "completed" and (not event_id or event["id"] == event_id)]
    if not candidates:
        raise ValueError("No matching completed filming record among the latest 50 S11 events; check Records/event ID")
    return candidates[0]


def capture_once(camera, api, event, auth, output, timeout, delay_ms=None):
    event_id = str(UUID(event["id"]))
    attached = api.get(f"/api/filming/events/{event_id}/capture")
    if attached.status_code != 404:
        attached.raise_for_status()
        raise ValueError("That event already has an image; original preserved")
    status = camera.get("/status")
    status.raise_for_status()
    initial = status.json()
    if initial.get("inlet_drop_locked") or initial.get("inlet_arrival_capture_pending") or initial.get("automatic_capture"):
        raise ValueError("Camera has active/pending work; disarm/review it before starting a new photo")
    output.mkdir(parents=True, exist_ok=True)
    image_path = output / f"{event['decision']}-{event_id}.jpg"
    manifest_path = image_path.with_suffix(".json")
    if image_path.exists() or manifest_path.exists():
        raise ValueError("Local capture already exists; original preserved")
    payload = {"wiring_confirmed": True, "detection_mode": "drop"}
    if delay_ms is not None:
        payload["capture_delay_ms"] = delay_ms
    try:
        response = camera.post("/inlet/enable", auth=auth, json=payload)
        response.raise_for_status()
        print("Photo-only detection enabled. Keep inlet EMPTY until READY; no classification or motors.", flush=True)
        deadline = time.monotonic() + timeout
        ready_announced = False
        while time.monotonic() < deadline:
            response = camera.get("/status")
            response.raise_for_status()
            state = response.json()
            if state.get("automatic_capture"):
                raise ValueError("Camera classification was armed by another controller; aborting")
            if (not state.get("inlet_waiting_for_clear") and not state.get("inlet_drop_locked")
                    and not ready_announced):
                print("READY: insert ONE item and withdraw hands; leave it resting for the delayed photo.", flush=True)
                ready_announced = True
            if state.get("inlet_arrival_pending"):
                if not state.get("inlet_arrival_frame_ready"):
                    raise ValueError("Arrival detected but no fresh frame retained")
                arrival = str(UUID(state["inlet_arrival_key"]))
                response = camera.get("/capture", params={"arrival_id": arrival})
                response.raise_for_status()
                image_path.write_bytes(response.content)
                manifest = {"event": event, "arrival_id": arrival, "camera_status": {
                    key: value for key, value in state.items() if key.startswith("inlet_")},
                    "note": "Separate staged capture after the motor take; not automatic classification evidence."}
                manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
                response = api.post(f"/api/filming/events/{event_id}/image",
                                    data={"arrival_id": arrival},
                                    files={"image": (image_path.name, image_path.read_bytes(), "image/jpeg")})
                response.raise_for_status()
                manifest["backend_capture"] = response.json()
                manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
                print(f"Saved {image_path}\nBackend image: {api.base_url.join(response.json()['image_url'])}", flush=True)
                return
            time.sleep(0.3)
        raise TimeoutError("No inlet photo received before timeout")
    finally:
        # Disarm even if enabling timed out ambiguously. Never re-arm automatically.
        try:
            camera.post("/inlet/disarm", auth=auth, json={}).raise_for_status()
        except httpx.HTTPError:
            print("Camera disarm unconfirmed. Keep station auto OFF and disarm camera before another attempt.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("category", choices=["recyclable", "non_recyclable", "e_waste"])
    parser.add_argument("--host", default="waste-s11-cam.local")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--event-id", type=UUID)
    parser.add_argument("--timeout", type=float, default=180)
    parser.add_argument("--capture-delay-ms", type=int)
    parser.add_argument("--auto-disabled-confirmed", action="store_true")
    parser.add_argument("--empty-confirmed", action="store_true")
    args = parser.parse_args()
    if not (args.auto_disabled_confirmed and args.empty_confirmed):
        parser.error("Disable station auto, clear the inlet, then supply --auto-disabled-confirmed --empty-confirmed")
    if not math.isfinite(args.timeout) or args.timeout < 5 or args.capture_delay_ms is not None and not 0 <= args.capture_delay_ms <= 1500:
        parser.error("timeout must be >=5 seconds; capture delay must be 0..1500ms")
    spec = importlib.util.spec_from_file_location("camera_control", ROOT / "scripts/camera-control.py")
    control = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(control)
    try:
        address = camera_address(args.host)
        with httpx.Client(base_url=args.api, timeout=15, trust_env=False) as api:
            api.get("/api/ready").raise_for_status()
            schema = api.get("/openapi.json")
            schema.raise_for_status()
            if "/api/filming/events/{event_id}/image" not in schema.json().get("paths", {}):
                raise ValueError("Rebuild/migrate backend before capturing")
            event = select_event(api, args.category, str(args.event_id) if args.event_id else None)
            with httpx.Client(base_url=f"http://{address}", timeout=15, trust_env=False) as camera:
                capture_once(camera, api, event, ("admin", control.password()),
                             ROOT / ".hardware-backups/filming/captures", args.timeout, args.capture_delay_ms)
    except (ValueError, TimeoutError) as exc:
        raise SystemExit(f"Capture stopped: {exc}") from None
    except (httpx.HTTPError, OSError) as exc:
        raise SystemExit(f"Capture stopped ({type(exc).__name__}). Check connectivity/record and local capture backup; no inference/motion replay.") from None


if __name__ == "__main__":
    main()
