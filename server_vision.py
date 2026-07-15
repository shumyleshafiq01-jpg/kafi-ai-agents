"""
KAFI Vision backend — Agents 8 (Warehouse QC) & 10 (Security).
Camera frame → detection → alerts. Uses Ultralytics YOLO when installed; demo mode otherwise.
"""

import base64
import io
import json
import os
import random
import time

try:
    import requests
except ImportError:
    requests = None

HAS_YOLO = False
_yolo_model = None

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# COCO-ish labels mapped to KAFI warehouse / security use cases
WAREHOUSE_CLASSES = {
    "person", "backpack", "handbag", "suitcase", "bottle", "cup", "bowl",
    "orange", "apple", "sandwich", "cake", "donut", "cell phone", "book",
    "clock", "scissors", "teddy bear", "hair drier", "toothbrush",
}

SECURITY_CLASSES = {"person", "car", "truck", "motorcycle", "bicycle", "backpack", "handbag"}


def _load_model():
    global _yolo_model
    if _yolo_model is not None:
        return _yolo_model
    if not HAS_YOLO:
        return None
    custom = os.environ.get("KAFI_YOLO_MODEL", "").strip()
    if custom and os.path.isfile(custom):
        _yolo_model = YOLO(custom)
        return _yolo_model
    for name in ("kafi-warehouse.pt", "yolov8n.pt"):
        path = os.path.join(MODELS_DIR, name)
        if os.path.isfile(path):
            _yolo_model = YOLO(path)
            return _yolo_model
    # Download nano model on first use (local dev only)
    try:
        _yolo_model = YOLO("yolov8n.pt")
        return _yolo_model
    except Exception:
        return None


def _decode_image(image_b64):
    raw = image_b64.split(",", 1)[-1]
    data = base64.b64decode(raw)
    if HAS_YOLO:
        from PIL import Image
        return Image.open(io.BytesIO(data))
    return data


def _run_yolo(image, agent_mode="warehouse", conf=0.35):
    model = _load_model()
    if model is None:
        return None
    results = model.predict(image, conf=conf, verbose=False)
    detections = []
    names = results[0].names or {}
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        label = names.get(cls_id, str(cls_id))
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
        detections.append({
            "label": label,
            "confidence": round(float(box.conf[0]), 3),
            "box": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
        })
    return detections


def _demo_detections(agent_mode="warehouse"):
    """Demo detections when YOLO is not installed (UI testing / Vercel)."""
    random.seed(int(time.time()) // 5)
    if agent_mode == "security":
        pool = [
            ("person", "Person detected — main gate"),
            ("person", "Person in restricted zone"),
            ("backpack", "Unattended bag alert"),
        ]
    else:
        pool = [
            ("carton", "Carton stack — count zone A"),
            ("rice_bag", "Rice bag detected"),
            ("spice_pack", "Spice pack on line"),
            ("damaged", "Possible damaged packaging"),
            ("missing_label", "Label verification needed"),
        ]
    n = random.randint(1, 3)
    picks = random.sample(pool, min(n, len(pool)))
    out = []
    for label, note in picks:
        out.append({
            "label": label,
            "confidence": round(random.uniform(0.55, 0.92), 3),
            "box": {
                "x": random.randint(20, 200),
                "y": random.randint(20, 120),
                "w": random.randint(80, 220),
                "h": random.randint(60, 180),
            },
            "note": note,
        })
    return out


def _classify_alerts(detections, agent_mode="warehouse"):
    alerts = []
    for d in detections:
        label = (d.get("label") or "").lower()
        conf = d.get("confidence", 0)
        if agent_mode == "security":
            if label == "person" and conf >= 0.5:
                alerts.append({
                    "severity": "high" if conf > 0.75 else "medium",
                    "type": "access",
                    "message": d.get("note") or f"Person detected ({int(conf * 100)}% confidence)",
                    "label": label,
                })
            elif label in ("backpack", "handbag", "suitcase") and conf >= 0.45:
                alerts.append({
                    "severity": "high",
                    "type": "unattended",
                    "message": "Unattended item — verify visitor policy",
                    "label": label,
                })
        else:
            if label in ("damaged", "missing_label", "leakage") or "damage" in label:
                alerts.append({
                    "severity": "high",
                    "type": "qc_fail",
                    "message": d.get("note") or f"QC issue: {label}",
                    "label": label,
                })
            elif conf >= 0.6:
                alerts.append({
                    "severity": "info",
                    "type": "count",
                    "message": d.get("note") or f"Detected {label.replace('_', ' ')}",
                    "label": label,
                })
    return alerts


def vision_status():
    model = _load_model()
    return {
        "yoloInstalled": HAS_YOLO,
        "modelLoaded": model is not None,
        "modelPath": os.environ.get("KAFI_YOLO_MODEL") or ("yolov8n.pt" if model else None),
        "modes": ["warehouse", "security"],
        "demoMode": model is None,
        "installHint": "Local: pip install ultralytics pillow  (+ optional models/kafi-warehouse.pt)",
    }


def handle_detect(body):
    image_b64 = body.get("image", "")
    agent_mode = (body.get("mode") or "warehouse").lower()
    conf = float(body.get("confidence", 0.35))

    if not image_b64:
        return {"error": "Missing 'image' (base64 data URL)"}, 400

    detections = None
    if HAS_YOLO:
        try:
            img = _decode_image(image_b64)
            detections = _run_yolo(img, agent_mode=agent_mode, conf=conf)
        except Exception as e:
            return {"error": f"YOLO inference failed: {str(e)[:200]}"}, 502

    if detections is None:
        detections = _demo_detections(agent_mode)

    alerts = _classify_alerts(detections, agent_mode)
    counts = {}
    for d in detections:
        lbl = d.get("label", "unknown")
        counts[lbl] = counts.get(lbl, 0) + 1

    return {
        "ok": True,
        "mode": agent_mode,
        "demoMode": not (HAS_YOLO and _load_model()),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "detections": detections,
        "counts": counts,
        "alerts": alerts,
    }, 200
