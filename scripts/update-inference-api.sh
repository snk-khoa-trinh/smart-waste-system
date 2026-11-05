#!/usr/bin/env bash
# Rebuild only the API while preserving the configured hardware/Roboflow overrides.
set -euo pipefail
cd "$(dirname "$0")/.."
for config_file in .env .env.hardware .env.roboflow; do
  if [[ ! -f "$config_file" ]]; then
    echo "Missing $config_file; use your deployment's Compose configuration to rebuild the API." >&2
    exit 1
  fi
done
docker compose \
  --env-file .env --env-file .env.hardware --env-file .env.roboflow \
  -f compose.yaml -f compose.hardware.yaml -f compose.roboflow.yaml \
  up -d --build --no-deps --wait api
