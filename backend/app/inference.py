import base64
import math
from typing import Protocol

import httpx

from .config import settings

CATEGORIES = {"recyclable", "non_recyclable", "e_waste"}


class Provider(Protocol):
    async def predict(self, image: bytes, scenario: str) -> dict: ...


class MockProvider:
    async def predict(self, image: bytes, scenario: str) -> dict:
        if scenario == "timeout":
            raise httpx.ReadTimeout("Simulated timeout")
        scenarios = {
            "plastic": ("plastic", 0.96),
            "battery": ("battery", 0.94),
            "trash": ("trash", 0.90),
            "low": ("plastic", 0.2),
            "unknown": ("unmapped", 0.99),
            "ambiguous": (None, None),
        }
        if scenario not in scenarios:
            raise ValueError("Unknown mock scenario")
        label, confidence = scenarios[scenario]
        return {"raw_label": label, "confidence": confidence, "model": "scripted-demo-v1"}


class RoboflowProvider:
    async def predict(self, image: bytes, scenario: str) -> dict:
        if not settings.roboflow_api_key:
            raise ValueError("Roboflow API key missing")
        url = f"{settings.roboflow_url}/{settings.roboflow_workspace}/workflows/{settings.roboflow_workflow}"
        async with httpx.AsyncClient(timeout=settings.inference_timeout) as client:
            response = await client.post(
                url,
                json={
                    "api_key": settings.roboflow_api_key,
                    "inputs": {"image": {"type": "base64", "value": base64.b64encode(image).decode()}},
                },
            )
            response.raise_for_status()
            body = response.json()
        # Workflow output names are user-defined; support a configured predictions output.
        return parse_workflow(body)


def parse_workflow(body):
    outputs = body.get("outputs", []) if isinstance(body, dict) else []
    output = outputs[0] if isinstance(outputs, list) and len(outputs) == 1 and isinstance(outputs[0], dict) else {}
    model = output.get("model_id")
    if not isinstance(model, str) or not model:
        model = settings.roboflow_workflow
    result = (
        output.get(settings.roboflow_output, {})
        if isinstance(outputs, list) and len(outputs) == 1 and isinstance(outputs[0], dict)
        else {}
    )
    if isinstance(result, list):
        predictions = result
    elif isinstance(result, dict):
        predictions = result.get("predictions", [])
        if "top" in result and "confidence" in result:
            predictions = [{"class": result["top"], "confidence": result["confidence"]}]
    else:
        predictions = []
    if not isinstance(predictions, list) or len(predictions) != 1 or not isinstance(predictions[0], dict):
        return {"raw_label": None, "confidence": None, "model": model}
    prediction = predictions[0]
    confidence = prediction.get("confidence")
    if (
        isinstance(confidence, bool)
        or not isinstance(confidence, (int, float))
        or not math.isfinite(confidence)
        or not 0 <= confidence <= 1
    ):
        confidence = None
    return {
        "raw_label": prediction.get("class") if isinstance(prediction.get("class"), str) else None,
        "confidence": confidence,
        "model": model,
    }


def normalize(result):
    label, confidence = result["raw_label"], result["confidence"]
    category = settings.label_mapping.get(label)
    if category == "unknown":
        return "unknown", f"Model label '{label}' is configured to reject sorting"
    if category not in CATEGORIES:
        return "unknown", "Unsupported label or ambiguous result"
    if confidence is None or not 0 <= confidence <= 1 or confidence < settings.confidence_threshold:
        return "unknown", "Confidence below threshold or unavailable"
    return category, None


def provider():
    if settings.inference_provider == "mock":
        return MockProvider()
    if settings.inference_provider == "roboflow":
        return RoboflowProvider()
    raise ValueError("Unknown inference provider")
