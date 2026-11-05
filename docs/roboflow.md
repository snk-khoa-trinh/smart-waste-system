# Explicit inference providers

Default `INFERENCE_PROVIDER=mock` works offline. To select real inference, change `.env` to `INFERENCE_PROVIDER=roboflow` and restart/recreate the API. Keep the API key exclusively in the backend environment. Never prefix it with VITE_, commit it, or embed it in firmware/browser code.

Official references checked for the implementation:
- [Roboflow official API reference: Workflow inference](https://github.com/roboflow/computer-vision-skills/blob/main/skills/roboflow-api-reference/inference.md)
- [Roboflow Inference repository and serverless deployment documentation](https://github.com/roboflow/inference)

The HTTP adapter posts JSON to `https://serverless.roboflow.com/{workspace}/workflows/{workflow_id}`:

```json
{"api_key":"BACKEND_SECRET","inputs":{"image":{"type":"base64","value":"JPEG_BASE64"}}}
```

Configured workspace: `trinh-dang-khoa-shineekuwu`; workflow: `waste-classifier-psdrg-0mtyc`. `ROBOFLOW_URL`, `ROBOFLOW_WORKSPACE`, `ROBOFLOW_WORKFLOW`, timeout, threshold, label mapping and output name are configurable. Cloud inference may use account credits; no live workflow request is made during default demo/tests.

Workflow output names and structures are user-defined. This adapter supports exactly one output object in `outputs`, with `ROBOFLOW_OUTPUT` (default `predictions`) containing either a list of `{class,confidence}` predictions, a detection object with a `predictions` list, or a classification object with `top` and `confidence`:

```json
{"outputs":[{"predictions":{"predictions":[{"class":"plastic","confidence":0.96}]}}]}
```

Multiple detections or unexpected/empty outputs yield an explicit unknown decision. The adapter conservatively does not pick one object from an ambiguous multi-object image. Confidence is 0–1. Labels map only through `LABEL_MAPPING`; unmapped labels and confidence under threshold yield unknown. Raw labels are persisted separately. Workflow-specific output keys or response structures beyond these documented forms need configuration/adapter changes; workflow-specific structures should still be verified when changing workflows.

Transport/provider errors return 502, timeouts 504, and no successful mock fallback occurs. Development image retention is disabled by default; enabling STORE_IMAGES writes under backend/images (not committed). Compose image retention is ephemeral unless a volume is deliberately added.

The private workflow and exact four-class schema have now been verified live. For the explicit provider override, firmware mode, verified labels and observed accuracy results, see [live test guide](roboflow-live-test.md). The default deployment remains mock.
