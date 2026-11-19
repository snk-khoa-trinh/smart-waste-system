# Infrastructure agent rules

Read [root baseline](../AGENTS.md) and [broker guide](README.md).

- Keep anonymous MQTT disabled and board accounts scoped to their device topics.
  Coordinate ACL changes with `docs/mqtt.md`, worker ingestion and firmware roles.
- Preserve existing broker credentials during ordinary startup; explicit hardware
  repair must use matching ignored `.env.hardware` credentials, never new random
  passwords that leave flashed devices out of sync.
- Do not remove Docker volumes or overwrite private environment files. Preserve
  the simulator/hardware separation and the explicit trusted-LAN overlay.
- Validate Compose syntax with example environment files and use mocked MQTT tests
  where possible. Recreating live services or changing accounts is not a routine
  documentation/configuration verification step.
