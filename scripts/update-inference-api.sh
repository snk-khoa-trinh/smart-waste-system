#!/usr/bin/env bash
# Update API and matching migration/seed initializer; preserve deployment overrides.
set -euo pipefail
cd "$(dirname "$0")/.."
for config_file in .env .env.hardware .env.roboflow; do
  if [[ ! -f "$config_file" ]]; then
    echo "Missing $config_file; use your deployment's Compose configuration to rebuild the API." >&2
    exit 1
  fi
done
compose=(docker compose
  --env-file .env --env-file .env.hardware --env-file .env.roboflow
  -f compose.yaml -f compose.hardware.yaml -f compose.roboflow.yaml)
"${compose[@]}" build api init
# Reuse the existing database container/volume; wait before running migrations.
"${compose[@]}" up -d --no-deps --no-recreate --wait db
# Replace the named initializer too. An older image may not recognize the database's
# newer Alembic revision, blocking later ordinary Compose dependency starts.
"${compose[@]}" up --no-deps --no-build --force-recreate --exit-code-from init init
echo 'Migrations and additive location seed completed; starting API.'
"${compose[@]}" up -d --no-build --no-deps --wait api
