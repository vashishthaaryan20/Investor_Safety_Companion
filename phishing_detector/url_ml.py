"""URL character TF-IDF baseline, trained independently from message text."""

import logging
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from . import artifacts
from .datasets import audit_text, clean_records, read_source
from .detectors import Detection, Finding, belongs, hostname
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


TIER_TEXT = {
    "medium": "The trained URL model found a link pattern similar to known phishing links.",
    "high": "The trained URL model found a link pattern strongly similar to known phishing links.",
}


def as_url(value):
    """Full http(s) URL with a lowercase scheme and host, as in the training data."""
    value = value.strip()
    if urlsplit(value).scheme.lower() not in {"http", "https"}:
        value = "https://" + value
    try:
        parts = urlsplit(value)
        return urlunsplit(parts._replace(scheme=parts.scheme.lower(), netloc=parts.netloc.lower()))
    except ValueError:
        return value


def detect(entities, path=None, official=()):
    """Official domains are skipped: the model has not learned which hosts are genuine."""
    if not path:
        return Detection("url_ml", "not_configured")
    path = Path(path)
    if not path.is_file():
        return Detection("url_ml", "unavailable", detail="URL model file not found")
    thresholds = artifacts.thresholds_for("url", path)
    if thresholds is None:
        return Detection(
            "url_ml", "unavailable", detail="No validated thresholds for this URL model file"
        )
    urls = []
    for e in entities:
        if e["type"] not in {"url", "domain"}:
            continue
        value = (e.get("normalized") or e["value"] or "").strip()
        host = hostname(value)
        if host and not any(belongs(host, d) for d in official):
            urls.append((e, as_url(value)))
    if not urls:
        return Detection("url_ml", "ok", detail="No unverified URLs to classify")
    try:
        model = load_model(str(path))
        index = list(model.classes_).index("phishing")
        scores = model.predict_proba([value for _, value in urls])[:, index]
        detection = Detection("url_ml", model_score=round(float(max(scores)), 4))
        for (entity, value), score in zip(urls, scores):
            level = artifacts.tier(float(score), thresholds)
            if not level:
                continue
            if detection.tier != "high":
                detection.tier = level
            read = entity.get("ocr_confidence")
            detection.findings.append(
                Finding(
                    "url_ml",
                    artifacts.TIER_SCORES[level] * (1 if read is None else read),
                    "URL classifier signal",
                    TIER_TEXT[level],
                    value,
                )
            )
        return detection
    except Exception:
        logging.getLogger(__name__).exception("URL classifier failed")
        return Detection(
            "url_ml", "unavailable", detail="URL model could not be loaded or evaluated"
        )
