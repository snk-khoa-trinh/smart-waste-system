# Stage 3: live Roboflow inference, with hardware movement disabled

> Historical bring-up notes. Some targets and helpers below are retired. For current commands use the [firmware guide](../firmware/README.md) and [scripts guide](../scripts/README.md).


The supplied private workspace/workflow was called successfully with a real ESP32 JPEG. Project metadata confirms a single-label classification model with exactly four classes:

| Raw project class | Normalized category |
| --- | --- |
| Recyclable | recyclable |
| Non-Recyclable | non_recyclable |
| E-Waste | e_waste |
| Empty | unknown, rejected sorting |

Raw labels and confidence are preserved in events. Empty rejects sorting explicitly. Other unsupported labels and confidence below the configured threshold remain unknown. The actual response contains one output, a `predictions` object with `top` and `confidence`, and an outer `model_id` (`waste-classifier-psdrg-0mtyc/1`). The adapter persists that model/version instead of substituting the workflow name when it is present. A sanitized representative response is covered by backend regression tests.

## Switch the running hardware stack

The base demo remains mock. This opt-in override changes only the API's provider, exact label mapping, output key and timeout. It uses the existing API key from the ignored backend `.env`; no Roboflow key is compiled into firmware or sent to the browser.

```sh
# One-time local configuration, already prepared in this checkout:
cp -n .env.roboflow.example .env.roboflow
# Requires the trusted-LAN hardware stack to be running already:
sudo ./scripts/start-roboflow-test.sh
```

The script rebuilds/recreates API and frontend, preserving PostgreSQL and the monitor/worker. The dashboard should show ROBOFLOW and `/api/summary` should report `inference_provider: roboflow`. Container image building needs network access, but does not run inference by itself.

Build/flash the explicit live camera environment only after a complete original flash backup exists:

```sh
uv tool run --from platformio pio run -d firmware/esp32-cam -e roboflow-test -t upload \
  --upload-port /dev/serial/by-id/usb-1a86_USB_Serial-if00-port0
```

`camera-test` continues to require mock; `roboflow-test` requires Roboflow. Both reject mismatched backend providers. The live build uses 320×240 QVGA JPEGs to reduce payload size on the prototype connection (the mock camera-test build uses VGA when PSRAM is available). The live build sends **one inference request per manual trigger**, with no automatic paid retry. A manual retry is another image/request and can consume additional credits. The backend adapter itself does not automatically retry. Preview/status requests do not call Roboflow. No timed capture/inference loop is enabled.

A long live request can temporarily pause camera MQTT processing in this synchronous test mode. The board reconnects to MQTT afterward and reports an actual disabled outcome independently. External sensors, flash LED and servos remain disabled.

## Run a known-item check

Position one item centrally, occupying a useful portion of the image, with adequate light. Keep it steady: the optional preview and classified exposure are separate captures.

```sh
cd backend
uv run python ../scripts/verify-camera.py --camera-host 192.168.1.190 \
  --provider roboflow --expected-category e_waste
```

The command first downloads and decodes a preview, then makes one successful classification trigger, verifies provider/model/event persistence and the separate `disabled` outcome, and reports model accuracy separately from transport. Known preflight rejections may be retried before any inference is sent. An unknown transport outcome or provider failure is not automatically retried. Exit 0 means all requested checks passed; exit 2 means transport/outcome checks passed but the prediction did not match the supplied expected category. It never rewrites the model result to match the expected answer.

Use `--expected-category recyclable`, `non_recyclable`, `e_waste` or `unknown` as appropriate. Omit it for a transport-only check without an accuracy claim. Images are discarded by the backend unless development image storage was explicitly enabled. Optional local preview storage still requires `--save-preview`.

## Accuracy evidence and limitations

The initial real image showed a small, partially clipped battery near the frame's upper edge, with background dominating the image. The workflow returned **Recyclable, confidence 0.9851**. Expected category was e_waste. This is an observed classification failure, despite successful HTTP inference. The raw result was preserved; the threshold was not lowered and the label was not relabelled to conceal the mismatch.

Metadata reported 15 Empty annotations and thousands in each other class. Those counts alone do not establish model accuracy, but empty/background views and real camera scenes need explicit evaluation before any autonomous routing. A high confidence score is not a guarantee of correctness. This milestone does not enable physical sorting on the basis of this sample.

Further controlled samples should cover centred batteries, paper/plastic, non-recyclable waste, an empty tray, partial objects and clutter. Record expected versus predicted category and reject unknown/ambiguous results. Dataset improvements, camera framing and object-presence handling are future validation work; do not treat one passing image as a calibrated classifier.

## Return to mock

```sh
sudo docker compose --env-file .env --env-file .env.hardware \
  -f compose.yaml -f compose.hardware.yaml \
  up -d --build --force-recreate --no-deps --wait api frontend
uv tool run --from platformio pio run -d firmware/esp32-cam -e camera-test -t upload \
  --upload-port /dev/serial/by-id/usb-1a86_USB_Serial-if00-port0
```

This removes the explicit live override while retaining the trusted-LAN test configuration. No database volumes are deleted. Default mock mode still supports offline development.

## Recorded end-to-end result

The on-board `roboflow-test` run completed with a fully decoded 320×240 preview (4,074 bytes), live model `waste-classifier-psdrg-0mtyc/1` and persisted event `9e80044b-4268-4c9f-80ab-f785425b07a4`. The event received raw `Recyclable`, confidence `0.9597`, normalized `recyclable`. Its separately reported physical-board outcome was `disabled`, simulated false. Transport passed; expected `e_waste` did not match and the verifier exited 2. This result must not be treated as successful battery recognition. Two live inference requests were issued by this assistant session (not an account-wide billing count): the initial direct schema probe and this end-to-end camera request.
