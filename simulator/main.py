"""Seeded synthetic devices using the real HTTP and MQTT interfaces."""

import asyncio
import io
import json
import os
import random
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import aiomqtt
import httpx
from PIL import Image

API = os.getenv("API_URL", "http://localhost:8000")
CATEGORIES = ["recyclable", "non_recyclable", "e_waste"]


def envelope(sid, device, **extra):
    return dict(
        schema_version=1,
        message_id=str(uuid4()),
        station_id=sid,
        device_id=f"{sid}-{device}",
        measured_at=datetime.now(UTC).isoformat(),
        **extra,
    )


async def run():
    rng = random.Random(int(os.getenv("SIMULATOR_SEED", "42")))
    image = io.BytesIO()
    Image.new("RGB", (32, 32), (100, 180, 140)).save(image, "JPEG")
    fills = {(s, c): rng.uniform(5, 85) for s in ["s11", "s12", "s21", "s22"] for c in CATEGORIES}
    tick = 0
    seen_collections = set()
    while True:
        try:
            async with (
                aiomqtt.Client(
                    os.getenv("MQTT_HOST", "localhost"),
                    username="simulator",
                    password=os.getenv("MQTT_SIM_PASSWORD", "simulator-local"),
                ) as mqtt,
                httpx.AsyncClient(base_url=API, timeout=30) as api,
            ):
                while True:

                    async def publish(kind, payload):
                        await mqtt.publish(
                            f"waste/v1/stations/{payload['station_id']}/{payload['device_id']}/{kind}",
                            json.dumps(payload),
                            qos=1,
                        )

                    # Only simulator-owned values reset following a persisted collection.
                    records = await api.get("/api/collections")
                    records.raise_for_status()
                    for record in records.json():
                        if record["id"] not in seen_collections:
                            fills[(record["station_id"], record["category"])] = 0
                            seen_collections.add(record["id"])
                    for sid in ["s11", "s12", "s21", "s22"]:
                        for board in ["cam", "monitor"]:
                            # One board offline while its partner continues reporting.
                            offline = sid == "s22" and board == "cam" and tick % 40 >= 10
                            if not offline:
                                await publish("heartbeat", envelope(sid, board, status="online"))
                            elif tick % 40 == 10:
                                await publish("heartbeat", envelope(sid, board, status="offline"))
                        for category in CATEGORIES:
                            key = (sid, category)
                            fills[key] = min(100, fills[key] + rng.uniform(0.05, 1.0))
                            invalid = sid == "s12" and category == "e_waste" and tick % 12 == 3
                            payload = envelope(
                                sid,
                                "monitor",
                                category=category,
                                fill_percentage=None if invalid else round(fills[key], 1),
                                source="simulated",
                                quality="invalid" if invalid else "valid",
                            )
                            await publish("fill", payload)
                            if tick % 8 == 0:
                                await publish("fill", payload)  # duplicate
                                old = {
                                    **payload,
                                    "message_id": str(uuid4()),
                                    "measured_at": (datetime.now(UTC) - timedelta(minutes=10)).isoformat(),
                                }
                                await publish("fill", old)
                    if tick % 3 == 0:
                        sid = "s11"
                        response = await api.post(
                            "/api/classify",
                            data={
                                "station_id": sid,
                                "device_id": f"{sid}-cam",
                                "request_id": str(uuid4()),
                                "scenario": rng.choice(["plastic", "battery", "trash", "low", "unknown"]),
                            },
                            files={"image": ("synthetic.jpg", image.getvalue(), "image/jpeg")},
                        )
                        if response.is_success:
                            event = response.json()
                            await publish(
                                "outcome",
                                envelope(
                                    sid,
                                    "cam",
                                    event_id=event["id"],
                                    outcome="disabled" if event["decision"] == "unknown" else "completed",
                                    simulated=True,
                                ),
                            )
                        else:
                            print(f"Classification rejected: HTTP {response.status_code}", flush=True)
                    tick += 1
                    print(f"Synthetic telemetry tick {tick}", flush=True)
                    await asyncio.sleep(float(os.getenv("SIMULATOR_INTERVAL", "5")))
        except (aiomqtt.MqttError, httpx.HTTPError, OSError):
            print("Waiting for API/broker; reconnecting in 3s", flush=True)
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run())
