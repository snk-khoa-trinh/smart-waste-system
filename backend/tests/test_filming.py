"""Filming must issue at most one motor command, never replay uncertain motion."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest


@pytest.mark.parametrize("failure", [None, "create", "motion", "outcome"])
def test_filming_order_and_failure_journal(monkeypatch, tmp_path, failure):
    spec = importlib.util.spec_from_file_location("filming", Path(__file__).resolve().parents[2] / "scripts/film-cycle.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = tmp_path
    calls = []

    class Response:
        def __init__(self, phase):
            self.phase = phase

        def raise_for_status(self):
            if failure == self.phase:
                raise httpx.ConnectError("offline")

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get(self, path):
            calls.append(path)
            return Response("ready")

        def post(self, path, json):
            calls.append(path)
            if path.endswith("outcomes"):
                assert json["simulated"] is True
            return Response("create" if path.endswith("events") else "outcome")

    def motor(command, **kwargs):
        calls.append("motor")
        assert command[command.index("--route") + 1] == "reverse"
        state = json.loads(next((tmp_path / ".hardware-backups/filming").glob("*.json")).read_text())
        assert state["motion"] == "sent_or_uncertain"
        return SimpleNamespace(returncode=1 if failure == "motion" else 0)

    monkeypatch.setattr(module.httpx, "Client", Client)
    monkeypatch.setattr(module.subprocess, "run", motor)
    if failure:
        with pytest.raises((httpx.HTTPError, RuntimeError)):
            module.run_cycle("non_recyclable", "http://localhost", "s11", "s11-cam")
    else:
        module.run_cycle("non_recyclable", "http://localhost", "s11", "s11-cam")
    assert calls.count("motor") == (0 if failure == "create" else 1)
    assert "/api/outcomes" not in calls if failure in {"create", "motion"} else calls[-1] == "/api/outcomes"
    assert not any("classify" in call or "inference" in call for call in calls)


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[2] / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_fill_demo_steps_and_pacing(monkeypatch):
    module = load_script("film-fill")
    calls, sleeps = [], []

    class API:
        def post(self, path, json):
            assert path == "/api/filming/fill"
            calls.append(json)
            return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(module.time, "sleep", sleeps.append)
    module.animate(API(), "recyclable", 50, 10, 1)
    assert [call["fill"] for call in calls] == [0, 10, 20, 30, 40, 50]
    assert len({call["message_id"] for call in calls}) == 6
    assert sleeps == [1] * 5
    with pytest.raises(ValueError):
        module.fill_values(101, 10)


@pytest.mark.parametrize("failure", [None, "upload", "no_frame", "pending"])
def test_capture_uses_retained_arrival_no_inference_and_disarms(monkeypatch, tmp_path, failure):
    module = load_script("film-capture")
    event_id, arrival_id = "a" * 32, "b" * 32
    calls = []
    camera_states = [
        {"inlet_drop_locked": failure == "pending"},
        {"inlet_waiting_for_clear": False, "inlet_drop_locked": False},
        {"inlet_arrival_pending": True, "inlet_arrival_frame_ready": failure != "no_frame", "inlet_arrival_key": arrival_id},
    ]
    monkeypatch.setattr(module.time, "sleep", lambda _: None)

    class Camera:
        def get(self, path, **kwargs):
            calls.append(("camera", path, kwargs))
            if path == "/status":
                return SimpleNamespace(raise_for_status=lambda: None, json=lambda: camera_states.pop(0))
            assert kwargs["params"]["arrival_id"] == str(module.UUID(arrival_id))
            return SimpleNamespace(raise_for_status=lambda: None, content=b"test JPEG")

        def post(self, path, **kwargs):
            calls.append(("camera", path, kwargs))
            assert path in {"/inlet/enable", "/inlet/disarm"}
            assert not kwargs.get("json", {}).get("classification", False)
            return SimpleNamespace(raise_for_status=lambda: None)

    class API:
        base_url = httpx.URL("http://localhost:8000")

        def get(self, path):
            return SimpleNamespace(status_code=404)

        def post(self, path, **kwargs):
            calls.append(("api", path, kwargs))
            assert path.endswith("/image")
            if failure == "upload":
                raise httpx.ConnectError("offline")
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"image_url": path})

    event = {"id": event_id, "decision": "e_waste"}
    if failure:
        with pytest.raises((ValueError, httpx.HTTPError)):
            module.capture_once(Camera(), API(), event, ("admin", "test-only"), tmp_path, 5)
    else:
        module.capture_once(Camera(), API(), event, ("admin", "test-only"), tmp_path, 5)
    paths = [call[1] for call in calls]
    assert not any("classify" in path or path == "/inlet/arm" for path in paths)
    if failure == "pending":
        assert "/inlet/enable" not in paths and "/inlet/disarm" not in paths
    else:
        assert paths[-1] == "/inlet/disarm" and paths.count("/inlet/enable") == 1
    if failure in {None, "upload"}:
        assert len(list(tmp_path.glob("*.jpg"))) == 1
        assert len(list(tmp_path.glob("*.json"))) == 1


@pytest.mark.parametrize("name", ["film-capture", "film-fill"])
def test_filming_helper_help_needs_no_hardware(monkeypatch, name):
    import sys

    module = load_script(name)
    monkeypatch.setattr(sys, "argv", [name, "--help"])
    with pytest.raises(SystemExit) as result:
        module.main()
    assert result.value.code == 0
