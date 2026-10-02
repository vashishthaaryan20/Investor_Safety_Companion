from __future__ import annotations

import base64
import json
import sys
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

# src/phishing_detector first (full OCR), then this folder (safety_engine).
BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR.parent
sys.path = [str(SRC_DIR), str(BACKEND_DIR)] + [
    p
    for p in sys.path
    if p not in {"", str(BACKEND_DIR), str(SRC_DIR)}
    and Path(p).resolve() != BACKEND_DIR
]

from phishing_detector.ocr import analyze_image, extract_entities  # noqa: E402
from safety_engine import analyze_content  # noqa: E402
from focus import build_focus_report, normalize_focus  # noqa: E402

UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

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


def _load_pil(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable image.") from exc
    return image


def _optional_phishing_label(image: Image.Image) -> tuple[str | None, float | None]:
    try:
        from phishing_detector.model import get_classifier, predict_image

        label, confidence, _probs = predict_image(get_classifier(), image)
        return label, confidence
    except Exception as exc:
        print(f"[api] Phishing classifier skipped: {exc}", flush=True)
        return None, None


def _build_result(text: str, entities: list, image: Image.Image | None = None) -> dict:
    phishing_label = None
    phishing_confidence = None
    if image is not None:
        phishing_label, phishing_confidence = _optional_phishing_label(image)
    return analyze_content(
        text,
        entities,
        phishing_label=phishing_label,
        phishing_confidence=phishing_confidence,
    )


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
    ocr = analyze_image(pil_image)
    text = ocr.get("text") or ""
    result = _build_result(text, ocr.get("entities") or [], pil_image)
    result["analysis_mode"] = "screenshot_ocr"
    result["focus_report"] = build_focus_report(focus, result, text)

    print("Risk:", result["risk"])
    print("=" * 60)
    return result


@app.post("/api/v1/analyze-text")
def analyze_pasted_text(payload: TextPayload):
    result = analyze_content(payload.text, entities=extract_entities(payload.text))
    result["analysis_mode"] = "pasted_text"
    result["focus_report"] = build_focus_report(normalize_focus(payload.focus), result, payload.text)
    return result


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
