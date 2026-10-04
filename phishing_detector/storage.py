"""storage.py - everything that talks to AWS S3 (weights, dataset, results).

Code lives on GitHub; data / models / results live in S3. Locations are set in config.py
and credentials come from src/.env. If the bucket is not filled in yet, S3 is skipped and
the code falls back to whatever is already in the local .cache/ folder.
"""
import json
from pathlib import Path

from . import config


def s3_enabled() -> bool:
    return not config.S3_BUCKET.startswith("<")


def _client():
    import boto3  # imported lazily so the package works without boto3 when S3 is unused
    return boto3.client("s3")  # credentials/region come from src/.env via config.py


def _need_s3(what):
    if not s3_enabled():
        raise FileNotFoundError(
            f"{what} not found locally and S3 is not configured. "
            "Fill in S3_BUCKET and the S3_* paths in config.py (or src/.env)."
        )


def download_file(key, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"[s3] Downloading s3://{config.S3_BUCKET}/{key} -> {dest}")
    _client().download_file(config.S3_BUCKET, key, str(dest))
    return dest


def upload_file(src, key):
    print(f"[s3] Uploading {src} -> s3://{config.S3_BUCKET}/{key}")
    _client().upload_file(str(src), config.S3_BUCKET, key)


def download_prefix(prefix, dest_dir):
    """Download every object under `prefix` into dest_dir, keeping the sub-folder layout."""
    dest_dir = Path(dest_dir)
    client = _client()
    count = 0
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=config.S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/"):
                continue
            target = dest_dir / key[len(prefix):].lstrip("/")
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(config.S3_BUCKET, key, str(target))
            count += 1
    print(f"[s3] Downloaded {count} new files from s3://{config.S3_BUCKET}/{prefix}")


# ------------------------------------------------------------ high-level helpers
def ensure_model(refresh=False) -> Path:
    """Return the local path of the trained weights, downloading them from S3 if needed.
    refresh=True re-downloads even if a cached copy exists (use after retraining)."""
    if config.MODEL_PATH.exists() and not refresh:
        return config.MODEL_PATH
    _need_s3(f"Trained weights ({config.MODEL_PATH})")
    return download_file(config.S3_MODEL_KEY, config.MODEL_PATH)


def ensure_dataset() -> Path:
    """Make sure train/ val/ (and test/) exist locally; pull them from S3 if not."""
    if not (config.DATA_DIR / "train").exists():
        _need_s3(f"Dataset ({config.DATA_DIR})")
        download_prefix(config.S3_DATA_PREFIX, config.DATA_DIR)
    return config.DATA_DIR


def upload_model():
    """Push freshly trained weights to S3.
    NOTE: this overwrites S3_MODEL_KEY. If you want to keep older models, give the key a
    version/date in config.py (e.g. ".../model_2026-10-01.pth")."""
    if not s3_enabled():
        print("[s3] Not configured - weights kept locally only.")
        return
    upload_file(config.MODEL_PATH, config.S3_MODEL_KEY)


def save_results(name, data: dict):
    """Write results/<name>.json locally and upload it to S3_RESULTS_PREFIX."""
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = config.RESULTS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"[results] Saved {path}")
    if s3_enabled():
        upload_file(path, f"{config.S3_RESULTS_PREFIX.rstrip('/')}/{name}.json")
