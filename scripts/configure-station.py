"""Copy the existing private camera control credential into the DevKit header."""

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "firmware/esp32-cam/include/ota.local.h"
match = re.search(
    r'^#define TEST_OTA_PASSWORD ("[^"\n]+")$', source.read_text(), re.MULTILINE
)
if not match or len(json.loads(match.group(1))) < 16:
    raise SystemExit("A valid private camera control credential is required.")
path = ROOT / "firmware/esp32-monitor/include/station.local.h"
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.fchmod(fd, 0o600)
with os.fdopen(fd, "w") as stream:
    stream.write(
        '#pragma once\n// Private; never commit.\n#define STATION_CAMERA_HOST "192.168.1.207"\n'
    )
    stream.write(f"#define STATION_CAMERA_PASSWORD {match.group(1)}\n")
    stream.write(
        '#define STATION_CAMERA_DEVICE "s11-cam"\n#define STATION_PROVIDER "roboflow"\n'
    )
print("Private DevKit camera-control configuration written; credential not displayed.")
