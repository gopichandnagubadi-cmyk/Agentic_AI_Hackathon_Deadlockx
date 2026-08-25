"""Minimal local inference API for the citizen web client."""

import base64
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "runs" / "pothole" / "weights" / "best.pt"
HOST = "127.0.0.1"
PORT = 8000


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
            payload = json.loads(self.rfile.read(length))
            encoded = payload["image"].split(",", 1)[-1]
            image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
            model = YOLO(str(MODEL_PATH))
            result = model.predict(image, conf=0.35, verbose=False)[0]
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
            self._send(200, {"available": True, "detections": detections})
        except Exception as error:
            self._send(400, {"error": str(error)})


if __name__ == "__main__":
    print(f"Detection API running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), DetectionHandler).serve_forever()