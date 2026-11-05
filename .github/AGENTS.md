# CI agent rules

Read [root baseline](../AGENTS.md) and [CI guide](README.md).

- Use pinned uv/Nub/PlatformIO versions consistent with repository commands and
  lockfiles. Firmware CI builds only camera/station and never uploads to devices.
- Run mock provider integration with isolated broker/database volumes. No real
  credentials, paid inference, physical serial ports or motor commands in CI.
- Keep native/backend/frontend test sources committed; only generated artifacts
  belong in Git ignore rules. Update workflow paths whenever source moves.
- Inspect rendered YAML/Compose configuration and run corresponding local checks
  without deploying or altering the user's current stack.
