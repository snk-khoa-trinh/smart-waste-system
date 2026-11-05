# HTTP contract

Interactive OpenAPI: http://localhost:8000/docs. All routes are below `/api`. No authentication is provided; loopback-only deployment is required.

| Method / path | Purpose |
| --- | --- |
| GET /health | Process liveness |
| GET /ready | SQL connection and migrated stations table |
| GET /buildings, /floors, /stations | Configuration and current status |
| GET /stations/{id} | Station, compartments, independent devices |
| GET /stations/{id}/telemetry | Latest 180 readings ordered newest first |
| GET /summary | Station, offline-device, last-measured ≥80% counts and provider |
| GET /inference/config | Active provider, JPEG byte/pixel limits and decision threshold |
| POST /inference/test | Standalone multipart JPEG + optional mock scenario; returns decision, confidence, model label, provider/model and reason; no bin, record or hardware action |
| POST /classify | multipart JPEG + station_id + camera device_id + request_id UUID; optional mock scenario |
| GET /events?station_id=... | Latest 50 classifications and separate outcomes |
| POST /outcomes | event_id UUID, outcome completed/failed/disabled, simulated boolean |
| POST /stations/{id}/collections | category, operator (1–100 chars), optional note (≤500 chars) |
| GET /collections?station_id=... | Latest 100 persisted records |

Lab tests use the same provider, normalization and JPEG validation as hardware classification, but do not write sorting events or store images. Uploads must be non-empty JPEGs within `MAX_UPLOAD_BYTES` (default 2,000,000 bytes) and 20,000,000 pixels. Live provider tests may consume credits.

Normalized categories: `recyclable`, `non_recyclable`, `e_waste`, plus `unknown` for classification rejection. Collection categories exclude unknown. Fullness values span 0–100 or null; current state includes source, quality, timestamp and stale flag. Classification response includes `id` (event ID, equal to submitted request_id), decision, raw_label, confidence, provider, model, reason, created_at and outcome/outcome_at. The response's initial outcome is null. It also includes station/device identity and whether a subsequently reported outcome is simulated.

Mock scenarios: plastic, battery, trash, low, unknown, ambiguous, timeout. Mock mode is explicit; inference failures return 502 or 504 and never fall back to mock. Rejected model outputs persist unknown decisions; transport failures produce no sorting event and can be retried with the original request ID. Different content under an existing ID returns 409. Outcomes are immutable once reported; identical reports are idempotent, conflicting reports return 409. Unknown decisions cannot complete sorting.

Error shape: `{"error":{"message":"...","request_id":"..."}}`. Also see `X-Request-ID`. 404 unknown resource; 409 conflicting retry/outcome; 413 excessive image bytes; 422 invalid input/JPEG; 502 provider error; 504 timeout; 503 readiness unavailable. No exception details or API keys are returned.

Example mock classification:

```sh
curl -F station_id=s11 -F device_id=s11-cam \
  -F request_id="$(python3 -c 'import uuid; print(uuid.uuid4())')" \
  -F scenario=plastic -F image=@sample.jpg http://localhost:8000/api/classify
```

Collection recording preserves fullness. Metrics intentionally include last known ≥80% readings even when stale; consult stale flags before acting. No sensor reading is inferred from a collection.
