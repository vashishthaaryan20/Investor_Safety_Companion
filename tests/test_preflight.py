import csv
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from phishing_detector.datasets import (
    audit_images,
    audit_text,
    clean_records,
    load_text_data,
    prepare_text,
    read_source,
)
from phishing_detector.detectors import Detection, Finding
from phishing_detector.fusion import fuse
from phishing_detector.metrics import binary_metrics
from phishing_detector.reputation import _CACHE, detect_reputation
from phishing_detector.screening_eval import evaluate_pipeline, summarize
from phishing_detector.settings import validate_settings


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def test_multiple_mapped_sources_and_deterministic_groups(tmp_path):
    first, second = tmp_path / "messages.csv", tmp_path / "reports.jsonl"
    write_csv(
        first,
        ["message", "verdict", "campaign", "unused"],
        [
            {
                "message": f"source A message {i}",
                "verdict": "scam" if i % 2 else "genuine",
                "campaign": f"campaign-{i // 2}",
                "unused": "metadata",
            }
            for i in range(40)
        ],
    )
    second.write_text(
        "\n".join(
            json.dumps(
                {
                    "body": f"source B message {i}",
                    "confirmed": "phishing" if i % 2 else "legitimate",
                    "group_id": f"campaign-{i // 2}",
                }
            )
            for i in range(40)
        ),
        encoding="utf-8",
    )
    manifest = tmp_path / "sources.json"
    manifest.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "path": "messages.csv",
                        "columns": {
                            "text": "message",
                            "label": "verdict",
                            "group": "campaign",
                        },
                        "labels": {"scam": "phishing", "genuine": "legitimate"},
                    },
                    {
                        "path": "reports.jsonl",
                        "columns": {
                            "text": "body",
                            "label": "confirmed",
                            "group": "group_id",
                        },
                    },
                ]
            }
        )
    )
    report = prepare_text(manifest, tmp_path / "ready")
    assert report["rows"] == 80
    records, audit = load_text_data(tmp_path / "ready")
    assert audit["groups"] == 20
    assert audit["status"] == "passed"
    prepare_text(manifest, tmp_path / "ready-again")
    assert (tmp_path / "ready/train.csv").read_bytes() == (
        tmp_path / "ready-again/train.csv"
    ).read_bytes()
    group_splits = {}
    for record in records:
        group_splits.setdefault(record["group"], set()).add(record["split"])
    assert all(len(splits) == 1 for splits in group_splits.values())
    with pytest.raises(FileExistsError):
        prepare_text(manifest, tmp_path / "ready")


def test_bad_labels_headers_and_leakage_fail(tmp_path):
    path = tmp_path / "source.csv"
    write_csv(path, ["text", "label"], [{"text": "hello", "label": "spam"}])
    with pytest.raises(ValueError, match="explicit"):
        read_source(path)
    write_csv(path, ["message", "label"], [{"message": "hello", "label": "legitimate"}])
    with pytest.raises(ValueError, match="missing column"):
        read_source(path)
    rows = [
        {
            "text": "Send OTP",
            "label": "phishing",
            "group": "one",
            "split": "train",
            "source": "A",
        },
        {
            "text": " send  otp ",
            "label": "legitimate",
            "group": "two",
            "split": "train",
            "source": "B",
        },
    ]
    with pytest.raises(ValueError, match="Conflicting"):
        clean_records(rows)
    rows[1]["label"] = "phishing"
    rows[1]["split"] = "test"
    with pytest.raises(ValueError, match="Duplicate"):
        clean_records(rows)
    rows[1]["text"] = "Another message"
    rows[1]["group"] = "one"
    with pytest.raises(ValueError, match="overlaps"):
        audit_text(rows)


def test_image_preflight_detects_duplicates_and_corruption(tmp_path):
    for index, (split, label) in enumerate(
        (s, l) for s in ("train", "val", "test") for l in ("legitimate", "phishing")
    ):
        folder = tmp_path / split / label
        folder.mkdir(parents=True)
        Image.new("RGB", (10, 10), (index * 30, 5, 10)).save(folder / "one.png")
    assert audit_images(tmp_path)["status"] == "passed"
    duplicate = tmp_path / "test/phishing/duplicate.png"
    duplicate.write_bytes((tmp_path / "train/legitimate/one.png").read_bytes())
    assert any("Duplicate pixels" in e for e in audit_images(tmp_path)["errors"])
    (tmp_path / "val/phishing/broken.png").write_bytes(b"not an image")
    assert any("Unreadable" in e for e in audit_images(tmp_path)["errors"])
    assert audit_images(tmp_path, decode=False)["decoded"] is False


def test_settings_and_overrides():
    source = {
        "brands": {"Acme": ["https://acme.example"]},
        "fusion": {"weights": {"text_rules": 0.2}},
    }
    validated = validate_settings(source)
    assert validated["brands"] == {"acme": ["acme.example"]}
    assert source["brands"] != validated["brands"]
    for invalid in (
        {"brands": {"x": []}},
        {"blocklist": [{"type": "domain", "value": ""}]},
        {"fusion": {"suspicious_threshold": 0.9, "dangerous_threshold": 0.4}},
        {"fusion": {"weights": {"text_rules": float("nan")}}},
        {"safe_browsing": {"timeout_seconds": 0}},
    ):
        with pytest.raises(ValueError):
            validate_settings(invalid)
    detection = Detection(
        "blocklist",
        findings=[Finding("blocklist", 1, "Bad", "Confirmed", "bad.example", True)],
    )
    options = validate_settings({"fusion": {"weights": {"blocklist": 0}}})["fusion"]
    assert fuse([detection], "text", [], options)["risk"]["level"] == "dangerous"


def test_reputation_cache_failure_and_uncertain_ocr(monkeypatch):
    monkeypatch.setenv("SAFE_BROWSING_API_KEY", "test-key")
    _CACHE.clear()
    entities = [
        {
            "type": "url",
            "value": "https://bad.example/path",
            "normalized": "https://bad.example/path",
            "ocr_confidence": 0.99,
        }
    ]
    client = MagicMock(
        return_value={
            "matches": [
                {
                    "threat": {"url": entities[0]["value"]},
                    "threatType": "SOCIAL_ENGINEERING",
                    "cacheDuration": "120s",
                }
            ]
        }
    )
    result = detect_reputation(entities, {"enabled": True}, client)
    assert result.findings[0].hard_override
    detect_reputation(entities, {"enabled": True}, client)
    client.assert_called_once()
    entities[0]["ocr_confidence"] = 0.5
    assert (
        not detect_reputation(entities, {"enabled": True}, client)
        .findings[0]
        .hard_override
    )
    _CACHE.clear()
    failure = MagicMock(side_effect=TimeoutError("test"))
    result = detect_reputation(entities, {"enabled": True}, failure)
    assert result.status == "unavailable" and not result.findings
    assert detect_reputation(entities, {"enabled": False}, failure).status == "disabled"
    monkeypatch.delenv("SAFE_BROWSING_API_KEY")
    assert (
        detect_reputation(entities, {"enabled": True}, client).status
        == "not_configured"
    )


def test_evaluation_reports_unknown_separately_and_no_fit(tmp_path, monkeypatch):
    monkeypatch.delenv("DETECTION_CONFIG", raising=False)
    monkeypatch.delenv("TEXT_MODEL_PATH", raising=False)
    manifest = tmp_path / "evaluation.csv"
    write_csv(
        manifest,
        ["id", "text", "label", "split"],
        [
            {
                "id": "safe",
                "text": "meeting notes",
                "label": "legitimate",
                "split": "val",
            },
            {"id": "bad", "text": "Send your OTP", "label": "phishing", "split": "val"},
        ],
    )
    output = tmp_path / "result.json"
    with patch("phishing_detector.text_ml.train") as training:
        summary = evaluate_pipeline(manifest, output, "val")
    training.assert_not_called()
    assert summary["metrics_on_answered"]["false_negatives"] == 0
    report = json.loads(output.read_text())
    assert report["validation_threshold_sweep"]
    assert "detector_features" in report["rows"][0]
    with pytest.raises(FileExistsError):
        evaluate_pipeline(manifest, output, "val")
    rows = [{"id": "unknown", "label": "phishing", "level": "unknown", "score": 0}]
    assert summarize(rows)["unknown"] == 1
    assert summarize(rows)["metrics_on_answered"] is None
    metrics = binary_metrics(["legitimate", "phishing"], ["phishing", "legitimate"])
    assert metrics["false_positives"] == metrics["false_negatives"] == 1


def test_image_training_never_builds_model_when_preflight_fails(tmp_path):
    from phishing_detector import train

    with (
        patch.object(train.storage, "ensure_dataset"),
        patch.object(
            train, "audit_images", return_value={"errors": ["duplicate leakage"]}
        ),
        patch.object(train, "build_model") as build,
        pytest.raises(ValueError, match="preflight failed"),
    ):
        train.main(output=tmp_path / "new.pth")
    build.assert_not_called()
    existing = tmp_path / "old.pth"
    existing.write_bytes(b"existing checkpoint")
    with pytest.raises(FileExistsError):
        train.main(output=existing)
    assert existing.read_bytes() == b"existing checkpoint"


def test_checkpoint_saves_even_when_first_validation_accuracy_is_zero(tmp_path):
    from phishing_detector import train

    target = tmp_path / "new.pth"
    model = MagicMock()
    model.to.return_value = model

    def checkpoint(_model, path):
        path.write_bytes(b"mock checkpoint; no training")

    with (
        patch.object(train.storage, "ensure_dataset"),
        patch.object(train, "EPOCHS", 1),
        patch.object(
            train,
            "audit_images",
            return_value={"errors": [], "warnings": [], "counts": {}},
        ),
        patch.object(
            train, "get_data_loaders", return_value=([], [], ["legitimate", "phishing"])
        ),
        patch.object(train, "build_model", return_value=model),
        patch.object(train, "Adam"),
        patch.object(train, "train_one_epoch", return_value=(1, 0)),
        patch.object(train, "validate", return_value=(1, 0, {})),
        patch.object(train, "get_test_loader", return_value=None),
        patch.object(train, "save_checkpoint", side_effect=checkpoint),
    ):
        train.main(target)
    assert target.exists()
    assert Path(str(target) + ".metrics.json").exists()
