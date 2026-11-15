"""One operator-selected filming cycle: no inlet, camera or inference request."""

import argparse
import json
import subprocess
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {"recyclable": "home", "non_recyclable": "reverse", "e_waste": "side"}


def run_cycle(category, api, station, device):
    # Check readiness without opening USB (opening can reset/home the board).
    with httpx.Client(base_url=api, timeout=15, trust_env=False) as client:
        client.get("/api/ready").raise_for_status()
        event_id = str(uuid4())
        journal_dir = ROOT / ".hardware-backups" / "filming"
        journal_dir.mkdir(parents=True, exist_ok=True)
        journal = journal_dir / f"{event_id}.json"
        state = {"event_id": event_id, "category": category, "motion": "not_sent"}

        def save():
            journal.write_text(json.dumps(state, indent=2) + "\n")

        save()
        client.post("/api/filming/events", json={
            "request_id": event_id, "station_id": station, "device_id": device, "category": category,
        }).raise_for_status()
        print(f"FILMING event {event_id}; selected {category}; no inference.", flush=True)
        # Persist uncertainty BEFORE issuing motion. Never retry this subprocess.
        state["motion"] = "sent_or_uncertain"
        save()
        result = subprocess.run([
            "uv", "tool", "run", "--from", "platformio==6.2.0", "python",
            str(ROOT / "scripts" / "servo-usb.py"), "cycle", "--route", ROUTES[category],
            "--wiring-confirmed", "--clearance-confirmed",
        ], cwd=ROOT, check=False)
        if result.returncode:
            raise RuntimeError(f"Motion unconfirmed; do not replay. Event {event_id} has no outcome. Journal: {journal}")
        state["motion"] = "command_sequence_completed"
        save()
        client.post("/api/outcomes", json={
            "event_id": event_id, "outcome": "completed", "simulated": True,
        }).raise_for_status()
        state["outcome"] = "recorded"
        save()
        print("Scripted sequence recorded. Visually confirm the drop; this is not recognition evidence.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("category", choices=ROUTES)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--station", default="s11")
    parser.add_argument("--device", default="s11-cam")
    parser.add_argument("--wiring-confirmed", action="store_true")
    parser.add_argument("--clearance-confirmed", action="store_true")
    args = parser.parse_args()
    if not (args.wiring_confirmed and args.clearance_confirmed):
        parser.error("Confirm --wiring-confirmed and --clearance-confirmed before real motor operation")
    try:
        run_cycle(args.category, args.api, args.station, args.device)
    except (httpx.HTTPError, OSError, RuntimeError) as exc:
        raise SystemExit(f"Filming stopped ({type(exc).__name__}); no automatic motion retry. Check local journal/status.") from None


if __name__ == "__main__":
    main()
