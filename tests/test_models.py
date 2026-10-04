"""Trained-model integration: paths, validated thresholds, input guards and status reporting."""

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

os.environ["SANGYAN_WARMUP"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mobile server"))

from phishing_detector import artifacts, text_ml, url_ml  # noqa: E402

TEXT_MODEL = artifacts.model_path("text")
URL_MODEL = artifacts.model_path("url")
needs_text = pytest.mark.skipif(
    artifacts.thresholds_for("text", TEXT_MODEL) is None if TEXT_MODEL.is_file() else True,
    reason="validated text model not present",
)
needs_url = pytest.mark.skipif(
    artifacts.thresholds_for("url", URL_MODEL) is None if URL_MODEL.is_file() else True,
    reason="validated URL model not present",
)
PHISHING = "URGENT: Your SBI account is blocked. Update KYC now at http://sbi-kyc-update.xyz or it will be closed today"


def test_tiers_follow_the_validated_thresholds():
    assert artifacts.tier(0.49, (0.5, 0.8)) is None
    assert artifacts.tier(0.5, (0.5, 0.8)) == "medium"
    assert artifacts.tier(0.8, (0.5, 0.8)) == "high"


def test_thresholds_belong_to_one_model_file(tmp_path):
    other = tmp_path / "text.joblib"
    other.write_bytes(b"a different model")
    assert artifacts.thresholds_for("text", other) is None


def test_missing_model_file_is_unavailable(tmp_path):
    assert text_ml.detect("hello", tmp_path / "none.joblib").status == "unavailable"
    entities = [{"type": "url", "value": "https://example.com"}]
    assert url_ml.detect(entities, tmp_path / "none.joblib").status == "unavailable"
    assert text_ml.detect("hello", None).status == "not_configured"


def test_a_model_that_fails_to_load_is_unavailable(tmp_path):
    broken = tmp_path / "text.joblib"
    broken.write_bytes(b"not a joblib file")
    with patch("phishing_detector.artifacts.thresholds_for", return_value=(0.5, 0.8)):
        detection = text_ml.detect("hello there", broken)
    assert detection.status == "unavailable" and not detection.findings


def test_prices_and_missing_spaces_are_not_links():
    from phishing_detector.entities import extract_entities

    text = "Ok lar.then see u. Pay Rs.1000 or 2.99 now. Visit sbi-kyc.xyz or bit.ly/abc"
    found = [e["value"] for e in extract_entities(text) if e["type"] in {"url", "domain"}]
    assert found == ["sbi-kyc.xyz", "bit.ly/abc"]


def test_url_scheme_and_host_are_normalized_whatever_their_case():
    assert url_ml.as_url("HTTPS://WWW.PAYTM.COM.SECURE-REWARD.XYZ/CLAIM") == (
        "https://www.paytm.com.secure-reward.xyz/CLAIM"
    )
    assert url_ml.as_url("bit.ly/abc") == "https://bit.ly/abc"


@needs_text
@pytest.mark.parametrize("value", ["", "   \n", None, 42])
def test_empty_or_non_text_input_is_not_scored(value):
    detection = text_ml.detect(value, TEXT_MODEL)
    assert detection.status == "ok"
    assert detection.model_score is None and not detection.findings


@needs_text
def test_text_model_reports_tier_and_phrases():
    detection = text_ml.detect(PHISHING, TEXT_MODEL)
    assert detection.status == "ok" and detection.tier == "high"
    assert 0 <= detection.model_score <= 1
    finding = detection.findings[0]
    assert finding.score == artifacts.TIER_SCORES["high"]
    assert finding.evidence.startswith('"')


@needs_url
def test_official_domains_skip_the_url_model():
    entities = [{"type": "url", "value": "https://www.hdfcbank.com/personal/pay/cards"}]
    assert url_ml.detect(entities, URL_MODEL).tier == "high"
    skipped = url_ml.detect(entities, URL_MODEL, official=["hdfcbank.com"])
    assert skipped.status == "ok" and skipped.model_score is None and not skipped.findings


@needs_url
def test_uppercase_phishing_url_is_scored():
    entities = [{"type": "url", "value": "HTTPS://WWW.PAYTM.COM.SECURE-REWARD.XYZ/CLAIM"}]
    assert url_ml.detect(entities, URL_MODEL).tier is not None


def test_summary_reports_partial_and_never_low_when_models_are_missing():
    import engine_adapter

    detectors = [{"name": "text_ml", "status": "unavailable"}, {"name": "rdap", "status": "not_implemented"}]
    category, classification, status, explanation = engine_adapter.summarize(
        "LOW_ATTENTION", detectors, None, "We did not find common scam signs."
    )
    assert (category, classification, status) == ("LOW", "undetermined", "PARTIAL")
    assert "Text classifier" in explanation and "incomplete" in explanation

    _, classification, status, _ = engine_adapter.summarize(
        "LOW_ATTENTION", [{"name": "rdap", "status": "not_implemented"}], None, "x"
    )
    assert (classification, status) == ("no_strong_indicators", "COMPLETED")
    assert engine_adapter.summarize("INCONCLUSIVE", [], 0.1, "x")[1:3] == ("undetermined", "INCONCLUSIVE")
    assert "hard to read" in engine_adapter.summarize("ELEVATED", [], 0.4, "x")[3]


@needs_text
def test_one_model_alone_cannot_make_a_message_high_risk():
    import engine_adapter

    sip = (
        "Your SIP of Rs 5,000 in XYZ Flexi Cap Fund has been processed on 05-Oct. "
        "NAV and units will be updated in your next account statement."
    )
    result = engine_adapter.analyze_pasted_text(sip, "test", "investment")
    text = next(d for d in result["detectors"] if d["name"] == "text_ml")
    assert text["tier"] == "high"
    assert result["risk"]["category"] == "MEDIUM"
