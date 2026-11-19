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

## Filming records

`POST /filming/events` accepts JSON `request_id` (UUID), `station_id`, camera/sorter
`device_id`, and `category` (recyclable/non_recyclable/e_waste). It creates an
operator-selected event without an image, inference request or motor action.
Provider is `filming`, model `operator-selected`, confidence is null and simulated
is true. Same-ID/same-input retries are idempotent; changed inputs return409.
The filming helper reports a separate `/outcomes` completion with simulated=true
only after USB sequence acknowledgement. This is a staged command demonstration,
not a model prediction or independent proof of a physical drop. Like the existing
API, this route is unauthenticated and intended for local deployment only.

- `POST /filming/events/{event_id}/image`: multipart JPEG + `arrival_id` UUID;
  attaches a separately staged still only to an existing provider=filming event.
  Normal JPEG limits apply. Same image/arrival is idempotent; replacement returns409.
- `GET /filming/events/{event_id}/capture`: event association, arrival UUID,
  SHA-256, save timestamp and image URL. The timestamp is backend save time,
  not the time of the earlier motor take.
- `GET /filming/events/{event_id}/image`: JPEG download/view, no inference.
- `POST /filming/fill`: JSON message_id UUID, category and fill0..100. Creates a
  reserved `filming-demo` bin on campus floor-1 if absent; writes only synthetic
  telemetry through the normal ingestion validation/deduplication path. Extra
  station/device/source fields are rejected. Existing physical bins are untouched.

Migration0002 adds capture metadata; JPEGs persist separately in the
`filming-images` volume. Upload/download routes are local unauthenticated demo
utilities, not a public image host. Images can contain private surroundings:
keep the local deployment private and do not commit generated images/manifests.

## Cleaner route plan

`POST /routes/plan` is read-only JSON planning. Body:

```json
{"building_id":"tower","source":"demo","threshold":80,"travel_mode":"elevator","start_node_id":null}
```

`building_id` is campus/mall/tower; source live(default)/demo; threshold1–100
(default80); travel_mode elevator(default)/stairs; optional start_node_id must be
an entrance/lift/stair node in that building. The default start is the main
entrance on the lowest floor. All tours return to start. Invalid/unseeded or
unsupported inputs return422; no provider/MQTT call or database write occurs.

Response includes building/floors, graph nodes/edges/start_options, bin positions
and eligible values, ordered grouped `stops`, `excluded` with reasons, expanded
`legs` and `baseline_legs`, `baseline_order`, source, generated_at, layout_version,
algorithm, optimal_for_modeled_graph, estimated=true, assumptions and summary.
Summary contains stops/total_bins, walking_meters, travel_seconds, service_seconds,
total_seconds, baseline_travel_seconds, baseline_walking_meters,
saved_travel_seconds and saved_percent. The baseline visits identical selected
stops in floor/bin-ID order. `optimal_for_modeled_graph` is true only when the
bounded exact solver is used (at most12 stops); larger tours are heuristics.
Live excludes synthetic/stale/invalid/missing/future readings and readings already
covered by collection records. Demo is a request-only synthetic scenario, not a
telemetry seed. Details and cost units: [routing guide](collection-routing.md).
