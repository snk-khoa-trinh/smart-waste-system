# Repository baseline for agents

Read [README](README.md), then the instructions for every folder you change:
[backend](backend/AGENTS.md), [frontend](frontend/AGENTS.md),
[firmware](firmware/AGENTS.md), [scripts](scripts/AGENTS.md),
[infra](infra/AGENTS.md), [simulator](simulator/AGENTS.md),
[docs](docs/AGENTS.md), [.github](.github/AGENTS.md).
These instructions are scoped by directory; cross-folder work must preserve the
contracts described in [architecture](docs/architecture.md) and [API](docs/api.md).

## Architecture and tools

- FastAPI/SQLAlchemy/Alembic own API, persistence and inference normalization.
  MQTT worker ingestion is separate from HTTP request handling.
- Frontend is Vite + React + TypeScript, TanStack Router/Query, shadcn/ui and
  Tailwind. Use Nub 0.9.0, not npm or Bun; preserve `nub.lock`.
- Use uv for Python and `uv tool run --from platformio==6.2.0 pio ...` for firmware.
  No PlatformIO VS Code extension is required.
- Active firmware sources are `firmware/esp32-cam/src/camera.cpp` (environment
  `camera`) and `firmware/esp32-monitor/src/station.cpp` (environment `station`).
  The DevKit controls both servos; the camera retains inlet snapshots.

## Preserve the working prototype

- Never print or commit `.env`, `.env.hardware`, `.env.roboflow`, private
  `*.local.h` headers, API keys or device/OTA passwords. Change templates only;
  preserve existing local configuration. Never put secrets in shell arguments.
- Classification is a prediction; a separate outcome reports the motion result.
  Preserve raw labels and distinguish simulated, stale, invalid and missing data.
- Do not introduce automatic paid inference retries, motor replay after restart,
  or overlapping laptop and firmware control. Preserve arrival locks, journals,
  fresh-frame checks and clear-before-rearm behavior.
- Do not use real inference, arm sorting, flash a connected board, start the demo
  simulator, or recreate live containers merely to verify a code/docs cleanup.
  Prior user authorization in the session remains valid for the authorized task;
  do not repeatedly ask for permission already given.
- Keep user changes and private files intact. Do not reset the working tree,
  stage unrelated changes, delete Docker volumes, or treat a build as hardware
  validation. Tests are committed source; local experiments belong in ignored
  `scripts/local/` and are never runtime/CI dependencies.

## Validation and documentation

Run checks relevant to the changed folders; see their READMEs. Update callers,
CI, documentation and tests when moving a file or changing a build target.
Keep the root README as the entry map; put detailed commands in folder guides.
Report exactly what was verified and any hardware checks still pending.
