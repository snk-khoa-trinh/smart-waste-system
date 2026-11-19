import asyncio
import json
import logging
from pathlib import Path

import aiomqtt
from sqlalchemy.exc import IntegrityError

from .config import settings
from .db import Session
from .ingest import ingest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)
CONNECTED = Path("/tmp/mqtt-connected")


async def run():
    CONNECTED.unlink(missing_ok=True)
    while True:
        try:
            async with aiomqtt.Client(
                settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_user,
                password=settings.mqtt_password,
                identifier="waste-worker-v1",
            ) as client:
                await client.subscribe("waste/v1/stations/+/+/+", qos=1)
                CONNECTED.touch()
                log.info("MQTT worker connected")
                async for message in client.messages:
                    with Session() as db:
                        try:
                            ingest(db, str(message.topic), json.loads(message.payload))
                        except (ValueError, IntegrityError):
                            db.rollback()
                            log.warning("Rejected invalid or concurrent duplicate MQTT message on %s", message.topic)
        except (aiomqtt.MqttError, OSError):
            CONNECTED.unlink(missing_ok=True)
            log.warning("MQTT unavailable; reconnecting in 3 seconds")
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(run())
