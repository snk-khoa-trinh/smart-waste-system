"""The USB reader must accept fragmented status lines without issuing movement."""

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("kind", ["fragmented", "corrupt_then_good", "startup_then_idle"])
def test_usb_status_frame_assembly(monkeypatch, capsys, kind):
    idle = {"mode": "usb-servo-bench", "servo_bench_active": False, "servo_holding_home": True}
    encoded = (json.dumps(idle) + "\n").encode()
    if kind == "fragmented":
        chunks = [encoded[:20], encoded[20:55], encoded[55:]]
    elif kind == "corrupt_then_good":
        chunks = [b'{"mode":BROKEN}\n', encoded]
    else:
        starting = {"mode": "usb-servo-bench", "servo_bench_active": True, "servo_bench_profile": "startup-home"}
        chunks = [(json.dumps(starting) + "\n").encode(), encoded]
    writes = []

    class Port:
        def __init__(self, **kwargs):
            pass

        def open(self):
            pass

        def close(self):
            pass

        def write(self, data):
            writes.append(data)

        def read_until(self, terminator):
            return chunks.pop(0)

    monkeypatch.setitem(sys.modules, "serial", SimpleNamespace(Serial=Port, SerialException=RuntimeError))
    spec = importlib.util.spec_from_file_location(
        "usb_console_test", Path(__file__).resolve().parents[2] / "scripts/servo-usb.py"
    )
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    monkeypatch.setattr(sys, "argv", ["servo-usb.py", "status"])
    helper.main()
    assert json.loads(capsys.readouterr().out) == idle
    assert writes and all(command == b"status\n" for command in writes)
