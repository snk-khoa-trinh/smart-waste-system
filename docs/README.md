# Smart Waste System: technical documentation

Smart Waste System combines a physical sorting prototype with software for bin
monitoring and collection planning. These documents explain the engineering
behind the project, the evidence gathered during development, and the questions
that remain open.

[Project overview](../README.md) · [Demo video](../video/)

## Suggested reading order

For a first review, begin with the project overview and demonstration, then read
these three guides:

1. **[System architecture](architecture.md):** how the camera, controller,
   classification service, telemetry worker, database, and dashboard interact.
2. **[Station operation and development evidence](autonomous-station.md):**
   arrival detection, capture timing, motor sequencing, recovery behavior, and
   the results of hardware experiments.
3. **[Collection planning](collection-routing.md):** how fill readings become
   collection stops, how routes are calculated, and what the model assumes.

The station document is a chronological engineering record. Some early findings
are superseded by later entries; it should be read alongside the current source
and component guides rather than treated as a single acceptance report.

## Design and implementation

| Guide | Questions it answers |
| --- | --- |
| [Architecture](architecture.md) | What runs on each device and service? How does information flow through the system? |
| [HTTP API](api.md) | How are predictions, outcomes, readings, and records represented and validated? |
| [MQTT messaging](mqtt.md) | How do devices report connectivity and fill measurements? How are duplicate and stale messages handled? |
| [2D and 3D building views](building-preview.md) | How are bin locations and building geometry presented consistently? |
| [Collection planning](collection-routing.md) | How are collection stops selected and walking circuits planned? |
| [Automated validation](ci.md) | Which software checks run, and how are external services isolated during testing? |

For development and reproduction, use the component guides:
[backend](../backend/README.md), [frontend](../frontend/README.md),
[firmware](../firmware/README.md), [operation tools](../scripts/README.md),
[MQTT infrastructure](../infra/README.md), and
[software simulation](../simulator/README.md).

## Understanding the evidence

The project distinguishes several kinds of evidence:

- **Software checks** exercise API contracts, data processing, interface behavior,
  and controller logic. A successful build does not establish physical reliability.
- **Hardware experiments** investigate sensor behavior, image capture, networking,
  and motion. Capture transport alone does not prove the intended item was visible
  in the image, and a completed command does not independently confirm its destination.
- **Staged demonstrations** use operator-selected categories to show mechanical
  movement. Synthetic records and fill animations illustrate dashboard behavior;
  they are not live recognition results or measured fill accuracy.
- **Route examples** demonstrate planning on modeled walking links. Large tours
  use heuristics, and travel costs have not been established through a surveyed
  building deployment.

The prototype has one physically sensed fill compartment.
Recognition accuracy, image capture under realistic disposal
conditions, and handling of mixed or multiple-item drops require further
validation. Fill forecasting remains future work.

The [filming and demonstration guide](filming-handoff.md) describes how the
recorded scenes were assembled and identifies their staged and synthetic elements.

## Development archive

These notes preserve the development process, including unsuccessful experiments,
calibration changes, and earlier designs. Some commands, wiring profiles, and
helper tools have since been retired. Use current component READMEs for setup.

| Topic | Development notes |
| --- | --- |
| Connectivity and device bring-up | [Hardware and network tests](hardware-test.md), [serial diagnostics](serial-debug.md) |
| Camera and arrival detection | [Camera tests](camera-test.md), [inlet tests](inlet-test.md) |
| Fill sensing | [Fill sensor tests](fill-sensor-test.md) |
| Mechanical control | [Servo calibration](servo-bench.md), [earlier laptop-controlled sorting cycle](prototype-sort-cycle.md) |
| Recognition integration | [Roboflow setup notes](roboflow.md), [live workflow experiments](roboflow-live-test.md) |
| Earlier validation status | [Historical verification matrix](verification.md) |

Together, these documents provide a record of design choices, observed behavior,
and remaining work rather than a claim of production readiness.
