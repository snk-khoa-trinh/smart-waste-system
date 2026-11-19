# MQTT v1 contract

Broker is internal to Compose; unauthenticated access is disabled. Default dev worker credentials are `worker` / `worker-local`; simulator credentials are `simulator` / `simulator-local`. Set passwords in ignored `.env`. Ordinary startup preserves existing complete hashed credentials/ACLs; explicit hardware provisioning or repair rewrites them. ACL grants worker read access and simulator write access to v1 device messages. Simulator intentionally impersonates demo devices. Physical s11 boards already use individual camera-s11/monitor-s11 credentials with exact topic ACLs. Do not reuse simulator credentials for production hardware.

Topics: `waste/v1/stations/{station_id}/{device_id}/{kind}`. Kinds are `fill`, `heartbeat`, `outcome`. Publish QoS 1, non-retained. Every payload includes:

```json
{
  "schema_version": 1,
  "message_id": "10000000-0000-4000-8000-000000000001",
  "station_id": "s11",
  "device_id": "s11-monitor",
  "measured_at": "2026-11-01T08:00:00Z",
  "category": "recyclable",
  "fill_percentage": 72.5,
  "source": "simulated",
  "quality": "valid"
}
```

Fill-only fields: category (`recyclable`, `non_recyclable`, `e_waste`), fill_percentage (0–100), source (`sensor`/`simulated`), quality (`valid`/`invalid`/`missing`). Invalid/missing requires `fill_percentage: null`. Valid requires a numeric value. No extra fields are allowed. Only fill-monitor devices can send fill messages.

Heartbeat uses common envelope plus `status: online|offline`; omit all fill-only fields. Both boards send separate heartbeats. On reconnect publish online; explicit offline applies immediately. No last-will requirement is assumed in this milestone; a silent board expires after HEARTBEAT_EXPIRY (90s). Timestamps must reflect actual UTC device measurement time; clock synchronization is required.

Outcome uses common envelope plus event_id (classification UUID), outcome (`completed`/`failed`/`disabled`), simulated (boolean). Only the matching camera/sorter can report an event's outcome; timestamp must not predate classification. Simulator sets simulated true. A decision never implies completed sorting.

Consumer rejects invalid schema, unsupported versions, identity mismatches, device-role mismatches, impossible percentages and future timestamps. Message UUID deduplication is global. Older valid measurements are stored historically but do not overwrite current state. Older heartbeats do not alter current device status. Invalid messages log a rejection without crashing the worker. Broker reconnect retries every three seconds. No remote motor-control topics are defined.

For the opt-in physical-board network test, `compose.hardware.yaml` and `infra/acl.hardware` provide separate camera/monitor credentials restricted to station s11 and disable simulator publishing. See [broker infrastructure](../infra/README.md) and [current scripts](../scripts/README.md). The default demo credentials remain unchanged.

The current station controller reports its classification outcomes through HTTP;
the original camera MQTT outcome schema remains supported. Device heartbeats and
fill still depend on MQTT. Arming scripts verify accounts and repair once if
needed before sending a new arm command.
