"""Trained model locations and the decision thresholds chosen on their validation splits.

A model is used from <KIND>_MODEL_PATH when that is set, otherwise from the submission's
models/training-v1 folder (SANGYAN_MODELS_DIR overrides the folder). Thresholds live in
model_thresholds.json beside this file and record the SHA-256 of the model they were chosen
for, so a retrained model is never used with another model's thresholds.
"""

import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SRC_DIR / ".env")
MODELS_DIR = (
    Path(os.getenv("SANGYAN_MODELS_DIR") or SRC_DIR.parent / "models" / "training-v1")
    .expanduser()
    .resolve()
)
FILES = {"text": "text.joblib", "url": "url.joblib", "image": "image.pth"}
THRESHOLDS_PATH = Path(__file__).with_name("model_thresholds.json")


def model_path(kind):
    """Configured location of a model; it may not exist."""
    configured = os.getenv(f"{kind.upper()}_MODEL_PATH")
    path = Path(configured).expanduser() if configured else MODELS_DIR / FILES[kind]
    return path.resolve()


@lru_cache(maxsize=8)
def _sha256(path, size, mtime):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def file_sha256(path):
    stat = Path(path).stat()
    return _sha256(str(path), stat.st_size, stat.st_mtime_ns)


def load_thresholds():
    try:
        return json.loads(THRESHOLDS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def thresholds_for(kind, path):
    """(medium, high) for this exact model file, or None when none were validated for it."""
    entry = load_thresholds().get(kind)
    if not entry or entry.get("model_sha256") != file_sha256(path):
        return None
    return float(entry["medium"]), float(entry["high"])


# Evidence strength handed to fusion for each threshold tier. The tiers, not the raw model
# scores, decide the level: raw scores are not calibrated probabilities.
TIER_SCORES = {"medium": 0.45, "high": 0.75}


def tier(score, thresholds):
    medium, high = thresholds
    return "high" if score >= high else "medium" if score >= medium else None
