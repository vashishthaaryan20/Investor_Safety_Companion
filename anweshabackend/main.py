from __future__ import annotations

import base64
import json
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

# src/phishing_detector first (full OCR), then this folder (safety_engine).
BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR.parent
sys.path = [str(SRC_DIR), str(BACKEND_DIR)] + [
    p
    for p in sys.path
    if p not in {"", str(BACKEND_DIR), str(SRC_DIR)}
    and Path(p).resolve() != BACKEND_DIR
]

os.environ.setdefault("DETECTION_CONFIG", str(SRC_DIR / "detection.local.json"))

from phishing_detector.feedback import record_feedback  # noqa: E402
from phishing_detector.service import analyze_image, analyze_text  # noqa: E402
from safety_engine import analyze_content, detector_signals  # noqa: E402
from focus import build_focus_report, normalize_focus  # noqa: E402

UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _classifier_mode() -> str | None:
    """Only try the image classifier when its weights can actually be loaded."""
    from importlib.util import find_spec

    from phishing_detector import config, storage

    if config.MODEL_PATH.exists():
        return "full"
    if storage.s3_enabled() and find_spec("boto3") is not None:
        return "full"
    print("[api] Image classifier off: no local weights and S3 is unavailable.", flush=True)
    return None


CLASSIFIER_MODE = _classifier_mode()

app = FastAPI(
    title="SANGYAN Shield API",
    description="Investor Safety and Resilience Engine API",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImageJsonPayload(BaseModel):
    image: str = Field(..., description="Base64-encoded screenshot")


class TextPayload(BaseModel):
    text: str = Field(..., min_length=1)
    focus: str | None = Field(
        default=None,
        description="Question the user picked: investment, links, explain, or verify",
    )


class FeedbackPayload(BaseModel):
    analysis_id: UUID
    kind: Literal["wrong_verdict", "report_scam"]
    note: str = Field(default="", max_length=2000)
    evidence_text: str = Field(default="", max_length=20000)


def _load_pil(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable image.") from exc
    return image


def _build_result(detection: dict) -> dict:
    """Investor-safety verdict on top of the phishing_detector pass (OCR, entities, detectors)."""
    result = analyze_content(
        detection.get("text") or "",
        detection.get("entities") or [],
        phishing_label=detection.get("label"),
        phishing_confidence=detection.get("confidence"),
        extra_signals=detector_signals(detection.get("detectors")),
    )
    result["detectors"] = [
        {"name": d["name"], "status": d["status"], "score": d["score"]}
        for d in detection.get("detectors") or []
    ]
    return result


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "message": "SANGYAN Shield API is running",
    }


@app.post("/api/v1/analyze")
async def analyze_screenshot(
    image: UploadFile = File(...),
    capture_source: str | None = Header(default=None, alias="X-Capture-Source"),
    analysis_focus: str | None = Header(default=None, alias="X-Analysis-Focus"),
):
    focus = normalize_focus(analysis_focus)
    print()
    print("=" * 60)
    print("SANGYAN ANALYSIS REQUEST")
    print("=" * 60)
    print("Source   :", capture_source or "unknown")
    print("Focus    :", focus)
    print("Type     :", image.content_type)

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")

    pil_image = _load_pil(image_bytes)
    detection = await run_in_threadpool(analyze_image, pil_image, classify=CLASSIFIER_MODE)
    result = _build_result(detection)
    result["analysis_mode"] = "screenshot_ocr"
    result["focus_report"] = build_focus_report(focus, result, result["extracted_text"])

    print("Risk:", result["risk"])
    print("=" * 60)
    return result


@app.post("/api/v1/analyze-text")
def analyze_pasted_text(payload: TextPayload):
    result = _build_result(analyze_text(payload.text))
    result["analysis_mode"] = "pasted_text"
    result["focus_report"] = build_focus_report(normalize_focus(payload.focus), result, payload.text)
    return result


@app.post("/api/v1/feedback", status_code=201)
def submit_feedback(payload: FeedbackPayload):
    return record_feedback(
        str(payload.analysis_id), payload.kind, payload.note, payload.evidence_text
    )


@app.post("/api/v1/save-image-json")
def save_image_json(payload: ImageJsonPayload):
    try:
        raw = base64.b64decode(payload.image)
        Image.open(BytesIO(raw)).verify()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.") from exc

    binary_dest = UPLOAD_DIR / "latest_screenshot.png"
    binary_dest.write_bytes(raw)
    meta_dest = UPLOAD_DIR / "latest_screenshot.json"
    meta_dest.write_text(
        json.dumps({"bytes": len(raw), "saved_to": str(binary_dest)}),
        encoding="utf-8",
    )
    return {
        "message": "Image JSON saved",
        "saved_to": str(binary_dest),
    }
