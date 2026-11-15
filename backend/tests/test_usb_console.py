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


@pytest.mark.parametrize("mode", ["old_firmware", "auto_busy", "completed"])
def test_filming_reverse_guards_and_return(monkeypatch, capsys, mode):
    idle = {
        "mode": "usb-servo-bench", "servo_bench_active": False,
        "servo_bench_available": True, "servo_bench_completed": 0,
        "filming_reverse_supported": mode != "old_firmware",
        "sorting_cycle_supported": True, "automatic_busy": mode == "auto_busy",
        "classifier_side_us": 2000, "classifier_home_us": 700, "opener_closed_us": 1800,
    }
    done = idle | {
        "servo_bench_completed": 1, "classifier_command_us": 2000,
        "opener_command_us": 1800, "servo_holding_home": False,
    }
    chunks = [(json.dumps(body) + "\n").encode() for body in [idle, done]]
    writes = []

    class Port:
        def __init__(self, **kwargs):
            pass

        def open(self):
            pass

        def close(self):
            pass

        def flush(self):
            pass

        def write(self, data):
            writes.append(data)

        def read_until(self, terminator):
            return chunks.pop(0)

    monkeypatch.setitem(sys.modules, "serial", SimpleNamespace(Serial=Port, SerialException=RuntimeError))
    spec = importlib.util.spec_from_file_location(
        "usb_reverse_test", Path(__file__).resolve().parents[2] / "scripts/servo-usb.py"
    )
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    monkeypatch.setattr(sys, "argv", ["servo-usb.py", "cycle", "--route", "reverse", "--wiring-confirmed", "--clearance-confirmed"])
    if mode != "completed":
        with pytest.raises(SystemExit):
            helper.main()
        assert all(command == b"status\n" for command in writes)
    else:
        helper.main()
        assert writes.count(b"cycle reverse\n") == 1
