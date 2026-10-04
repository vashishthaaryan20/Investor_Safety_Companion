import base64
import csv
import sqlite3
from io import BytesIO
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image

import main
from phishing_detector.entities import extract_entities, find_urls, normalize_entity
from phishing_detector.feedback import record_feedback
from phishing_detector.ocr import group_into_lines, load_image
from phishing_detector.service import analyze_image, analyze_text


def token(text, trust):
    return [{"text": text, "char_start": 0, "char_end": len(text), "confidence": trust}]


def test_urls_and_emails():
    text = "Contact user@example.com, then (https://example.technology/Case?q=X), or shop.example.org/pay."
    assert find_urls(text) == [
        "https://example.technology/Case?q=X",
        "shop.example.org/pay",
    ]
    assert (
        normalize_entity("url", "https://EXAMPLE.com/Case?q=X")
        == "https://example.com/Case?q=X"
    )
    assert not any(
        e["type"] == "payment_id" for e in extract_entities("user@paytm.com")
    )


def test_unicode_and_punycode():
    assert find_urls("https://аpple.example xn--pple-43d.example") == [
        "https://аpple.example",
        "xn--pple-43d.example",
    ]


def test_entities_and_spans():
    text = "Pay alice@ybl account: 123456789012 IFSC HDFC0001234 send OTP 0x" + "a" * 40
    entities = extract_entities(text, token(text, 0.7))
    assert {
        "payment_id",
        "bank_account",
        "ifsc",
        "secret_request",
        "crypto_wallet",
    } <= {e["type"] for e in entities}
    for e in entities:
        assert text[e["start"] : e["end"]] == e["value"]
        assert e["ocr_confidence"] == 0.7


def test_preserve_low_confidence_and_order():
    bbox = lambda x: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]]
    result = group_into_lines([(bbox(30), "OTP", 0.2), (bbox(0), "Send", 0.9)])
    assert result["text"] == "Send OTP"
    assert result["tokens"][1]["confidence"] == 0.2
    assert result["tokens"][1]["char_start"] == 5


def test_negation_does_not_hide_later_request():
    assert not any(
        e["type"] == "secret_request" for e in extract_entities("Never share your OTP.")
    )
    assert any(
        e["type"] == "secret_request"
        for e in extract_entities("Never share passwords. Send your OTP now.")
    )


def test_blocklist_override_and_ocr_uncertainty():
    settings = {
        "blocklist": [{"type": "domain", "value": "bad.example", "source": "test"}]
    }
    assert (
        analyze_text("bad.example", settings=settings)["risk"]["level"] == "dangerous"
    )
    uncertain = analyze_text("bad.example", token("bad.example", 0.2), settings)
    assert uncertain["risk"]["level"] == "unknown"
    assert (
        analyze_text("bad.example.evil.org", settings=settings)["risk"]["level"]
        != "dangerous"
    )


def test_brand_boundaries_and_lookalike_confidence():
    settings = {"brands": {"acme": ["acme.example"]}}
    assert (
        analyze_text("Acme https://login.acme.example", settings=settings)["risk"][
            "score"
        ]
        == 0
    )
    text = "Acme https://acme.example.evil.org"
    high = analyze_text(text, token(text, 0.99), settings)
    low = analyze_text(text, token(text, 0.3), settings)
    assert high["risk"]["score"] > low["risk"]["score"]
    assert high["risk"]["level"] == "dangerous"


def test_unknown_and_deduplication():
    assert analyze_text("")["risk"]["level"] == "unknown"
    assert analyze_text("urgent")["risk"] == analyze_text("urgent " * 30)["risk"]
    result = analyze_text("Send OTP immediately to claim your prize")
    assert len(result["signals"]) <= 3
    assert any(d["status"] == "not_implemented" for d in result["detectors"])


def png():
    buffer = BytesIO()
    Image.new("RGB", (40, 40), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_image_bytes_and_one_ocr_pass():
    assert load_image(png()).size == (40, 40)
    with patch(
        "phishing_detector.ocr.extract_text",
        return_value={"text": "Send OTP", "tokens": []},
    ) as ocr:
        result = analyze_image(png(), classify=None)
    assert ocr.call_count == 1
    assert result["extracted_text"] == "Send OTP"
    assert result["risk"]["level"] == "suspicious"


def test_api_contract_and_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("FEEDBACK_DB", str(tmp_path / "reports.db"))
    client = TestClient(main.app)
    result = analyze_text("Send OTP")
    with patch("main.analyze_image", return_value=result):
        multipart = client.post(
            "/api/v1/analyze", files={"image": ("test.png", png(), "image/png")}
        )
        encoded = client.post(
            "/api/v1/save-image-json", json={"image": base64.b64encode(png()).decode()}
        )
    assert multipart.status_code == 200
    assert encoded.json()["result"] == multipart.json()
    assert (
        client.post("/api/v1/save-image-json", json={"image": "???"}).status_code == 400
    )
    assert (
        client.post(
            "/api/v1/analyze", files={"image": ("x", b"not an image")}
        ).status_code
        == 400
    )
    report = client.post(
        "/api/v1/feedback",
        json={"analysis_id": result["analysis_id"], "kind": "report_scam"},
    )
    assert report.status_code == 201
    assert report.json()["review_status"] == "pending"
    assert (
        client.post(
            "/api/v1/feedback",
            json={"analysis_id": result["analysis_id"], "kind": "invalid"},
        ).status_code
        == 422
    )


def test_health_and_pasted_text(monkeypatch):
    monkeypatch.delenv("DETECTION_CONFIG", raising=False)
    monkeypatch.delenv("TEXT_MODEL_PATH", raising=False)
    client = TestClient(main.app)
    assert client.get("/api/v1/health").json()["status"] == "ok"
    with patch("main.analyze_image") as image_analysis:
        response = client.post(
            "/api/v1/analyze-text", json={"text": "Send OTP immediately to bad.example"}
        )
    image_analysis.assert_not_called()
    assert response.status_code == 200
    result = response.json()
    assert result["analysis_mode"] == "pasted_text"
    assert "bad.example" in result["detected_urls"]
    assert any(e["type"] == "secret_request" for e in result["entities"])
    assert result["risk"]["level"] == "suspicious"
    for text in ("", "   ", "x" * 20001):
        assert (
            client.post("/api/v1/analyze-text", json={"text": text}).status_code == 422
        )


def test_feedback_is_pending(tmp_path):
    path = tmp_path / "feedback.db"
    record_feedback("id", "wrong_verdict", "It's legitimate", db_path=path)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT review_status FROM feedback").fetchone() == (
            "pending",
        )


def test_ml_training_and_reload(tmp_path):
    from phishing_detector.text_ml import detect, train

    data, artifact = tmp_path / "train.csv", tmp_path / "model.joblib"
    with data.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["text", "label"])
        for i in range(20):
            writer.writerow([f"claim prize send OTP urgently {i}", "phishing"])
            writer.writerow([f"meeting agenda lunch project {i}", "legitimate"])
    model = MagicMock()
    model.classes_ = ["legitimate", "phishing"]
    model.predict.side_effect = lambda texts: [
        "phishing" if "OTP" in text else "legitimate" for text in texts
    ]
    model.predict_proba.return_value = [[0.1, 0.9]]
    with (
        patch("sklearn.pipeline.make_pipeline", return_value=model),
        patch(
            "joblib.dump",
            side_effect=lambda _model, path: path.write_text("test artifact"),
        ),
        patch("phishing_detector.text_ml.load_model", return_value=model),
    ):
        report = train(data, artifact)
        assert report["train_count"] + report["val_count"] + report["test_count"] == 40
        model.fit.assert_called_once()
        assert len(model.fit.call_args.args[0]) == report["train_count"]
        # A new model is not used until thresholds are validated for that exact file.
        unvalidated = detect("send OTP", str(artifact))
        assert unvalidated.status == "unavailable" and "thresholds" in unvalidated.detail
        with (
            patch("phishing_detector.artifacts.thresholds_for", return_value=(0.5, 0.8)),
            patch("phishing_detector.text_ml.suspicious_phrases", return_value=["send otp"]),
        ):
            validated = detect("send OTP", str(artifact))
        assert validated.status == "ok" and validated.tier == "high"
        assert validated.findings[0].evidence == '"send otp"'
    assert detect("text", str(tmp_path / "missing")).status == "unavailable"


def test_url_ocr_separators_and_source_spans():
    for raw, expected in [
        ("https : / / example . com/Pay", "https://example.com/Pay"),
        ("httpsll\nexample.com/send?phone=123", "https://example.com/send?phone=123"),
        (
            "https://\nexample.com/send?\nphone=123",
            "https://example.com/send?phone=123",
        ),
        ("www . example . technology/Pay", "https://www.example.technology/Pay"),
    ]:
        assert find_urls(raw) == [expected]
        link = next(
            e for e in extract_entities(raw, token(raw, 0.95)) if e["type"] == "url"
        )
        assert raw[link["start"] : link["end"]] == link["value"]
        assert link["ocr_confidence"] <= 0.7


def test_damaged_link_is_evidence_not_guessed_domain():
    text = "Contact: httpsll\napiwhatsapp comlsend?\nphone-917523823896"
    result = analyze_text(text, settings={})
    assert result["detected_urls"] == []
    assert result["url_candidates"]
    assert any(
        s["title"] == "Link could not be read reliably" for s in result["signals"]
    )
    assert find_urls("https:// bad.example") == ["https://bad.example"]
    settings = {"blocklist": [{"type": "domain", "value": "bad.example"}]}
    assert (
        analyze_text("httpsll bad.example", settings=settings)["risk"]["level"]
        != "dangerous"
    )


def test_link_punctuation_and_following_text():
    assert find_urls("See https://example.com/wiki/Test_(one), then call.") == [
        "https://example.com/wiki/Test_(one)"
    ]
    assert find_urls("https://example.com. This is a sentence.") == [
        "https://example.com"
    ]
