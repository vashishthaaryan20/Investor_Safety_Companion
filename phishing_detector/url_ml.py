 """URL character TF-IDF baseline, trained independently from message text."""

import logging
from pathlib import Path
from urllib.parse import urlsplit

from .datasets import audit_text, clean_records, read_source
from .detectors import Detection, Finding
from .text_ml import load_model


def load_url_data(path):
    path = Path(path)
    records = []
    hosts = {}
    for split in ("train", "val", "test"):
        file = path / f"{split}.csv"
        rows = read_source(
            file,
            {
                "columns": {
                    "text": "url",
                    "label": "label",
                    "group": "group",
                    "split": "split",
                }
            },
        )
        for row in rows:
            parsed = urlsplit(row["text"])
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or any(c.isspace() for c in row["text"])
            ):
                raise ValueError(f"{file}: invalid HTTP(S) URL")
            if row["split"] and row["split"] != split:
                raise ValueError(f"{file}: split column disagrees with filename")
            row["split"] = split
            host = parsed.hostname.lower().rstrip(".")
            if host in hosts and hosts[host] != split:
                raise ValueError(
                    f"URL hostname spans splits: {host}; group related domains before splitting"
                )
            hosts[host] = split
            row["group"] = row["group"] or host
            records.append(row)
    records = clean_records(records)
    return records, audit_text(records)


def train(path, output, overwrite=False):
    from .text_ml import train as train_baseline

    return train_baseline(path, output, overwrite=overwrite, kind="url")


def detect(entities, path=None):
    if not path:
        return Detection("url_ml", "not_configured")
    urls = [e for e in entities if e["type"] in {"url", "domain"}]
    if not urls:
        return Detection("url_ml", "ok", detail="No URLs to classify")
    try:
        model = load_model(path)
        index = list(model.classes_).index("phishing")
        findings = []
        for entity in urls:
            value = entity.get("normalized") or entity["value"]
            if not value.startswith(("http://", "https://")):
                value = "https://" + value
            score = float(model.predict_proba([value])[0][index]) * entity.get(
                "ocr_confidence", 1
            )
            findings.append(
                Finding(
                    "url_ml",
                    score,
                    "URL classifier signal",
                    "The URL model found patterns associated with phishing.",
                    value,
                )
            )
        return Detection("url_ml", findings=findings)
    except Exception:
        logging.getLogger(__name__).exception("Optional URL classifier unavailable")
        return Detection(
            "url_ml", "unavailable", detail="URL model could not be loaded or evaluated"
        )
