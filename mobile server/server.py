from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

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
from focus import normalize_focus  # noqa: E402
import security  # noqa: E402
from security import MAX_IMAGE_BYTES, MAX_TEXT_CHARS, decode_image, safe_label  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
log = logging.getLogger("sangyan.api")

import engine_adapter  # noqa: E402
from contract import CONTRACT_VERSION  # noqa: E402
from engine_adapter import AnalysisTimeout, EngineError  # noqa: E402

# Analyses run here rather than in Starlette's pool so a stuck one can be abandoned on timeout.
analysis_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analysis")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    engine_adapter.log_startup_status()
    if os.getenv("SANGYAN_WARMUP", "1") != "0":
        threading.Thread(target=engine_adapter.warm_up, name="ocr-warmup", daemon=True).start()
    yield


app = FastAPI(
    title="SANGYAN Shield API",
    description="Investor Safety and Resilience Engine API",
    version="1.4.0",
    docs_url=None if security.PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if security.PRODUCTION else "/openapi.json",
    lifespan=lifespan,
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


@app.exception_handler(EngineError)
async def engine_error_handler(_request: Request, exc: EngineError):
    log.error("Analysis failed: code=%s reason=%s", exc.code, exc.reason or "-")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "error": exc.code},
        headers={"Retry-After": "5"} if exc.status_code in (503, 504) else None,
    )


async def run_analysis(fn, *args):
    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(analysis_executor, fn, *args),
            engine_adapter.ANALYSIS_TIMEOUT_S,
        )
    except asyncio.TimeoutError as exc:
        raise AnalysisTimeout(f"no result after {engine_adapter.ANALYSIS_TIMEOUT_S:.0f}s") from exc


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


def _check_image(data: bytes, focus: str, source: str) -> dict:
    """Decode, analyze and discard one screenshot. Runs in an analysis thread."""
    image, image_format = decode_image(data)
    try:
        result = engine_adapter.analyze_screenshot(image, source, focus)
    finally:
        image.close()
    log.info(
        "Checked screenshot: source=%s focus=%s format=%s size=%dKB risk=%s score=%d "
        "signals=%d ocr_ms=%s total_ms=%d",
        source,
        focus,
        image_format,
        len(data) // 1024,
        result["risk"]["level"],
        result["risk"]["score"],
        len(result["signals"]),
        result["metadata"]["ocr_time_ms"],
        result["metadata"]["processing_time_ms"],
    )
    return result


def _check_text(text: str, focus: str) -> dict:
    result = engine_adapter.analyze_pasted_text(text, "text", focus)
    log.info(
        "Checked text: chars=%d focus=%s risk=%s score=%d signals=%d total_ms=%d",
        len(text),
        focus,
        result["risk"]["level"],
        result["risk"]["score"],
        len(result["signals"]),
        result["metadata"]["processing_time_ms"],
    )
    return result


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "message": "SANGYAN Shield API is running",
        "version": app.version,
        "contract_version": CONTRACT_VERSION,
        "engine": engine_adapter.engine_status(),
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
    return await run_analysis(
        _check_image, data, normalize_focus(analysis_focus), safe_label(capture_source)
    )


@app.post("/api/v1/analyze-text")
async def analyze_pasted_text(payload: TextPayload):
    return await run_analysis(_check_text, payload.text, normalize_focus(payload.focus))


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
    result = await run_analysis(_check_image, data, normalize_focus(None), "image-json")
    return {"message": "Image checked", "saved_to": None, "result": result}
