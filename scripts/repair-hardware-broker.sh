#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if ! docker info >/dev/null 2>&1; then
  echo 'Docker access required. Run: sudo ./scripts/repair-hardware-broker.sh' >&2
  exit 1
fi
if [[ ! -f .env.hardware ]]; then
  echo 'Missing .env.hardware; restore hardware credentials before proceeding.' >&2
  exit 1
fi
compose=(docker compose --env-file .env --env-file .env.hardware -f compose.yaml -f compose.hardware.yaml)
# Restore board-specific users and ACLs, preserving API provider and database.
docker compose stop simulator
"${compose[@]}" run --rm --no-deps broker-init
"${compose[@]}" up -d --force-recreate --no-deps --wait broker
docker compose restart worker
# Replace the stopped base initializer too: its previously saved command may
# predate the preserve-existing-config guard in compose.yaml. Do not start it.
docker compose create --no-deps broker-init
echo 'Hardware broker credentials restored. Boards retry automatically; API settings preserved.'
