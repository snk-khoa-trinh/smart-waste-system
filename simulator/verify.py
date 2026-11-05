"""Run with the stack up: docker compose exec -T api python /app/simulator/verify.py."""

import asyncio
import io
import json
import os
from datetime import UTC, datetime
from uuid import uuid4

import aiomqtt
import httpx
from PIL import Image


async def verify():
    api_url = os.getenv("API_URL", "http://127.0.0.1:8000")
    async with httpx.AsyncClient(base_url=api_url, timeout=30) as api:
        response = await api.get("/api/ready")
        response.raise_for_status()
        mid = str(uuid4())
        payload = {
            "schema_version": 1,
            "message_id": mid,
            "station_id": "s21",
            "device_id": "s21-monitor",
            "measured_at": datetime.now(UTC).isoformat(),
            "category": "e_waste",
            "fill_percentage": 64.3,
            "source": "simulated",
            "quality": "valid",
        }
        async with aiomqtt.Client(
            os.getenv("MQTT_HOST", "localhost"),
            username="simulator",
            password=os.getenv("MQTT_SIM_PASSWORD", "simulator-local"),
        ) as mqtt:
            topic = "waste/v1/stations/s21/s21-monitor/fill"
            for _ in range(2):
                await mqtt.publish(topic, json.dumps(payload), qos=1)
        for _ in range(30):
            rows = (await api.get("/api/stations/s21/telemetry")).json()
            if any(r["id"] == mid for r in rows):
                break
            await asyncio.sleep(1)
        else:
            raise AssertionError("MQTT message did not reach persisted API telemetry")
        assert sum(r["id"] == mid for r in rows) == 1, "Duplicate message stored"
        image = io.BytesIO()
        Image.new("RGB", (16, 16), "green").save(image, "JPEG")
        rid = str(uuid4())
        result = await api.post(
            "/api/classify",
            data={"station_id": "s21", "device_id": "s21-cam", "request_id": rid, "scenario": "plastic"},
            files={"image": ("synthetic.jpg", image.getvalue(), "image/jpeg")},
        )
        result.raise_for_status()
        event = result.json()
        assert event["provider"] == "mock" and event["decision"] == "recyclable"
        assert event["outcome"] is None
        payload = {
            "schema_version": 1,
            "message_id": str(uuid4()),
            "station_id": "s21",
            "device_id": "s21-cam",
            "measured_at": datetime.now(UTC).isoformat(),
            "event_id": rid,
            "outcome": "completed",
            "simulated": True,
        }
        async with aiomqtt.Client(
            os.getenv("MQTT_HOST", "localhost"),
            username="simulator",
            password=os.getenv("MQTT_SIM_PASSWORD", "simulator-local"),
        ) as mqtt:
            await mqtt.publish("waste/v1/stations/s21/s21-cam/outcome", json.dumps(payload), qos=1)
        for _ in range(30):
            events = (await api.get("/api/events?station_id=s21")).json()
            event = next(e for e in events if e["id"] == rid)
            if event["outcome"] == "completed":
                break
            await asyncio.sleep(1)
        assert event["outcome"] == "completed" and event["simulated"]
        print(
            "PASS: MQTT → worker → persistence → API; duplicate ignored; JPEG → mock → decision → separate MQTT outcome"
        )


if __name__ == "__main__":
    asyncio.run(verify())
