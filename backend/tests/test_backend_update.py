"""The deployment helper must not leave a stale migration initializer behind."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("fail_init", [False, True])
def test_backend_update_refreshes_named_initializer_before_api(tmp_path, fail_init):
    root = Path(__file__).resolve().parents[2]
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    helper = scripts / "update-inference-api.sh"
    shutil.copyfile(root / "scripts/update-inference-api.sh", helper)
    for name in [".env", ".env.hardware", ".env.roboflow"]:
        (tmp_path / name).touch()
    binary = tmp_path / "bin"
    binary.mkdir()
    docker = binary / "docker"
    docker.write_text(
        '#!/usr/bin/env python3\n'
        'import json, os, sys\n'
        'with open(os.environ["SWS_TEST_LOG"], "a") as stream:\n'
        ' stream.write(json.dumps(sys.argv[1:]) + "\\n")\n'
        'if "--exit-code-from" in sys.argv and os.environ["SWS_TEST_FAIL_INIT"] == "1":\n'
        ' sys.exit(9)\n'
    )
    docker.chmod(0o755)
    log = tmp_path / "docker.jsonl"
    result = subprocess.run(["bash", str(helper)], cwd=tmp_path, capture_output=True, env={
        **os.environ, "PATH": f"{binary}:{os.environ['PATH']}",
        "SWS_TEST_LOG": str(log), "SWS_TEST_FAIL_INIT": "1" if fail_init else "0",
    })
    calls = [json.loads(line) for line in log.read_text().splitlines()]
    assert calls[0][-3:] == ["build", "api", "init"]
    assert calls[1][-6:] == ["up", "-d", "--no-deps", "--no-recreate", "--wait", "db"]
    assert calls[2][-7:] == ["up", "--no-deps", "--no-build", "--force-recreate", "--exit-code-from", "init", "init"]
    for call in calls:
        assert call[:3] == ["compose", "--env-file", ".env"]
        assert ".env.hardware" in call and ".env.roboflow" in call
        assert "down" not in call and "--volumes" not in call
    if fail_init:
        assert result.returncode == 9 and len(calls) == 3
    else:
        assert result.returncode == 0 and len(calls) == 4
        assert calls[3][-6:] == ["up", "-d", "--no-build", "--no-deps", "--wait", "api"]
