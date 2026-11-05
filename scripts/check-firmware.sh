#!/usr/bin/env bash
# Compile native logic checks and active firmware images; never upload or arm.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
check_dir=$(mktemp -d)
trap 'rm -rf "$check_dir"' EXIT
for source in firmware/tests/*_test.cpp; do
  binary="$check_dir/$(basename "${source%.cpp}")"
  "${CXX:-c++}" -std=c++11 "$source" -o "$binary"
  "$binary"
  echo "PASS $(basename "$source")"
done
uv tool run --from platformio==6.2.0 pio run -d firmware/esp32-cam -e camera
uv tool run --from platformio==6.2.0 pio run -d firmware/esp32-monitor -e station
