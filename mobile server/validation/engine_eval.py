"""Full-pipeline evaluation on labelled messages (pasted-text path, same code as the API).

    python validation/engine_eval.py --split val --policy text_ml=0.8,url_ml=0.8
    python validation/engine_eval.py --split test --report validation/engine_eval.json

A message counts as flagged when the risk category is MEDIUM or HIGH. Both the flagged and
the HIGH-only confusion matrices are reported, plus the hand-written in-domain cases in
cases.json. Choose policies on --split val; report --split test once, after choosing.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
SRC = BACKEND.parent
sys.path[:0] = [str(BACKEND), str(SRC)]
os.environ.setdefault("DETECTION_CONFIG", str(SRC / "detection.local.json"))
DATA = SRC.parent / "data" / "prepared" / "phishing_messages_v1"


def _metrics(truth: list[int], flagged: list[int]) -> dict:
    tp = sum(t and f for t, f in zip(truth, flagged))
    fp = sum(f and not t for t, f in zip(truth, flagged))
    fn = sum(t and not f for t, f in zip(truth, flagged))
    tn = len(truth) - tp - fp - fn
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0,
        "false_positive_rate": round(fp / (fp + tn), 4) if fp + tn else 0.0,
        "confusion_matrix": [[tn, fp], [fn, tp]],
    }


def run(rows: list[dict]) -> dict:
    from engine_adapter import analyze_pasted_text

    categories, truth, times, statuses = [], [], [], Counter()
    for row in rows:
        started = time.perf_counter()
        result = analyze_pasted_text(row["text"], "evaluation", "investment")
        times.append((time.perf_counter() - started) * 1000)
        categories.append(result["risk"]["category"])
        statuses[result["analysis_status"]] += 1
        truth.append(int(row["label"] in {"phishing", "scam"}))
    by_label = {
        label: dict(Counter(c for c, t in zip(categories, truth) if t == value))
        for label, value in (("legitimate", 0), ("phishing", 1))
    }
    times.sort()
    return {
        "count": len(rows),
        "flagged_medium_or_high": _metrics(truth, [int(c in {"MEDIUM", "HIGH"}) for c in categories]),
        "high_only": _metrics(truth, [int(c == "HIGH") for c in categories]),
        "categories_by_label": by_label,
        "analysis_status": dict(statuses),
        "latency_ms": {
            "mean": round(sum(times) / len(times), 2),
            "p50": round(times[len(times) // 2], 2),
            "p95": round(times[int(len(times) * 0.95)], 2),
        },
    }


def cases() -> list[dict]:
    from engine_adapter import analyze_pasted_text

    out = []
    for case in json.loads((HERE / "cases.json").read_text(encoding="utf-8"))["cases"]:
        # Unreadable cases test blurred screenshots; their text alone is readable.
        if not case.get("text") or case["label"] == "unreadable":
            continue
        result = analyze_pasted_text(case["text"], "evaluation", "investment")
        out.append(
            {
                "id": case["id"],
                "label": case["label"],
                "category": result["risk"]["category"],
                "level": result["risk"]["level"],
                "score": result["risk"]["score"],
                "models": {
                    d["name"]: d["tier"] for d in result["detectors"] if d["model_score"] is not None
                },
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("val", "test"), default="val")
    parser.add_argument("--policy", default="", help="fusion weight overrides, e.g. text_ml=1,url_ml=1")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    from phishing_detector import fusion

    for item in filter(None, args.policy.split(",")):
        name, weight = item.split("=")
        fusion.WEIGHTS[name.strip()] = float(weight)
    with open(DATA / f"{args.split}.csv", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    report = {
        "split": args.split,
        "fusion_weights": {k: fusion.WEIGHTS[k] for k in ("text_ml", "url_ml", "image_classifier")},
        "messages": run(rows),
        "in_domain_cases": cases(),
    }
    in_domain = report["in_domain_cases"]
    report["in_domain_summary"] = {
        label: dict(Counter(c["category"] for c in in_domain if c["label"] == label))
        for label in sorted({c["label"] for c in in_domain})
    }
    text = json.dumps(report, indent=2)
    if args.report:
        args.report.write_text(text + "\n", encoding="utf-8")
    summary = {k: v for k, v in report.items() if k != "in_domain_cases"}
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
