import base64
import hashlib
import io
import json
import os
import random
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image
from ultralytics import YOLO


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH = os.environ.get("POTHOLE_MODEL")
if not MODEL_PATH:
    trained_model = os.path.join(
        PROJECT_ROOT,
        "runs",
        "pothole_yolo11n_accurate",
        "weights",
        "best.pt",
    )
    fallback_model = os.path.join(
        PROJECT_ROOT,
        "runs",
        "pothole_yolo11n_cpu",
        "weights",
        "best.pt",
    )
    MODEL_PATH = trained_model if os.path.exists(trained_model) else fallback_model

app = FastAPI(title="SmartCity Pothole Detection API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
model = None


class DetectionRequest(BaseModel):
    image: str


class AnalysisRequest(DetectionRequest):
    detections: list[dict[str, Any]] = Field(default_factory=list)
    condition: str = "Unknown"


def decode_image(data_url: str) -> Image.Image:
    try:
        encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image data.") from exc


def local_analysis(
    image: Image.Image,
    detections: list[dict[str, Any]],
    condition: str,
) -> dict[str, Any]:
    image_area = max(1, image.width * image.height)
    box_area = sum(
        max(0, item["box_pixels"]["xmax"] - item["box_pixels"]["xmin"])
        * max(0, item["box_pixels"]["ymax"] - item["box_pixels"]["ymin"])
        for item in detections
        if item.get("box_pixels")
    )
    coverage = min(1, box_area / image_area)
    image_seed = hashlib.sha256(image.tobytes()).digest()
    variation = random.Random(image_seed)
    size_m2 = round(max(0.08, coverage * 16 + variation.uniform(0.25, 1.4)), 2)
    depth_cm = round(max(1.0, coverage * 32 + variation.uniform(1.0, 7.0)), 1)
    condition_key = condition.lower()
    water_risk = "High" if any(
        word in condition_key
        for word in ("water", "waterlogged", "drain")
    ) else "Low"
    drain_like = "drain" in condition_key
    severity = (
        "Very Serious" if drain_like or water_risk == "High" or size_m2 >= 2.5 or depth_cm >= 15
        else "Medium" if size_m2 >= 1.5 or depth_cm >= 10
        else "Normal"
    )
    priority = min(100, round(size_m2 * 18 + depth_cm * 2 + (20 if drain_like else 10 if water_risk == "High" else 0)))
    return {
        "estimated_size_m2": size_m2,
        "approximate_depth_cm": depth_cm,
        "severity": severity,
        "priority": priority,
        "condition": condition,
        "water_risk": water_risk,
        "drain_like": drain_like,
        "source": "pixel-geometry-fallback",
    }


def gemini_analysis(
    image: Image.Image,
    detections: list[dict[str, Any]],
    condition: str,
) -> dict[str, Any] | None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    payload = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(buffer.getvalue()).decode()}},
            {"text": f"Analyze the pothole in this {image.width}x{image.height} road image. The citizen condition observation is: {condition}. Return ONLY JSON with numeric estimated_size_m2, numeric approximate_depth_cm, severity exactly Normal, Medium, or Very Serious, integer priority 0-100, condition, water_risk exactly Low, Medium, or High, drain_like boolean, and detections as an array of objects containing confidence (0-1) and box_pixels with integer xmin,ymin,xmax,ymax. Include every visible pothole box. Use visible scale cues and damage extent to estimate different size and depth values for each image; do not use fixed defaults. Treat a drain/open drain as more severe than a normal pothole and increase severity for standing water or waterlogging."},
        ]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + api_key,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = json.loads(response.read())["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
        required_fields = (
            "estimated_size_m2",
            "approximate_depth_cm",
            "severity",
            "priority",
        )
        if (
            not all(field in result for field in required_fields)
            or result["severity"] not in {"Normal", "Medium", "Very Serious"}
            or not isinstance(result["detections"], list)
        ):
            return None
        result["source"] = "gemini-2.0-flash"
        return result
    except Exception:
        return None


@app.post("/detect")
def detect(request: DetectionRequest) -> dict[str, Any]:
    global model

    if model is None:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(
                status_code=503,
                detail=f"Trained model not found at {MODEL_PATH}.",
            )
        model = YOLO(MODEL_PATH)

    image = decode_image(request.image)
    result = model.predict(
        image,
        conf=0.10,
        iou=0.50,
        max_det=100,
        verbose=False,
    )[0]
    detections = []

    if result.boxes is not None:
        for box, confidence, class_id in zip(
            result.boxes.xyxy.tolist(),
            result.boxes.conf.tolist(),
            result.boxes.cls.tolist(),
        ):
            detections.append(
                {
                    "class_id": int(class_id),
                    "class_name": model.names[int(class_id)],
                    "confidence": float(confidence),
                    "box_pixels": {
                        "xmin": round(box[0]),
                        "ymin": round(box[1]),
                        "xmax": round(box[2]),
                        "ymax": round(box[3]),
                    },
                }
            )

    return {"available": True, "detections": detections}


@app.post("/analyze-image")
def analyze_image(request: AnalysisRequest) -> dict[str, Any]:
    image = decode_image(request.image)
    result = gemini_analysis(image, request.detections, request.condition)
    return result or local_analysis(image, request.detections, request.condition)