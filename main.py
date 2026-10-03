"""HTTP transport. Start: python -m uvicorn main:app --reload"""

import base64
import binascii
import logging
import os
from threading import Lock
from typing import Annotated, Literal
from uuid import UUID

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from phishing_detector.feedback import record_feedback
from phishing_detector.service import analyze_image, analyze_text

app = FastAPI(title="Screenshot scam screening")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "WEB_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
analysis_lock = Lock()
log = logging.getLogger(__name__)


class ImagePayload(BaseModel):
    image: str = Field(min_length=1, max_length=14 * 1024 * 1024)


class TextPayload(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class FeedbackPayload(BaseModel):
    analysis_id: UUID
    kind: Literal["wrong_verdict", "report_scam"]
    note: str = Field(default="", max_length=2000)
    evidence_text: str = Field(default="", max_length=20000)


def process_image(data):
    from io import BytesIO

    from PIL import Image, UnidentifiedImageError

    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            413 if data else 400, "Image must be nonempty and at most 10 MiB"
        )
    try:
        with Image.open(BytesIO(data)) as image:
            if image.width * image.height > 20_000_000:
                raise HTTPException(413, "Image exceeds 20 million pixels")
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, "Invalid or unsupported image")
    try:
        with analysis_lock:
            return analyze_image(data)
    except Exception:
        log.exception("Image analysis failed")
        raise HTTPException(503, "Analysis unavailable; please retry")


@app.get("/api/v1/health")
def health_check():
    """Process liveness only; does not claim OCR or model readiness."""
    return {"status": "ok", "message": "SANGYAN Shield API is running"}


@app.post("/api/v1/analyze-text")
def analyze_pasted_text(payload: TextPayload):
    if not payload.text.strip():
        raise HTTPException(422, "Text must contain non-whitespace characters")
    try:
        result = analyze_text(payload.text)
    except Exception:
        log.exception("Text analysis failed")
        raise HTTPException(503, "Analysis unavailable; please retry")
    result["analysis_mode"] = "pasted_text"
    return result


@app.post("/api/v1/save-image-json")
def save_image_json(payload: ImagePayload):
    value = payload.image
    if value.startswith("data:"):
        header, separator, value = value.partition(",")
        if (
            not separator
            or not header.startswith("data:image/")
            or not header.endswith(";base64")
        ):
            raise HTTPException(400, "Invalid image data URI")
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "Invalid base64 image")
    return {
        "message": "Image processed successfully",
        "saved_to": "memory",
        "result": process_image(data),
    }


@app.post("/api/v1/analyze")
async def analyze_screenshot(image: Annotated[UploadFile, File()]):
    try:
        data = await image.read(MAX_IMAGE_BYTES + 1)
    finally:
        await image.close()
    return await run_in_threadpool(process_image, data)


@app.post("/api/v1/feedback", status_code=201)
def feedback(payload: FeedbackPayload):
    return record_feedback(
        str(payload.analysis_id), payload.kind, payload.note, payload.evidence_text
    )
