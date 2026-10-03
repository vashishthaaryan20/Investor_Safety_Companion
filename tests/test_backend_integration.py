"""API -> engine adapter -> phishing_detector integration and failure handling (Milestone 8).

OCR and the image model are replaced with fakes where a test needs a specific outcome;
everything after OCR runs the real engine and the real investor-safety rules.
"""

import os
import sys
import threading
import time
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

os.environ.setdefault("SANGYAN_RATE_LIMIT", "10000")
os.environ["SANGYAN_WARMUP"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "anweshabackend"))

from fastapi.testclient import TestClient  # noqa: E402

import engine_adapter  # noqa: E402
import server  # noqa: E402
from contract import AnalysisResponse  # noqa: E402
from phishing_detector.detectors import Detection, Finding  # noqa: E402
from safety_engine import analyze_content, detector_signals, level_for  # noqa: E402

SCAM = "Guaranteed 5X returns! Only 15 minutes left, invest now. Share your OTP at bit.ly/vip-trade"
SECRET = "SANGYAN-PRIVATE-7731"


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def model_unavailable(monkeypatch):
    """The default for these tests matches this laptop: no image model weights."""
    monkeypatch.setattr(engine_adapter, "REQUIRE_IMAGE_MODEL", False)
    engine_adapter._set_status(
        "image_classifier", {"status": "unavailable", "reason": "No model weights on the server."}
    )
    yield
    engine_adapter.refresh_model_status()


def png(size=(200, 80)):
    buffer = BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def fake_ocr(text, confidence=0.95):
    tokens = [
        {"text": word, "confidence": confidence, "char_start": 0, "char_end": len(word)}
        for word in text.split()
    ]
    return patch("phishing_detector.ocr.extract_text", return_value={"text": text, "tokens": tokens})


def upload(client, data=None):
    return client.post("/api/v1/analyze", files={"image": ("shot.png", data or png(), "image/png")})


def test_health_reports_engine_status(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["contract_version"] == "1.0"
    engine = body["engine"]
    assert engine["rules"] == "ready"
    assert engine["image_classifier"]["status"] == "unavailable"
    assert any("Image classifier" in reason for reason in engine["degraded"])


def test_screenshot_runs_ocr_and_real_engine(client):
    with fake_ocr(SCAM) as ocr:
        response = upload(client)
    assert response.status_code == 200
    assert ocr.call_count == 1
    body = AnalysisResponse.model_validate(response.json())
    assert body.analysis_mode == "screenshot_ocr"
    assert body.status == "success"
    assert body.risk.level == "HIGH_ATTENTION"
    assert body.risk.engine_level == "dangerous"
    assert body.risk.score >= body.risk.engine_score // 1
    assert body.risk.confidence == pytest.approx(0.95)
    assert body.risk.confidence_basis == "ocr_read_quality"
    assert "https://bit.ly/vip-trade" in body.detected_urls
    origins = {s.origin for s in body.signals}
    assert origins == {"engine", "investor_rules"}
    assert all(s.evidence for s in body.signals if s.id in {"guaranteed_returns", "short_link"})
    assert body.recommendation.action == "STOP_AND_VERIFY"
    assert body.metadata.ocr_time_ms is not None
    assert "Image classifier (visual check)" in body.metadata.unavailable_checks


def test_pasted_text_uses_the_same_engine(client):
    response = client.post("/api/v1/analyze-text", json={"text": SCAM, "focus": "links"})
    assert response.status_code == 200
    body = AnalysisResponse.model_validate(response.json())
    assert body.analysis_mode == "pasted_text"
    assert body.risk.confidence_basis == "typed_text"
    assert body.metadata.ocr_time_ms is None
    assert body.focus_report and body.focus_report.focus == "links"


def test_model_loads_successfully(client, monkeypatch):
    engine_adapter._set_status("image_classifier", {"status": "available", "reason": "test"})
    detection = Detection(
        "image_classifier",
        findings=[Finding("image_classifier", 0.9, "Visual classifier signal", "Visual match", "ResNet50")],
    )
    legacy = {"label": "phishing", "confidence": 90.0, "probs": None, "warning": None}
    monkeypatch.setattr("phishing_detector.service.classify_image", lambda *a, **k: (detection, legacy))
    with fake_ocr("Please log in to continue to your account dashboard"):
        body = upload(client).json()
    assert engine_adapter.engine_status()["image_classifier"]["status"] == "loaded"
    assert {"name": "image_classifier", "status": "ok", "score": 0.9} in body["detectors"]
    visual = next(s for s in body["signals"] if s["id"] == "phishing_visual")
    assert visual["origin"] == "engine"
    assert "Image classifier (visual check)" not in body["metadata"]["unavailable_checks"]


def test_model_missing_degrades_with_disclosure(client):
    with fake_ocr(SCAM):
        response = upload(client)
    assert response.status_code == 200
    assert {"name": "image_classifier", "status": "unavailable", "score": 0} in response.json()["detectors"]


def test_model_missing_is_a_clear_error_when_required(client, monkeypatch):
    monkeypatch.setattr(engine_adapter, "REQUIRE_IMAGE_MODEL", True)
    with fake_ocr(SCAM):
        response = upload(client)
    assert response.status_code == 503
    assert response.json()["error"] == "model_unavailable"
    assert "model" in response.json()["detail"]
    assert client.get("/api/v1/health").json()["engine"]["ready"] is False


def test_model_that_fails_to_load_is_reported(client, monkeypatch):
    engine_adapter._set_status("image_classifier", {"status": "available", "reason": "test"})
    monkeypatch.setattr(engine_adapter, "REQUIRE_IMAGE_MODEL", True)
    broken = Detection("image_classifier", "unavailable", detail="Model could not be loaded or evaluated")
    monkeypatch.setattr("phishing_detector.service.classify_image", lambda *a, **k: (broken, {}))
    with fake_ocr(SCAM):
        response = upload(client)
    assert response.status_code == 503
    assert response.json()["error"] == "model_unavailable"
    assert engine_adapter.engine_status()["image_classifier"]["status"] == "unavailable"


@pytest.mark.parametrize(
    "text, confidence",
    [("", 0.0), ("   ", 0.0), ("ok", 0.99), ("Meeting notes for the quarterly review", 0.2)],
)
def test_unreadable_screenshots_are_inconclusive(client, text, confidence):
    with fake_ocr(text, confidence):
        body = upload(client).json()
    assert body["status"] == "inconclusive"
    assert body["risk"]["level"] == "INCONCLUSIVE"
    assert body["recommendation"]["action"] == "RETRY_WITH_CLEARER_INPUT"
    assert body["signals"] == []


def test_short_pasted_text_is_not_told_to_send_a_screenshot(client):
    body = client.post("/api/v1/analyze-text", json={"text": "ok thanks!"}).json()
    assert body["status"] == "inconclusive"
    assert body["recommendation"]["action"] == "RETRY_WITH_CLEARER_INPUT"
    for message in (body["explanation"], body["recommendation"]["message"]):
        assert "screenshot" not in message.lower()


def test_wording_matches_the_signals_found():
    low = analyze_content("Your monthly statement is ready to view in the app.")
    assert low["risk"]["level"] == "LOW_ATTENTION" and not low["signals"]
    assert "not mean it is safe" in low["explanation"]
    assert "safe" not in low["recommendation"]["message"]

    single = analyze_content("Guaranteed returns of 4% every month on your deposit.")
    assert len(single["signals"]) == 1
    assert single["explanation"].startswith("We found a warning sign.")


def test_model_reason_names_only_what_is_missing(monkeypatch):
    from phishing_detector import config, storage

    monkeypatch.setattr(config, "MODEL_PATH", Path("does-not-exist.pt"))
    monkeypatch.setattr(storage, "s3_enabled", lambda: True)
    monkeypatch.setattr(engine_adapter, "find_spec", lambda name: object())
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    reason = engine_adapter._plan_image_classifier()["reason"]
    assert reason.endswith("is missing AWS credentials.")
    assert "boto3" not in reason


@pytest.mark.parametrize(
    "raw",
    [
        {"analysis_id": "x"},
        {"text": "x", "risk": {"level": "maybe", "score": 50}},
        "not a dict",
        None,
    ],
)
def test_invalid_engine_output_fails_validation(client, raw):
    with fake_ocr(SCAM), patch("phishing_detector.service.analyze_text", return_value=raw):
        response = upload(client)
    assert response.status_code == 502
    assert response.json()["error"] == "engine_invalid_output"


def test_out_of_range_engine_scores_are_rejected(client):
    from phishing_detector.service import analyze_text

    for bad in (150.0, -1.0, float("nan")):
        raw = analyze_text(SCAM)
        raw["risk"]["score"] = bad
        with fake_ocr(SCAM), patch("phishing_detector.service.analyze_text", return_value=raw):
            response = upload(client)
        assert response.status_code == 502, bad


def test_inference_exception_is_controlled(client):
    with fake_ocr(SCAM), patch(
        "phishing_detector.service.analyze_text", side_effect=RuntimeError(f"boom {SECRET}")
    ):
        response = upload(client)
    assert response.status_code == 500
    assert response.json() == {
        "detail": "We couldn't check this right now. Please try again.",
        "error": "engine_failed",
    }
    assert SECRET not in response.text and "Traceback" not in response.text


def test_ocr_exception_is_controlled(client):
    with patch("phishing_detector.ocr.extract_text", side_effect=OSError(SECRET)):
        response = upload(client)
    assert response.status_code == 500
    assert response.json()["error"] == "ocr_failed"
    assert SECRET not in response.text


def test_invalid_images_are_client_errors(client):
    gif = BytesIO()
    Image.new("RGB", (40, 40)).save(gif, format="GIF")
    cases = [
        (b"definitely not an image", 400, "image_unreadable"),
        (gif.getvalue(), 415, "image_unsupported"),
        (png((4, 4)), 400, "image_too_small"),
    ]
    for data, status, code in cases:
        response = upload(client, data)
        assert response.status_code == status
        assert response.json()["error"] == code
        assert response.json()["detail"]


def test_timeout_is_recoverable(client, monkeypatch):
    monkeypatch.setattr(engine_adapter, "ANALYSIS_TIMEOUT_S", 0.5)
    monkeypatch.setattr(engine_adapter, "LOCK_WAIT_S", 0.1)
    release = threading.Event()

    def slow_ocr(*_args, **_kwargs):
        release.wait(5)
        return {"text": SCAM, "tokens": []}

    with patch("phishing_detector.ocr.extract_text", side_effect=slow_ocr):
        first = upload(client)
        assert first.status_code == 504
        assert first.json()["error"] == "timeout"
        assert first.headers["Retry-After"] == "5"
        # The abandoned check still holds the engine, so the next one is told to retry.
        busy = upload(client)
        assert busy.status_code == 503
        assert busy.json()["error"] == "busy"
        release.set()
        time.sleep(0.3)
    with fake_ocr(SCAM):
        assert upload(client).status_code == 200


def test_every_raised_level_has_a_visible_reason():
    from phishing_detector.service import analyze_text

    samples = [
        SCAM,
        "Urgent: verify your KYC or your account will be blocked",
        "Install AnyDesk so our team can help you withdraw profits",
        "Visit https://hdfcbank.secure-login.example to continue",
        "Your statement is ready.",
    ]
    for text in samples:
        engine = analyze_text(text)
        result = analyze_content(
            text,
            engine["entities"],
            extra_signals=detector_signals(engine["detectors"]),
            engine_risk=engine["risk"],
        )
        assert result["risk"]["score"] >= int(engine["risk"]["score"])
        assert result["risk"]["level"] == level_for(result["risk"]["score"])
        if result["risk"]["level"] != "LOW_ATTENTION":
            assert result["signals"], text


def test_weak_visual_match_is_shown_not_hidden():
    result = analyze_content(
        "Login page for your trading account dashboard",
        phishing_label="legitimate",
        phishing_confidence=55,
        engine_risk={"level": "low", "score": 24.75},
    )
    assert result["risk"]["level"] == "MODERATE"
    assert any(s["id"] == "phishing_visual_weak" for s in result["signals"])


def test_phrases_split_across_ocr_lines_still_match():
    wrapped = "Join now for a referral\nbonus. Pay the fees before\nwithdrawing your profit.\nHurry, last\nchance."
    flat = " ".join(wrapped.split())
    split_result, flat_result = analyze_content(wrapped), analyze_content(flat)
    assert split_result["signals"] == flat_result["signals"]
    assert {"pyramid_scheme", "fake_platform", "urgency"} <= {s["id"] for s in split_result["signals"]}

    hyphen = analyze_content("Our sure-\nshot profit plan pays every week")
    assert hyphen["signals"][0]["evidence"] == ["sure-shot profit"]


def test_unknown_engine_findings_are_kept():
    signals = detector_signals(
        [{"name": "text_rules", "findings": [{"title": "New pattern", "score": 0.7, "category": "text_rules",
                                               "description": "Something new", "evidence": "abc"}]}]
    )
    assert signals == [
        {
            "id": "engine_new_pattern",
            "category": "behavior",
            "severity": "high",
            "title": "New pattern",
            "description": "Something new",
            "evidence": ["abc"],
            "origin": "engine",
        }
    ]
