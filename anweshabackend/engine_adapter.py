"""Bridge between the API and the detection engine (phishing_detector).

    image -> OCR (text, tokens) -> image classifier -> engine (entities, URLs, detectors,
    fused risk) -> engine output validation -> investor-safety rules -> response validation

Nothing here invents findings or scores: when a step fails the request fails with an
EngineError, and checks that could not run are listed in the response metadata.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from importlib.util import find_spec
from typing import Any

from pydantic import ValidationError

from contract import AnalysisResponse, EngineOutput
from focus import build_focus_report
from safety_engine import analyze_content, detector_signals
from security import where

log = logging.getLogger("sangyan.engine")


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes"}


# Fail screenshot checks instead of running without the visual model.
REQUIRE_IMAGE_MODEL = _env_flag("SANGYAN_REQUIRE_IMAGE_MODEL")
# Longest a single check may take before the client gets a retryable 504.
ANALYSIS_TIMEOUT_S = float(os.getenv("SANGYAN_ANALYSIS_TIMEOUT_S", "75"))
# How long a request waits for the previous check to finish before getting a 503.
LOCK_WAIT_S = float(os.getenv("SANGYAN_LOCK_WAIT_S", "20"))


class EngineError(Exception):
    """A failed analysis. `message` is shown to users; `reason` only goes to the server log."""

    status_code = 500
    code = "engine_failed"
    message = "We couldn't check this right now. Please try again."

    def __init__(self, reason: str = ""):
        super().__init__(reason or self.code)
        self.reason = reason


class ModelUnavailable(EngineError):
    status_code = 503
    code = "model_unavailable"
    message = "The detection model isn't available on the server right now. Please try again later."


class OcrFailed(EngineError):
    code = "ocr_failed"
    message = "We couldn't read the text in this screenshot. Please try again."


class InferenceFailed(EngineError):
    code = "engine_failed"


class InvalidEngineOutput(EngineError):
    status_code = 502
    code = "engine_invalid_output"
    message = "The check didn't produce a usable result. Please try again."


class EngineBusy(EngineError):
    status_code = 503
    code = "busy"
    message = "SANGYAN is finishing another check. Please try again in a moment."


class AnalysisTimeout(EngineError):
    status_code = 504
    code = "timeout"
    message = "The check took too long. Please try again."


@dataclass
class EngineInput:
    """What the engine is given. URLs are extracted by the engine from `text` itself."""

    text: str
    tokens: list[dict] = field(default_factory=list)
    source: str = "unknown"
    # PIL image for the visual classifier; screenshots only.
    image: Any = None


# ---------------------------------------------------------------- model status

_status_lock = threading.Lock()
_status: dict[str, Any] = {"ocr": "not_loaded"}


def _plan_image_classifier() -> dict[str, str]:
    from phishing_detector import config, storage

    if config.MODEL_PATH.exists():
        return {"status": "available", "reason": "Weights found locally; loaded on first screenshot."}
    missing = [
        label
        for label, present in (
            ("an S3 bucket name", storage.s3_enabled()),
            ("boto3", find_spec("boto3") is not None),
            ("AWS credentials", bool(os.getenv("AWS_ACCESS_KEY_ID"))),
        )
        if not present
    ]
    if not missing:
        return {"status": "available", "reason": "Weights are downloaded from S3 on first screenshot."}
    return {
        "status": "unavailable",
        "reason": "No model weights on the server, and the S3 download is missing "
        + ", ".join(missing)
        + ".",
    }


def _plan_text_classifier() -> dict[str, str]:
    path = os.getenv("TEXT_MODEL_PATH")
    if not path:
        return {"status": "not_configured", "reason": "TEXT_MODEL_PATH is not set."}
    if not os.path.exists(path) or find_spec("sklearn") is None:
        return {"status": "unavailable", "reason": "Text model file or scikit-learn is missing."}
    return {"status": "available", "reason": "Loaded on first check."}


def refresh_model_status() -> None:
    with _status_lock:
        _status["image_classifier"] = _plan_image_classifier()
        _status["text_classifier"] = _plan_text_classifier()


def _set_status(key: str, value: Any) -> None:
    with _status_lock:
        _status[key] = value


def engine_status() -> dict[str, Any]:
    with _status_lock:
        image = dict(_status["image_classifier"])
        text = dict(_status["text_classifier"])
        ocr = _status["ocr"]
    degraded = []
    if ocr == "failed":
        degraded.append("Text recognition (OCR) failed to load.")
    if image["status"] == "unavailable":
        degraded.append("Image classifier: " + image["reason"])
    return {
        "ready": ocr != "failed" and not (REQUIRE_IMAGE_MODEL and image["status"] == "unavailable"),
        "ocr": ocr,
        "rules": "ready",
        "image_classifier": image,
        "text_classifier": text,
        "external_reputation": "not_implemented",
        "degraded": degraded,
    }


def log_startup_status() -> None:
    status = engine_status()
    image = status["image_classifier"]
    if image["status"] == "unavailable":
        log.warning(
            "Image classifier unavailable: %s Screenshots are checked with OCR and rules only%s.",
            image["reason"],
            " (SANGYAN_REQUIRE_IMAGE_MODEL is set, so screenshot checks will fail)"
            if REQUIRE_IMAGE_MODEL
            else "",
        )
    else:
        log.info("Image classifier: %s", image["reason"])
    log.info("Text classifier: %s", status["text_classifier"]["status"])


def warm_up() -> None:
    """Load the OCR reader ahead of the first screenshot (it takes several seconds)."""
    from phishing_detector.ocr import get_reader

    _set_status("ocr", "loading")
    started = time.perf_counter()
    try:
        get_reader(("en",))
    except Exception as exc:
        _set_status("ocr", "failed")
        log.error("OCR warm-up failed: %s", where(exc))
        return
    _set_status("ocr", "ready")
    log.info("OCR ready in %.1fs", time.perf_counter() - started)


refresh_model_status()

# ---------------------------------------------------------------- pipeline steps

# OCR and the models are memory-hungry; one analysis at a time keeps the laptop responsive.
_analysis_lock = threading.Lock()


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def read_screenshot(image) -> dict[str, Any]:
    """OCR stays in phishing_detector.ocr; this only times it and reports failures."""
    from phishing_detector.ocr import extract_text

    started = time.perf_counter()
    try:
        ocr = extract_text(image, return_confidence=True)
    except Exception as exc:
        _set_status("ocr", "failed")
        raise OcrFailed(where(exc)) from exc
    _set_status("ocr", "ready")
    if not isinstance(ocr, dict) or not isinstance(ocr.get("text"), str):
        raise OcrFailed("OCR returned an unexpected shape")
    return {"text": ocr["text"], "tokens": list(ocr.get("tokens") or []), "ms": _ms(started)}


def classify_screenshot(image) -> tuple[Any, dict[str, Any]]:
    from phishing_detector.detectors import Detection
    from phishing_detector.service import classify_image

    plan = engine_status()["image_classifier"]
    if plan["status"] == "unavailable":
        if REQUIRE_IMAGE_MODEL:
            raise ModelUnavailable(plan["reason"])
        return Detection("image_classifier", "unavailable", detail=plan["reason"]), {}
    detection, legacy = classify_image(image, classify="full")
    if detection.status == "unavailable":
        _set_status(
            "image_classifier",
            {"status": "unavailable", "reason": "The model failed to load or run; see the server log."},
        )
        if REQUIRE_IMAGE_MODEL:
            raise ModelUnavailable("image classifier failed to load or run")
    elif detection.status == "ok":
        _set_status("image_classifier", {"status": "loaded", "reason": "Model loaded."})
    return detection, legacy


def run_engine(engine_input: EngineInput, extra_detections=()) -> tuple[EngineOutput, int]:
    from phishing_detector.service import analyze_text

    started = time.perf_counter()
    try:
        raw = analyze_text(engine_input.text, engine_input.tokens, extra_detections=extra_detections)
    except Exception as exc:
        raise InferenceFailed(where(exc)) from exc
    return validate_engine_output(raw), _ms(started)


def validate_engine_output(raw: Any) -> EngineOutput:
    try:
        return EngineOutput.model_validate(raw)
    except ValidationError as exc:
        # Field locations only: values may contain message text.
        fields = sorted({".".join(str(p) for p in error["loc"]) for error in exc.errors()})
        raise InvalidEngineOutput("invalid fields: " + ", ".join(fields[:8])) from exc


def read_confidence(tokens: list[dict], text: str, typed: bool) -> float:
    """Character-weighted OCR confidence; typed text is read exactly."""
    if typed:
        return 1.0 if text.strip() else 0.0
    weight = sum(max(1, len(str(t.get("text") or ""))) for t in tokens)
    if not weight:
        return 0.0
    total = sum(float(t.get("confidence") or 0) * max(1, len(str(t.get("text") or ""))) for t in tokens)
    return round(max(0.0, min(1.0, total / weight)), 2)


UNAVAILABLE_LABELS = {
    "url_domain": "Link check",
    "text_rules": "Message wording check",
    "brand_mismatch": "Brand and link check",
    "blocklist": "Reported-scam list",
    "image_classifier": "Image classifier (visual check)",
    "text_ml": "Text classifier",
    "rdap": "Domain age lookup",
    "safe_browsing": "Google Safe Browsing lookup",
    "phishtank_openphish": "PhishTank / OpenPhish lookup",
}


def build_response(
    engine: EngineOutput,
    legacy: dict[str, Any],
    *,
    mode: str,
    source: str,
    focus: str,
    typed: bool,
    tokens: list[dict],
    ocr_ms: int | None,
    engine_ms: int,
    started: float,
) -> dict[str, Any]:
    detectors = [d.model_dump() for d in engine.detectors]
    result = analyze_content(
        engine.text,
        [e.model_dump() for e in engine.entities],
        phishing_label=legacy.get("label"),
        phishing_confidence=legacy.get("confidence"),
        extra_signals=detector_signals(detectors),
        engine_risk=engine.risk.model_dump(),
        typed=typed,
    )
    response = {
        "analysis_id": engine.analysis_id,
        "analyzed_at": result["analyzed_at"],
        "status": result["status"],
        "analysis_mode": mode,
        "extracted_text": engine.text,
        "detected_urls": result["detected_urls"],
        "risk": {
            **result["risk"],
            "score_max": 100,
            "confidence": read_confidence(tokens, engine.text, typed),
            "confidence_basis": "typed_text" if typed else "ocr_read_quality",
            "engine_level": engine.risk.level,
            "engine_score": engine.risk.score,
        },
        "signals": result["signals"],
        "explanation": result["explanation"],
        "verification": result["verification"],
        "recommendation": result["recommendation"],
        "detectors": [{"name": d["name"], "status": d["status"], "score": d["score"]} for d in detectors],
        "metadata": {
            "processing_time_ms": _ms(started),
            "ocr_time_ms": ocr_ms,
            "engine_time_ms": engine_ms,
            "engine_version": engine.score_version,
            "source": source,
            "unavailable_checks": [
                UNAVAILABLE_LABELS.get(d["name"], d["name"])
                for d in detectors
                if d["status"] in {"unavailable", "not_configured", "not_implemented"}
            ],
        },
    }
    response["focus_report"] = build_focus_report(focus, response, engine.text)
    try:
        return AnalysisResponse.model_validate(response).model_dump()
    except ValidationError as exc:
        fields = sorted({".".join(str(p) for p in error["loc"]) for error in exc.errors()})
        raise EngineError("response failed validation: " + ", ".join(fields[:8])) from exc


def _locked(fn, *args, **kwargs):
    if not _analysis_lock.acquire(timeout=LOCK_WAIT_S):
        raise EngineBusy("previous check still running")
    try:
        return fn(*args, **kwargs)
    finally:
        _analysis_lock.release()


def _screenshot(image, source: str, focus: str) -> dict[str, Any]:
    started = time.perf_counter()
    ocr = read_screenshot(image)
    detection, legacy = classify_screenshot(image)
    engine_input = EngineInput(ocr["text"], ocr["tokens"], source, image)
    engine, engine_ms = run_engine(engine_input, extra_detections=[detection])
    return build_response(
        engine,
        legacy,
        mode="screenshot_ocr",
        source=source,
        focus=focus,
        typed=False,
        tokens=ocr["tokens"],
        ocr_ms=ocr["ms"],
        engine_ms=engine_ms,
        started=started,
    )


def _pasted_text(text: str, source: str, focus: str) -> dict[str, Any]:
    started = time.perf_counter()
    engine, engine_ms = run_engine(EngineInput(text, [], source))
    return build_response(
        engine,
        {},
        mode="pasted_text",
        source=source,
        focus=focus,
        typed=True,
        tokens=[],
        ocr_ms=None,
        engine_ms=engine_ms,
        started=started,
    )


def analyze_screenshot(image, source: str, focus: str) -> dict[str, Any]:
    return _locked(_screenshot, image, source, focus)


def analyze_pasted_text(text: str, source: str, focus: str) -> dict[str, Any]:
    return _locked(_pasted_text, text, source, focus)
