# Backend

FastAPI provides configuration, bin readings, collections, image classification
and separate sorting outcomes. The MQTT worker persists heartbeats and fill
telemetry independently. PostgreSQL is used in Compose; SQLite supports local
mock development and isolated tests.

[Repository guide](../README.md) · [Agent rules](AGENTS.md) · [HTTP contract](../docs/api.md)

## Code map

- `app/main.py`: HTTP routes, JPEG validation and independent image-lab endpoints.
- `app/inference.py`: mock/Roboflow adapters and normalized decisions.
- `app/ingest.py`, `app/worker.py`: MQTT validation, deduplication and ingestion.
- `app/db.py`, `migrations/`: persistence schema and Alembic migrations.
- `app/seed.py`: additive building/floor/bin configuration; preserves hardware IDs.
- `tests/`: committed API, protocol, USB parsing and broker-preflight regressions.

## Local commands

Run from the repository root. Create `.env` from the root template on a fresh
checkout and retain `INFERENCE_PROVIDER=mock` for development.

```sh
uv sync --directory backend --frozen
uv run --directory backend alembic upgrade head
uv run --directory backend python -m app.seed
uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The MQTT worker needs a configured broker: `uv run --directory backend python -m app.worker`.
Container service commands and existing hardware deployment are in the root guide.

```sh
uv run --directory backend ruff check app tests migrations ../scripts ../simulator
uv run --directory backend pytest -q
```

Tests use isolated databases/mocked providers and must not call the real Roboflow
workflow. Backend changes require an API image rebuild for the live Compose stack;
frontend hot reload does not reload the backend. Tests are excluded from the
production Docker build context, not from Git.
