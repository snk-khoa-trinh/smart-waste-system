# Scripts agent rules

Read [root baseline](../AGENTS.md) and [command guide](README.md).

- Keep ordinary setup/control entrypoints discoverable at this folder's root.
  Reusable read-only diagnostics live in `diagnostics/`; private throwaway tools
  belong in ignored `local/` and must not be imported by runtime, tests or CI.
- Use uv/Nub and preserve caller paths when relocating helpers. Shell entrypoints
  must find the repository relative to their own location, not the caller's CWD.
- `station-auto.sh` owns arming/MQTT preflight. `test-full-sequence.sh` delegates to
  it; do not recreate a competing per-item laptop motor controller.
- Never block off/stop/status on MQTT or Docker repair. Repair at most once before
  a new arm command; verify logins afterward and stop on failure. Do not grant
  passwordless sudo, rotate credentials unexpectedly or print secrets.
- Distinguish read-only diagnostics from paid inference, calibration writes,
  uploads, database seeds and actuator commands. Keep authenticated camera control
  credentials in the private header, never subprocess args or logs.
- Script changes require Ruff, relevant mocked pytest coverage and `bash -n` for
  shell scripts. Use fake subprocess/serial/MQTT clients for regression checks;
  do not arm hardware or restart the live stack merely to validate a refactor.
