#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if ! docker info >/dev/null 2>&1; then
  echo 'Docker access required. Run: sudo ./scripts/seed-locations.sh' >&2
  exit 1
fi
# Apply the checkout's additive seed in the running API's database environment.
# This also works before rebuilding an older API image. No services are restarted.
docker compose exec -T api python -c \
  'import sys; exec(compile(sys.stdin.read(), "app/seed.py", "exec"), {"__name__": "__main__", "__package__": "app"})' \
  < backend/app/seed.py
