# MQTT infrastructure

Mosquitto configuration and topic ACLs for the local prototype.

[Repository guide](../README.md) · [Agent rules](AGENTS.md) · [MQTT contract](../docs/mqtt.md)

- `mosquitto.conf`: authenticated listener1883; password/ACL files come from the
  Compose-managed broker configuration volume. Anonymous connections are disabled.
- `acl`: software-demo worker/simulator permissions.
- `acl.hardware`: worker plus camera-s11/monitor-s11 device-scoped permissions.

The root Compose files provision account files. Normal base startup preserves
existing complete hardware configuration; hardware provisioning/repair explicitly
restores it from local environment credentials. Do not hand-edit volume password
hashes or commit generated files. Hardware LAN bindings are opt-in through
`compose.hardware.yaml`; live inference uses the separate Roboflow overlay.

`station-auto.sh on/once` repairs rejected MQTT logins before arming when needed.
For manual recovery use `sudo ./scripts/repair-hardware-broker.sh`. This stops the
demo simulator to avoid competing data identities; broker restart does not erase
the database or change the API's inference provider.
