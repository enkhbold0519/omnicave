"""Reference Vision AI server for VISION_PROVIDER=http (runs on a GPU box, e.g. your RTX PC).

    pip install fastapi uvicorn ultralytics      # ultralytics is optional
    uvicorn vision_server_example:app --port 8100
    # backend/.env:  VISION_PROVIDER=http   VISION_ENDPOINT=http://<gpu-box>:8100/detect

Pipeline (what a production model has to do):
  1. detect bottles in the frame                 → here: YOLO COCO class 39 'bottle' if ultralytics is installed
  2. pixel → cellar coordinates (cm)             → here: simple front-orthographic calibration (see to_cellar)
                                                   production: depth camera / stereo + per-rack plane calibration
  3. read the label (crop → OCR / VLM)           → TODO: e.g. PaddleOCR or a vision-language model, then parse
                                                   producer / name / vintage; return null if unreadable
  4. return detections in the contract documented in backend/app/vision.py
Unreadable labels are fine: the display asks the owner to fill them in before registering.
"""
import base64
import io

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Wine cellar vision (reference)")

try:
    from ultralytics import YOLO  # type: ignore
    _model = YOLO("yolov8n.pt")
except Exception:  # not installed -> returns no detections
    _model = None


class Req(BaseModel):
    image_b64: str
    content_type: str = "image/jpeg"
    cellar: dict


def to_cellar(cx: float, cy: float, w: int, h: int, cellar: dict) -> dict:
    """Front camera that sees the whole door: image x → cellar x, image y → cellar height (front layer)."""
    return {"x": round(cx / w * cellar["width_cm"], 1), "y": round((1 - cy / h) * cellar["height_cm"], 1), "z": 6.0}


@app.post("/detect")
def detect(req: Req):
    if _model is None:
        return {"detections": [], "note": "no model installed"}
    from PIL import Image
    img = Image.open(io.BytesIO(base64.b64decode(req.image_b64))).convert("RGB")
    w, h = img.size
    out = []
    for r in _model(img, verbose=False):
        for box in r.boxes:
            if int(box.cls) != 39:  # COCO 'bottle'
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            out.append({"position": to_cellar((x1 + x2) / 2, (y1 + y2) / 2, w, h, req.cellar),
                        "orientation": "standing" if (y2 - y1) > (x2 - x1) * 1.6 else "lying",
                        "confidence": round(float(box.conf), 2),
                        "label": None})  # TODO: OCR the crop img.crop((x1, y1, x2, y2))
    return {"detections": out}
