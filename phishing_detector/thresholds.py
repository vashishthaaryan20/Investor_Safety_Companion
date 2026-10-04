"""Choose model decision thresholds on validation data and measure them on held-out test data.

    python -m phishing_detector.thresholds choose     # val split -> model_thresholds.json
    python -m phishing_detector.thresholds evaluate   # test split -> report (thresholds unchanged)

medium: the threshold with the best F1 on the validation split (missed scams and false
        alarms weigh the same).
high:   the lowest threshold whose validation precision is at least HIGH_PRECISION.
The test split is never used to pick anything.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

from . import artifacts
from .metrics import binary_metrics

DATA_DIR = artifacts.SRC_DIR.parent / "data" / "prepared"
SOURCES = {
    "text": DATA_DIR / "phishing_messages_v1",
    "url": DATA_DIR / "phishing_urls_v1",
    "image": DATA_DIR / "phishing_images_v1",
}
HIGH_PRECISION = 0.98


def _records(kind):
    if kind == "text":
        from .datasets import load_text_data

        return load_text_data(SOURCES["text"])[0]
    if kind == "url":
        from .url_ml import load_url_data

        return load_url_data(SOURCES["url"])[0]
    # The ImageFolder layout training reads (image/<split>/<label>/*); manifest.jsonl can be stale.
    root = SOURCES["image"] / "image"
    return [
        {"path": path, "label": label, "split": split}
        for split in ("train", "val", "test")
        for label in ("legitimate", "phishing")
        for path in sorted((root / split / label).glob("*"))
        if path.is_file()
    ]


def _dataset_check(kind, records):
    """Compare with the hash the training run recorded, so 'test' means the same rows."""
    metrics_file = Path(str(artifacts.model_path(kind)) + ".metrics.json")
    recorded = json.loads(metrics_file.read_text(encoding="utf-8")).get("dataset_sha256") if metrics_file.is_file() else None
    if kind == "image":
        recorded_counts = json.loads(metrics_file.read_text(encoding="utf-8")).get("dataset_audit", {}).get("counts")
        local_counts = {
            split: {label: sum(1 for r in records if r["split"] == split and r["label"] == label) for label in ("legitimate", "phishing")}
            for split in ("train", "val", "test")
        }
        return {"recorded_counts": recorded_counts, "local_counts": local_counts,
                "matches_training_data": recorded_counts == local_counts,
                "note": "The image run records split counts, not a content hash."}
    local = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
    return {"recorded_sha256": recorded, "local_sha256": local, "matches_training_data": local == recorded}


def _scores(kind, rows):
    path = artifacts.model_path(kind)
    started = time.perf_counter()
    if kind == "image":
        from PIL import Image

        from .model import load_trained_model, predict_image

        model = load_trained_model(str(path))
        scores = []
        for row in rows:
            with Image.open(row["path"]) as image:
                scores.append(predict_image(model, image)[2]["phishing"] / 100)
    else:
        import joblib

        model = joblib.load(path)
        index = list(model.classes_).index("phishing")
        scores = [float(p[index]) for p in model.predict_proba([r["text"] for r in rows])]
    per_item_ms = (time.perf_counter() - started) * 1000 / max(1, len(rows))
    return scores, round(per_item_ms, 3)


def _at(threshold, truth, scores):
    return binary_metrics(truth, ["phishing" if s >= threshold else "legitimate" for s in scores])


def choose_thresholds(truth, scores):
    pairs = sorted(zip(scores, truth, strict=True), reverse=True)
    positives = sum(1 for t in truth if t == "phishing")
    best_f1, medium, high = -1.0, 0.5, None
    tp = fp = 0
    for index, (score, label) in enumerate(pairs):
        tp += label == "phishing"
        fp += label != "phishing"
        if index + 1 < len(pairs) and pairs[index + 1][0] == score:
            continue  # evaluate once per distinct score
        precision, recall = tp / (tp + fp), tp / positives if positives else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        if f1 > best_f1:
            best_f1, medium = f1, score
        if precision >= HIGH_PRECISION:
            high = score  # keeps moving down while precision holds
    if high is None or high < medium:
        high = max(medium, high or 1.01)
    return round(medium, 6), round(high, 6)


def choose(kinds):
    output = artifacts.load_thresholds()
    for kind in kinds:
        records = _records(kind)
        val = [r for r in records if r["split"] == "val"]
        scores, ms = _scores(kind, val)
        truth = [r["label"] for r in val]
        medium, high = choose_thresholds(truth, scores)
        output[kind] = {
            "model_file": artifacts.model_path(kind).name,
            "model_sha256": artifacts.file_sha256(artifacts.model_path(kind)),
            "medium": medium,
            "high": high,
            "chosen_on": f"validation split ({len(val)} rows)",
            "rule": f"medium = best validation F1; high = lowest threshold with validation precision >= {HIGH_PRECISION}"
            + ("" if high <= 1 else " (not reached, so this model has no high tier)"),
            "validation": {"at_medium": _at(medium, truth, scores), "at_high": _at(high, truth, scores) if high <= 1 else None},
            "dataset": _dataset_check(kind, records),
            "scores_are_calibrated": False,
        }
        print(f"[thresholds] {kind}: medium={medium} high={high} ({ms} ms/item)", flush=True)
    artifacts.THRESHOLDS_PATH.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    return output


def evaluate(kinds, report_path):
    report = {}
    for kind in kinds:
        thresholds = artifacts.thresholds_for(kind, artifacts.model_path(kind))
        if thresholds is None:
            raise SystemExit(f"No validated thresholds for the current {kind} model; run choose first")
        records = _records(kind)
        test = [r for r in records if r["split"] == "test"]
        scores, ms = _scores(kind, test)
        truth = [r["label"] for r in test]
        medium, high = thresholds
        report[kind] = {
            "test_rows": len(test),
            "thresholds": {"medium": medium, "high": high},
            "at_default_0_5": _at(0.5, truth, scores),
            "at_medium": _at(medium, truth, scores),
            "at_high": _at(high, truth, scores) if high <= 1 else None,
            "mean_inference_ms_per_item": ms,
            "dataset": _dataset_check(kind, records),
        }
        print(f"[thresholds] {kind} test: {json.dumps(report[kind]['at_medium'])}", flush=True)
    Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["choose", "evaluate"])
    parser.add_argument("--kinds", nargs="+", default=["text", "url", "image"], choices=["text", "url", "image"])
    parser.add_argument("--report", default=str(artifacts.SRC_DIR / "mobile server" / "validation" / "model_test_metrics.json"))
    args = parser.parse_args(argv)
    if args.command == "choose":
        choose(args.kinds)
    else:
        evaluate(args.kinds, args.report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
