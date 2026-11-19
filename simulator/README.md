# Simulator

Explicit synthetic data for the software demonstration. It provides independent
heartbeats and fill measurements for the original campus demo bins; it does not
turn additional seeded mall placeholders into physical sensors or control motors.

[Repository guide](../README.md) · [Agent rules](AGENTS.md)

- `main.py`: repeatable MQTT measurements using `SIMULATOR_SEED`.
- `verify.py`: isolated integration checks across HTTP, MQTT and persistence.

```sh
# Fresh .env from the root template, with INFERENCE_PROVIDER=mock:
docker compose --profile demo up --build -d --wait
docker compose exec -T api python /app/simulator/verify.py
```

Run this against an isolated demo, not the user's physical hardware/Roboflow stack.
The integration verifier writes records and performs mock classification.
Hardware broker repair stops the simulator and excludes its account from the
hardware ACL to prevent collisions with real device identities.
