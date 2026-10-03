"""Optional TF-IDF/logistic baseline. Load only trusted local model artifacts."""

import logging
from functools import lru_cache

from .detectors import Detection, Finding


@lru_cache(maxsize=2)
def load_model(path):
    import joblib

    return joblib.load(path)


def detect(text, path=None):
    if not path:
        return Detection("text_ml", "not_configured")
    try:
        model = load_model(path)
        index = list(model.classes_).index("phishing")
        score = float(model.predict_proba([text])[0][index])
        return Detection(
            "text_ml",
            findings=[
                Finding(
                    "text_ml",
                    score,
                    "Text classifier signal",
                    "The trained text model found language associated with phishing.",
                    "TF-IDF + logistic regression",
                )
            ],
        )
    except Exception:
        logging.getLogger(__name__).exception("Optional text classifier unavailable")
        return Detection(
            "text_ml", "unavailable", detail="Model could not be loaded or evaluated"
        )


def train(csv_path, output, overwrite=False, kind="text"):
    if kind not in {"text", "url"}:
        raise ValueError("Unknown model kind")
    import hashlib
    import json
    from pathlib import Path

    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report
    from sklearn.pipeline import make_pipeline

    from .datasets import load_text_data
    from .metrics import binary_metrics
    from .progress import stage

    output = Path(output)
    if output.exists() and not overwrite:
        raise FileExistsError(
            "Choose a new model output path or explicitly pass --overwrite"
        )
    stage(f"{kind}-training", 1, 8, "Load and validate prepared text data")
    if kind == "url":
        from .url_ml import load_url_data

        records, audit = load_url_data(csv_path)
    else:
        records, audit = load_text_data(csv_path)
    parts = {
        split: [r for r in records if r["split"] == split]
        for split in ("train", "val", "test")
    }
    stage(f"{kind}-training", 2, 8, f"Split integrity passed: {audit['counts']}")
    stage(f"{kind}-training", 3, 8, "Build TF-IDF and logistic regression pipeline")
    model = make_pipeline(
        TfidfVectorizer(
            analyzer="char" if kind == "url" else "word",
            ngram_range=(3, 5) if kind == "url" else (1, 2),
            lowercase=kind != "url",
            max_features=50000,
        ),
        LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
    )
    stage(
        f"{kind}-training", 4, 8, f"Fit using {len(parts['train'])} training rows only"
    )
    model.fit([r["text"] for r in parts["train"]], [r["label"] for r in parts["train"]])
    metrics = {}
    for number, split in ((5, "val"), (6, "test")):
        stage(
            f"{kind}-training",
            number,
            8,
            f"Evaluate {split} ({len(parts[split])} rows)",
        )
        truth = [r["label"] for r in parts[split]]
        predictions = list(model.predict([r["text"] for r in parts[split]]))
        metrics[split] = binary_metrics(truth, predictions)
    test_truth = [r["label"] for r in parts["test"]]
    test_predictions = list(model.predict([r["text"] for r in parts["test"]]))
    report = {
        "model_kind": kind,
        "classification": classification_report(
            test_truth, test_predictions, output_dict=True, zero_division=0
        ),
        "confusion_matrix": metrics["test"]["confusion_matrix"],
        "label_order": ["legitimate", "phishing"],
        "train_count": len(parts["train"]),
        "val_count": len(parts["val"]),
        "test_count": len(parts["test"]),
        "metrics": metrics,
        "dataset_audit": audit,
        "dataset_sha256": hashlib.sha256(
            json.dumps(records, sort_keys=True).encode()
        ).hexdigest(),
        "calibration": "Not calibrated; fusion thresholds require separate evaluation",
    }
    stage(f"{kind}-training", 7, 8, f"Save model and metrics to {output.resolve()}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    try:
        joblib.dump(model, temporary)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    Path(str(output) + ".metrics.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    load_model.cache_clear()
    stage(
        f"{kind}-training",
        8,
        8,
        f"Finished; activate with {kind.upper()}_MODEL_PATH and restart the API",
    )
    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("output")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    print(train(args.csv_path, args.output, overwrite=args.overwrite))
