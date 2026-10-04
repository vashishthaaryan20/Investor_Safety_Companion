import csv
import json
from unittest.mock import patch

import pytest

from phishing_detector.train_all import main, preflight
from phishing_detector.url_ml import load_url_data, train


def prepared(root, url=False):
    root.mkdir()
    for split in ("train", "val", "test"):
        with (root / f"{split}.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(
                stream, fieldnames=["url" if url else "text", "label", "split", "group"]
            )
            writer.writeheader()
            for label in ("legitimate", "phishing"):
                value = (
                    f"https://{split}-{label}.example/path"
                    if url
                    else f"{split} {label} unique message"
                )
                writer.writerow(
                    {
                        "url" if url else "text": value,
                        "label": label,
                        "split": split,
                        "group": f"{split}-{label}",
                    }
                )


def test_launcher_preflights_then_runs_sequentially_and_refuses_overwrite(tmp_path):
    prepared(tmp_path / "urls", url=True)
    prepared(tmp_path / "messages")
    config = tmp_path / "training.json"
    config.write_text(
        json.dumps(
            {"url": {"data": "urls"}, "text": {"data": "messages"}, "output": "models"}
        )
    )
    with patch("phishing_detector.train_all.subprocess.run") as run:
        main(["--config", str(config), "--models", "url", "text", "--check"])
        run.assert_not_called()
        main(["--config", str(config), "--models", "url", "text"])
        assert run.call_count == 2
        assert "url_ml" in run.call_args_list[0].args[0][2]
        assert "text_ml" in run.call_args_list[1].args[0][2]
        assert run.call_args_list[0].kwargs["check"] is True
    assert "URL_MODEL_PATH=" in (tmp_path / "models/activation.env").read_text()
    (tmp_path / "models/url.joblib").write_bytes(b"existing")
    with pytest.raises(FileExistsError):
        preflight(config, ["url", "text"])


def test_missing_data_prevents_any_training_and_failure_stops_queue(tmp_path):
    prepared(tmp_path / "urls", url=True)
    config = tmp_path / "training.json"
    config.write_text(
        json.dumps(
            {"url": {"data": "urls"}, "text": {"data": "missing"}, "output": "models"}
        )
    )
    with (
        patch("phishing_detector.train_all.subprocess.run") as run,
        pytest.raises(ValueError, match="Missing prepared"),
    ):
        main(["--config", str(config), "--models", "url", "text"])
    run.assert_not_called()
    prepared(tmp_path / "missing")
    with (
        patch(
            "phishing_detector.train_all.subprocess.run",
            side_effect=RuntimeError("failed"),
        ) as run,
        pytest.raises(RuntimeError),
    ):
        main(["--config", str(config), "--models", "url", "text"])
    assert run.call_count == 1
    assert not (tmp_path / "models/activation.env").exists()


def test_url_rejects_hostname_leakage_and_uses_separate_training_kind(tmp_path):
    prepared(tmp_path / "urls", url=True)
    records, report = load_url_data(tmp_path / "urls")
    assert len(records) == 6 and report["status"] == "passed"
    with patch("phishing_detector.text_ml.train") as baseline:
        train(tmp_path / "urls", tmp_path / "url.joblib")
        assert baseline.call_args.kwargs["kind"] == "url"
    file = tmp_path / "urls/val.csv"
    file.write_text(
        file.read_text().replace("val-legitimate.example", "train-legitimate.example")
    )
    with pytest.raises(ValueError, match="hostname spans splits"):
        load_url_data(tmp_path / "urls")


def test_url_baseline_builds_character_features_without_real_fitting(tmp_path):
    from unittest.mock import MagicMock

    from phishing_detector.text_ml import train as baseline_train

    prepared(tmp_path / "urls", url=True)
    model = MagicMock()
    model.predict.return_value = ["legitimate", "phishing"]

    def write_artifact(_model, path):
        path.write_bytes(b"mock model")

    with (
        patch("sklearn.pipeline.make_pipeline", return_value=model) as factory,
        patch("joblib.dump", side_effect=write_artifact),
    ):
        report = baseline_train(tmp_path / "urls", tmp_path / "url.joblib", kind="url")
    vectorizer = factory.call_args.args[0]
    assert vectorizer.analyzer == "char"
    assert vectorizer.ngram_range == (3, 5)
    assert vectorizer.lowercase is False
    assert report["model_kind"] == "url"
    assert len(model.fit.call_args.args[0]) == 2
    assert all("train-" in value for value in model.fit.call_args.args[0])
