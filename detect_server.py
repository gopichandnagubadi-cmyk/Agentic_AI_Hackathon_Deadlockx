"""Minimal local inference API for the citizen web client."""

import base64
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "runs" / "pothole" / "weights" / "best.pt"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CONFIDENCE_THRESHOLD = 0.35
MAX_REQUEST_BYTES = 20 * 1024 * 1024
model = None
model_lock = threading.Lock()
inference_lock = threading.Lock()


def get_model():
    global model
    if model is None:
        with model_lock:
            if model is None:
                model = YOLO(str(MODEL_PATH))
    return model


class DetectionHandler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        if self.path != "/detect":
            self._send(404, {"error": "Not found"})
            return

        if not MODEL_PATH.exists():
            self._send(503, {"error": "Train the pothole model first."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send(413, {"error": "Image request must be between 1 byte and 20 MB."})
                return

            payload = json.loads(self.rfile.read(length))
            encoded_image = payload.get("image")
            if not isinstance(encoded_image, str) or not encoded_image:
                self._send(400, {"error": "An image data URL is required."})
                return

            encoded = encoded_image.split(",", 1)[-1]
            image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
            with inference_lock:
                result = get_model().predict(
                    image,
                    conf=CONFIDENCE_THRESHOLD,
                    verbose=False,
                )[0]
            detections = []
            for box in result.boxes:
                coordinates = [round(float(value), 2) for value in box.xyxy[0].tolist()]
                detections.append({
                    "class": "pothole",
                    "confidence": round(float(box.conf[0]), 4),
                    "box_pixels": {
                        "xmin": coordinates[0], "ymin": coordinates[1],
                        "xmax": coordinates[2], "ymax": coordinates[3]
                    }
                })
            if not detections:
                self._send(200, {
                    "available": True,
                    "is_pothole": False,
                    "detections": [],
                    "message": "This image does not contain a pothole. Please upload another image showing a pothole.",
                })
                return

            self._send(200, {
                "available": True,
                "is_pothole": True,
                "image_width": image.width,
                "image_height": image.height,
                "detections": detections,
            })
        except Exception as error:
            self._send(400, {"error": str(error)})


if __name__ == "__main__":
    print(f"Detection API running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), DetectionHandler).serve_forever()