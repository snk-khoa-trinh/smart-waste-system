#!/usr/bin/env bash
# Full one-item test uses the same firmware controller as continuous operation.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo 'Usage: ./scripts/test-full-sequence.sh'
  echo 'MQTT preflight, then one autonomous inlet -> snapshot -> classification -> sorting/outcome cycle.'
  echo 'Camera discovery/configuration belongs to station firmware. No laptop motor bridge.'
  exit 0
fi
if [[ $# != 0 ]]; then
  echo 'No camera argument needed; the station discovers its configured camera.' >&2
  exit 2
fi
exec ./scripts/station-auto.sh once
