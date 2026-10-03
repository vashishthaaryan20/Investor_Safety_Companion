from __future__ import annotations

import base64
import binascii
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
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
import security  # noqa: E402
from security import MAX_IMAGE_BYTES, MAX_TEXT_CHARS, decode_image, safe_label, where  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
log = logging.getLogger("sangyan.api")

MSG_ANALYSIS_FAILED = "We couldn't check this right now. Please try again."

# OCR and the models are memory-hungry; one analysis at a time keeps the laptop responsive.
analysis_lock = threading.Lock()


def _classifier_mode() -> str | None:
    """Only try the image classifier when its weights can actually be loaded."""
    from importlib.util import find_spec

    from phishing_detector import config, storage

    if config.MODEL_PATH.exists():
        return "full"
    if storage.s3_enabled() and find_spec("boto3") is not None:
        return "full"
    log.info("Image classifier off: no local weights and S3 is unavailable.")
    return None


CLASSIFIER_MODE = _classifier_mode()

app = FastAPI(
    title="SANGYAN Shield API",
    description="Investor Safety and Resilience Engine API",
    version="1.3.0",
    docs_url=None if security.PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if security.PRODUCTION else "/openapi.json",
)

# The Android app doesn't use CORS; this only matters for the Expo web preview.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "SANGYAN_WEB_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Capture-Source", "X-Analysis-Focus"],
)
security.install(app)


class ImageJsonPayload(BaseModel):
    image: str = Field(
        ...,
        min_length=1,
        max_length=MAX_IMAGE_BYTES * 4 // 3 + 64,
        description="Base64-encoded screenshot, optionally as a data:image/...;base64, URI",
    )


class TextPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_CHARS)
    focus: str | None = Field(
        default=None,
        max_length=32,
        description="Question the user picked: investment, links, explain, or verify",
    )

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text is blank")
        return value


class FeedbackPayload(BaseModel):
    analysis_id: UUID
    kind: Literal["wrong_verdict", "report_scam"]
    note: str = Field(default="", max_length=2000)
    evidence_text: str = Field(default="", max_length=MAX_TEXT_CHARS)


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


def _check_image(data: bytes, focus: str, source: str) -> dict:
    """Decode, analyze and discard one screenshot. Runs in a worker thread."""
    image, image_format = decode_image(data)
    try:
        with analysis_lock:
            detection = analyze_image(image, classify=CLASSIFIER_MODE)
    except Exception as exc:
        log.error("Screenshot analysis failed: %s", where(exc))
        raise HTTPException(status_code=503, detail=MSG_ANALYSIS_FAILED) from exc
    finally:
        image.close()
    result = _build_result(detection)
    result["analysis_mode"] = "screenshot_ocr"
    result["focus_report"] = build_focus_report(focus, result, result["extracted_text"])
    log.info(
        "Checked screenshot: source=%s focus=%s format=%s size=%dKB risk=%s signals=%d",
        source,
        focus,
        image_format,
        len(data) // 1024,
        result["risk"]["level"],
        len(result["signals"]),
    )
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
    declared = (image.content_type or "").lower()
    if declared and not declared.startswith("image/") and declared != "application/octet-stream":
        await image.close()
        raise HTTPException(status_code=415, detail=security.MSG_UNSUPPORTED)
    try:
        data = await image.read(MAX_IMAGE_BYTES + 1)
    finally:
        await image.close()
    return await run_in_threadpool(
        _check_image, data, normalize_focus(analysis_focus), safe_label(capture_source)
    )


@app.post("/api/v1/analyze-text")
def analyze_pasted_text(payload: TextPayload):
    focus = normalize_focus(payload.focus)
    try:
        result = _build_result(analyze_text(payload.text))
    except Exception as exc:
        log.error("Text analysis failed: %s", where(exc))
        raise HTTPException(status_code=503, detail=MSG_ANALYSIS_FAILED) from exc
    result["analysis_mode"] = "pasted_text"
    result["focus_report"] = build_focus_report(focus, result, payload.text)
    log.info(
        "Checked text: chars=%d focus=%s risk=%s signals=%d",
        len(payload.text),
        focus,
        result["risk"]["level"],
        len(result["signals"]),
    )
    return result


@app.post("/api/v1/feedback", status_code=201)
def submit_feedback(payload: FeedbackPayload):
    # The user confirmed sharing this text on the result screen; it waits for human review.
    report = record_feedback(
        str(payload.analysis_id), payload.kind, payload.note, payload.evidence_text
    )
    log.info("Feedback received: kind=%s", payload.kind)
    return report


@app.post("/api/v1/save-image-json")
async def save_image_json(payload: ImageJsonPayload):
    """Base64 variant of /analyze. The image is checked in memory; nothing is written to disk."""
    value = payload.image.strip()
    if value.startswith("data:"):
        header, separator, value = value.partition(",")
        if not separator or not header.startswith("data:image/") or not header.endswith(";base64"):
            raise HTTPException(status_code=400, detail=security.MSG_UNREADABLE)
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=security.MSG_UNREADABLE) from exc
    result = await run_in_threadpool(_check_image, data, normalize_focus(None), "image-json")
    return {"message": "Image checked", "saved_to": None, "result": result}
