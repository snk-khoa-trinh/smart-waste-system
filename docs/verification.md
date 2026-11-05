# Verification evidence

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


Verified during implementation on 2026-11-01. Commands are repeatable from the README. These are local execution results, not claims of completed GitHub CI or actuator validation. Later physical checks are listed below and detailed in their stage guides.

Latest hardware checks: the real fill monitor passed with provisional20/5cm
calibration; camera-TX→DevKit-RX2 wired debug logs were observed; and one physical
inlet arrival triggered real JPEG→Roboflow→persisted decision→separate MQTT
disabled outcome (event e1f594ca-3e65-493a-ba49-17c73988a32b). The capture budget
was consumed and automatic capture turned off. Classification accuracy remains
deferred, network failures are intermittent, and no servo has moved. See
[fill](fill-sensor-test.md), [inlet](inlet-test.md) and [serial](serial-debug.md).

| Check actually executed | Result |
| --- | --- |
| `uv run pytest -q` (backend) | 39 passed after live-adapter regression coverage; one dependency deprecation warning from Starlette's httpx test-client integration |
| `uv run ruff check app tests migrations ../simulator` | Passed |
| `uv lock --check` | Passed |
| Alembic upgrade → downgrade → upgrade, fresh SQLite | Passed |
| Alembic upgrade → downgrade → upgrade, fresh PostgreSQL 18.6 | Passed |
| Repeated PostgreSQL seed | Passed; four stations, two floors, no duplicate identity records |
| `npm run lint` | Passed |
| `npm test` | 3 passed |
| `npm run build` | Strict TypeScript + production build passed; advisory about the approximately 623 kB main JS chunk |
| `npm audit` | Zero reported vulnerabilities at verification time |
| `CHROMIUM_PATH=/usr/local/bin/chromium npm run test:e2e` | 5 passed; collections, image classification, separate outcome, floor filter, 375/667/768/1440 px viewports; no horizontal overflow or page exceptions |
| PlatformIO camera/sorter provisional compile | Passed (espressif32 6.12.0, esp32cam); no upload |
| PlatformIO fill-monitor provisional compile | Passed (espressif32 6.12.0, esp32dev); no upload |
| Compose v2.40.3 `--profile demo config --quiet` | Passed |
| Credentialed broker `$SYS/broker/version` health probe | Passed against Mosquitto 2.0.22 |
| Nginx static serving after correcting the document root | Passed against native Nginx 1.28.3: `/`, `/index.html`, SPA fallback and built JS/CSS returned 200; syntax check passed |
| Actual MQTT → worker → PostgreSQL → API | Passed using `simulator/verify.py`; repeated message stored once |
| Actual JPEG → mock inference → persisted decision → separate MQTT outcome | Passed using `simulator/verify.py` |
| Seeded simulator → live dashboard | Ran across all four stations; browser screenshots inspected on desktop/mobile |
| API UTC serialization against PostgreSQL | Passed |
| Physical ESP32 camera-board network-test firmware | Flashed and hash-verified; Wi-Fi, HTTP readiness 200 and MQTT heartbeat persisted |
| Physical ESP32 DevKit V1 network-test firmware | Flashed and hash-verified; Wi-Fi, HTTP readiness and independent MQTT heartbeat plus three synthetic readings persisted |
| Hardware MQTT ACL | Native broker check passed: own-topic publish accepted; camera cross-device write discarded; anonymous connection rejected |
| Original board firmware preservation | Both complete 4,194,304-byte flash dumps saved privately with SHA256 manifest before flashing |
| Network-test and default firmware builds | Both environments compiled for both projects; hardware configuration and helper syntax/lint passed |
| Physical OV3660 camera initialization | Passed: sensor PID 0x3660, PSRAM detected, onboard AI Thinker camera mapping validated on the connected unit |
| Real JPEG → backend mock decision → separate MQTT disabled outcome | `scripts/verify-camera.py` passed: 640×480 decoded JPEG (8,415-byte preview), event 670bd512-b9f7-434d-9ec8-14669abc37cd; provider mock; physical-board outcome disabled, simulated false |
| Camera operation with serial monitor closed | Three independent HTTP status checks passed after closing the monitor; both boards remained online |
| Camera-test firmware build and upload | Passed; flashed and verified by esptool; remaining firmware environments also compiled |
| Live ESP32 → Roboflow → persistence → separate MQTT outcome | Transport passed; raw Recyclable, 0.9597, normalized recyclable, model waste-classifier-psdrg-0mtyc/1, event 9e80044b-4268-4c9f-80ab-f785425b07a4; disabled outcome persisted |
| Controlled battery/e-waste expectation | Accuracy mismatch: expected e_waste; received recyclable; verifier correctly exited 2, preserving the result |
| Live firmware and override | roboflow-test compiled/flashed/hash-verified; API summary reports roboflow; 320×240 JPEG fully decoded; one upload attempt per trigger |
| Credential scan and Git whitespace checks | Passed; supplied Roboflow key exists only in ignored local `.env` |

Backend tests cover invalid readings, missing values, duplicates, old messages, role/topic identity mismatch, unsupported schema versions, device expiry, old heartbeats, mock mapping, ambiguous/unmapped/low-confidence decisions, request retry/conflicts, upload validation/limits, mock and real-provider timeouts without fallback, collections preserving measurements and classification/outcome separation. Real-provider format tests use HTTP mock transport and a dummy key.

During the initial implementation Docker Engine was unavailable. To test the real interfaces, PostgreSQL 18.6 and Mosquitto 2.0.22 distribution packages were extracted into a temporary directory and run on loopback without system installation. The user subsequently installed Docker and started the Compose stack. The physical-board checks ran against that stack, with required container changes applied from the user’s sudo terminal. Direct Docker administration still requires interactive sudo authentication. The committed CI includes automated Compose checks, but CI has not run in this session.

The private Roboflow workflow subsequently accepted a live request and its four exact class labels/model version were verified. The initial battery image was misclassified as Recyclable (0.9851); this accuracy failure is recorded in [the live test guide](roboflow-live-test.md), with hardware actuation still disabled. Two physical ESP32 boards subsequently passed the opt-in stage-1 network test described in [hardware-test.md](hardware-test.md). The hardware Compose override was applied on the local machine, and the API verifier confirmed fresh independent heartbeats and generated monitor readings with source simulated. The camera then passed [stage 2](camera-test.md): actual OV3660 JPEG capture, mock classification and a separately persisted disabled outcome. External GPIO assignments, physical ultrasonic readings, power budget, servo angles and mechanism remain unvalidated. The camera-test build initializes only the built-in camera and networking; the monitor still publishes explicitly simulated fill values.

During camera testing, a startup-order error was corrected by starting the HTTP listener only after Wi-Fi initialized the network stack. Wi-Fi association occasionally retried and one preview transfer was interrupted; after reseating/reconnection and keeping serial diagnostics from toggling reset lines during testing, the full verifier and post-monitor-close checks passed. This is functional prototype evidence, not a long-duration reliability or power-supply qualification.
