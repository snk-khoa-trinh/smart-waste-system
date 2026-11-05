# Backend agent rules

Read [root baseline](../AGENTS.md) and [backend guide](README.md).

- Use uv and keep `uv.lock` synchronized with `pyproject.toml`.
- Keep API contracts, MQTT schemas, normalization and database migrations in sync.
  Update [API](../docs/api.md) and [MQTT](../docs/mqtt.md) when contracts change.
- Use additive/idempotent seeds; never overwrite readings, collections, existing
  hardware IDs or outcomes to make a demonstration look healthy.
- Preserve image byte/pixel checks, provider failure handling, request-ID
  idempotency and separate immutable outcomes. Image-lab tests do not create bin
  events or actuate hardware. No silent provider fallback or paid retries.
- Retain source/quality/timestamp metadata and truthful stale/missing semantics.
- Keep regressions in `tests/` committed. Use mock providers and isolated SQLite
  fixtures; validation must not consume real inference credits or touch hardware.
- Run the Ruff and pytest commands in [README](README.md). Use a temporary database
  for migration checks rather than the user's existing database.
