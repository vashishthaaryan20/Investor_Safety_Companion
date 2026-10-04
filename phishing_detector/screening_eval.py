"""Evaluate the complete pipeline on a labeled manifest; never fits a model."""

import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from .metrics import LABELS, binary_metrics
from .progress import stage
from .service import analyze_image, analyze_text
from .settings import load_settings


def summarize(rows):
    answered = [row for row in rows if row["level"] != "unknown"]
    truth = [row["label"] for row in answered]
    predicted = [
        "phishing" if row["level"] in {"suspicious", "dangerous"} else "legitimate"
        for row in answered
    ]
    return {
        "samples": len(rows),
        "answered": len(answered),
        "unknown": len(rows) - len(answered),
        "coverage": len(answered) / len(rows) if rows else 0,
        "metrics_on_answered": binary_metrics(truth, predicted) if answered else None,
        "false_positive_ids": [
            r["id"]
            for r, guess in zip(answered, predicted, strict=True)
            if r["label"] == "legitimate" and guess == "phishing"
        ],
        "false_negative_ids": [
            r["id"]
            for r, guess in zip(answered, predicted, strict=True)
            if r["label"] == "phishing" and guess == "legitimate"
        ],
        "unknown_ids": [r["id"] for r in rows if r["level"] == "unknown"],
    }


def evaluate_pipeline(manifest_path, output, split, classify="full"):
    if split not in {"val", "test"}:
        raise ValueError("Evaluation split must be val or test")
    manifest_path, output = Path(manifest_path), Path(output)
    if output.exists():
        raise FileExistsError("Choose a new evaluation report path")
    stage("pipeline-evaluation", 1, 4, "Validate labels, IDs and evidence paths")
    with manifest_path.open(encoding="utf-8-sig", newline="") as stream:
        records = list(csv.DictReader(stream))
    if not records:
        raise ValueError("Evaluation manifest has no records")
    ids, groups, texts, image_paths = set(), {}, {}, {}
    for index, record in enumerate(records, 2):
        if record.get("label") not in LABELS:
            raise ValueError(f"Row {index}: expected legitimate/phishing label")
        record["id"] = record.get("id") or str(index)
        if record["id"] in ids:
            raise ValueError(f"Duplicate evaluation ID: {record['id']}")
        ids.add(record["id"])
        record["split"] = record.get("split") or split
        if record["split"] not in {"train", "val", "test"}:
            raise ValueError("Invalid evaluation split")
        text, image_path = record.get("text", ""), record.get("image_path", "")
        if not text.strip() and not image_path:
            raise ValueError(f"Row {index}: text or image_path is required")
        if image_path:
            target = (manifest_path.parent / image_path).resolve()
            if not target.is_file():
                raise FileNotFoundError(target)
            record["resolved_image"] = str(target)
        for lookup, key in (
            (groups, record.get("group", "")),
            (texts, " ".join(text.split()).casefold()),
            (image_paths, record.get("resolved_image", "")),
        ):
            if key:
                if key in lookup and lookup[key] != record["split"]:
                    raise ValueError(
                        "Evaluation manifest contains evidence or groups shared across splits"
                    )
                lookup[key] = record["split"]
    selected = [r for r in records if r["split"] == split]
    if not selected:
        raise ValueError(f"No records assigned to {split}")
    settings = load_settings()
    stage(
        "pipeline-evaluation",
        2,
        4,
        f"Analyze {len(selected)} {split} records without fitting",
    )
    rows = []
    for index, record in enumerate(selected, 1):
        if record.get("resolved_image"):
            result = analyze_image(
                record["resolved_image"], classify=classify, settings=settings
            )
        else:
            result = analyze_text(record["text"], settings=settings)
        rows.append(
            {
                "id": record["id"],
                "source": record.get("source", ""),
                "label": record["label"],
                "level": result["risk"]["level"],
                "score": result["risk"]["score"],
                "signals": result["signals"],
                "detected_urls": result["detected_urls"],
                "detector_features": {
                    d["name"]: {"score": d["score"], "status": d["status"]}
                    for d in result["detectors"]
                },
                "coverage": result["coverage"],
            }
        )
        if index == 1 or index % 10 == 0 or index == len(selected):
            print(
                f"[pipeline-evaluation] Processed {index}/{len(selected)}", flush=True
            )
    stage(
        "pipeline-evaluation",
        3,
        4,
        "Compute false alarms, missed scams and abstentions",
    )
    report = {
        "split": split,
        "summary": summarize(rows),
        "rows": rows,
        "score_version": "rules-v1-uncalibrated",
        "settings": settings,
        "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    }
    sources = defaultdict(list)
    for row in rows:
        sources[row["source"]].append(row)
    report["by_source"] = {
        source: summarize(members) for source, members in sources.items()
    }
    if split == "val":
        known = [r for r in rows if r["level"] != "unknown"]
        report["validation_threshold_sweep"] = (
            [
                {
                    "threshold": threshold,
                    "metrics": binary_metrics(
                        [r["label"] for r in known],
                        [
                            "phishing" if r["score"] >= threshold else "legitimate"
                            for r in known
                        ],
                    ),
                }
                for threshold in range(5, 101, 5)
            ]
            if known
            else []
        )
        report["threshold_note"] = (
            "Diagnostic only. Keep hard overrides and review separate unknown coverage; no settings changed."
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    stage("pipeline-evaluation", 4, 4, f"Report saved to {output.resolve()}")
    return report["summary"]
