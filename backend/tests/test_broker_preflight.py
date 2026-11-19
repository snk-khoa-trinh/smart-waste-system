"""Broker recovery must succeed before a script can send an arm/motor command."""
import importlib.util
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("broker_preflight", ROOT / "scripts/ensure-hardware-broker.py")
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


@pytest.fixture
def broker(monkeypatch):
    monkeypatch.setattr(preflight, "credentials", lambda: ("192.168.1.1", [("camera", "user", "private-password")]))
    repairs = []
    monkeypatch.setattr(preflight, "repair", lambda: repairs.append(True))
    return repairs


def test_healthy_accounts_do_not_require_docker(broker, monkeypatch):
    monkeypatch.setattr(preflight, "check", lambda *_: [])
    preflight.ensure()
    assert not broker


def test_rejected_accounts_are_repaired_once_and_rechecked(broker, monkeypatch, capsys):
    checks = iter([["camera: Not authorized"], []])
    monkeypatch.setattr(preflight, "check", lambda *_: next(checks))
    preflight.ensure()
    assert len(broker) == 1
    assert "private-password" not in capsys.readouterr().out


def test_still_rejected_after_repair_stops_before_arming(broker, monkeypatch):
    monkeypatch.setattr(preflight, "check", lambda *_: ["camera: Not authorized"])
    with pytest.raises(RuntimeError, match="after one repair"):
        preflight.ensure()
    assert len(broker) == 1


def test_readonly_check_never_repairs(broker, monkeypatch):
    monkeypatch.setattr(preflight, "check", lambda *_: ["camera: Not authorized"])
    with pytest.raises(RuntimeError, match="no changes made"):
        preflight.ensure(check_only=True)
    assert not broker


def test_credential_mismatch_is_rejected_without_disclosing_password(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("")
    (tmp_path / ".env.hardware").write_text("HARDWARE_BIND_IP=192.168.1.1\nMQTT_CAMERA_PASSWORD=expected-private\n")
    header = tmp_path / "firmware/esp32-cam/include/config.local.h"
    header.parent.mkdir(parents=True)
    header.write_text('\n'.join(f'#define {k} {json.dumps(v)}' for k, v in {
        "TEST_MQTT_USER": "camera-s11", "TEST_MQTT_PASSWORD": "wrong-private", "TEST_BACKEND_HOST": "192.168.1.1",
    }.items()))
    monkeypatch.setattr(preflight, "ROOT", tmp_path)
    with pytest.raises(RuntimeError, match="credentials differ") as error:
        preflight.credentials()
    assert "expected-private" not in str(error.value)
    assert "wrong-private" not in str(error.value)


@pytest.fixture
def fake_uv(tmp_path):
    command = tmp_path / "uv"
    command.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$SWS_TEST_LOG"
case "$*" in
  *ensure-hardware-broker.py*) exit "${SWS_TEST_PREFLIGHT_EXIT:-0}" ;;
esac
''')
    command.chmod(0o755)
    log = tmp_path / "calls"
    env = dict(os.environ, PATH=f"{tmp_path}:{os.environ['PATH']}", SWS_TEST_LOG=str(log))
    return log, env


@pytest.mark.parametrize("mode", ["off", "stop", "status"])
def test_emergency_and_readonly_modes_bypass_preflight(fake_uv, mode):
    log, env = fake_uv
    env["SWS_TEST_PREFLIGHT_EXIT"] = "42"
    result = subprocess.run([str(ROOT / "scripts/station-auto.sh"), mode], env=env, capture_output=True)
    assert result.returncode == 0
    calls = log.read_text().splitlines()
    assert len(calls) == 1
    assert "servo-usb.py" in calls[0]


@pytest.mark.parametrize("mode", ["on", "once"])
@pytest.mark.parametrize("accepted", [True, False])
def test_arm_commands_require_successful_preflight(fake_uv, mode, accepted):
    log, env = fake_uv
    env["SWS_TEST_PREFLIGHT_EXIT"] = "0" if accepted else "42"
    result = subprocess.run([str(ROOT / "scripts/station-auto.sh"), mode], env=env, capture_output=True)
    calls = log.read_text().splitlines()
    assert "ensure-hardware-broker.py" in calls[0]
    assert result.returncode == (0 if accepted else 42)
    assert len(calls) == (2 if accepted else 1)
    if accepted:
        assert "servo-usb.py auto-" in calls[1]


@pytest.mark.parametrize("accepted", [True, False])
def test_full_sequence_requires_successful_preflight(fake_uv, accepted):
    log, env = fake_uv
    env["SWS_TEST_PREFLIGHT_EXIT"] = "0" if accepted else "42"
    result = subprocess.run([str(ROOT / "scripts/test-full-sequence.sh")], env=env, capture_output=True)
    calls = log.read_text().splitlines()
    assert "ensure-hardware-broker.py" in calls[0]
    assert result.returncode == (0 if accepted else 42)
    assert len(calls) == (2 if accepted else 1)
    if accepted:
        assert "servo-usb.py auto-once" in calls[1]


@pytest.mark.parametrize("docker_access,terminal", [(True, True), (False, True), (False, False)])
def test_repair_uses_privileges_only_when_needed(monkeypatch, docker_access, terminal):
    from types import SimpleNamespace
    calls = []

    def run(command, **kwargs):
        calls.append(command)
        return SimpleNamespace(returncode=0 if command != ["docker", "info"] or docker_access else 1)

    monkeypatch.setattr(preflight.subprocess, "run", run)
    monkeypatch.setattr(preflight.sys, "stdin", SimpleNamespace(isatty=lambda: terminal))
    preflight.repair()
    assert calls[0] == ["docker", "info"]
    if docker_access:
        assert calls[1] == [str(ROOT / "scripts/repair-hardware-broker.sh")]
    else:
        assert calls[1] == ["sudo", *([] if terminal else ["-n"]), "--", str(ROOT / "scripts/repair-hardware-broker.sh")]
