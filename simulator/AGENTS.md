# Simulator agent rules

Read [root baseline](../AGENTS.md) and [simulator guide](README.md).

- Keep generated measurements explicitly simulated and deterministic for a seed.
  Do not present demo board heartbeats or synthetic fill as real sensor evidence.
- Never start the simulator on the live hardware stack just to populate UI data.
  Keep it opt-in through the demo Compose profile and separate MQTT ACL/account.
- Integration verification must use an isolated database/broker and mock provider;
  it can write records, but must not spend real inference credits or move hardware.
- Run Python lint plus relevant backend/integration tests when protocol generation
  changes. Keep schema/topic formats aligned with backend contracts.
