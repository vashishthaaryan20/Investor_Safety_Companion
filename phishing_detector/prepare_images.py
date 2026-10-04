"""Prepare an image dataset without modifying originals or training a model."""

import argparse
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

from .datasets import audit_images
from .progress import stage

LABELS = ("legitimate", "phishing")
SPLITS = ("train", "val", "test")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".avif"}
PRIORITY = {"test": 0, "val": 1, "train": 2}


def decode(path):
    with Image.open(path) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("Image exceeds 20 million pixels")
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError("Multi-frame image requires manual frame selection")
        image = image.convert("RGB")
        image.load()
    digest = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
    return image, digest


def prepare_images(source, output):
    """Preserve split assignments; retain held-out copies ahead of training copies."""
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_dir():
        raise ValueError(f"Image source directory does not exist: {source}")
    if (
        output == source
        or output.is_relative_to(source)
        or source.is_relative_to(output)
    ):
        raise ValueError("Source and output must be separate, non-nested directories")
    if output.exists():
        raise FileExistsError(
            "Choose a new output directory; existing output is never overwritten"
        )
    for split in SPLITS:
        folder = source / split
        if not folder.is_dir():
            raise ValueError(
                f"Missing split: {folder}; provide reviewed train/val/test splits"
            )
        if {p.name for p in folder.iterdir() if p.is_dir()} != set(LABELS):
            raise ValueError(
                f"{folder}: expected only legitimate and phishing class folders"
            )

    stage("prepare-images", 1, 5, "Scan source files and decode screenshots")
    records, groups = [], defaultdict(list)
    for split in SPLITS:
        for label in LABELS:
            for path in sorted((source / split / label).rglob("*")):
                if not path.is_file():
                    continue
                if not path.resolve().is_relative_to(source):
                    raise ValueError(f"Source link escapes dataset directory: {path}")
                record = {
                    "source": path.relative_to(source).as_posix(),
                    "split": split,
                    "label": label,
                }
                if path.suffix.lower() not in EXTENSIONS:
                    record.update(status="ignored", reason="Unsupported extension")
                else:
                    try:
                        _, digest = decode(path)
                        record.update(digest=digest, status="pending")
                        groups[digest].append(record)
                    except (OSError, ValueError, Image.DecompressionBombError) as exc:
                        record.update(
                            status="quarantined",
                            reason=f"Decode failed: {type(exc).__name__}: {exc}",
                        )
                records.append(record)
                if len(records) % 250 == 0:
                    stage("prepare-images", 1, 5, f"Scanned {len(records)} files")

    stage(
        "prepare-images",
        2,
        5,
        "Resolve exact duplicates and quarantine label conflicts",
    )
    for digest, members in groups.items():
        if len({r["label"] for r in members}) > 1:
            for record in members:
                record.update(
                    status="quarantined",
                    reason="Identical pixels have conflicting labels",
                )
        else:
            members.sort(key=lambda r: (PRIORITY[r["split"]], r["source"]))
            kept = members[0]
            kept.update(
                status="kept",
                destination=f"image/{kept['split']}/{kept['label']}/{digest}.png",
            )
            for record in members[1:]:
                record.update(
                    status="duplicate",
                    reason="Exact duplicate",
                    retained_source=kept["source"],
                )

    stage("prepare-images", 3, 5, "Write normalized RGB PNGs and quarantine copies")
    output.mkdir(parents=True)
    marker = output / "PREPARATION_INCOMPLETE"
    marker.write_text(
        "Do not train until preparation completes and report passes.\n",
        encoding="utf-8",
    )
    for split in SPLITS:
        for label in LABELS:
            (output / "image" / split / label).mkdir(parents=True)
    try:
        written = 0
        for record in records:
            path = source / record["source"]
            if record["status"] == "kept":
                image, digest = decode(path)
                if digest != record["digest"]:
                    raise ValueError(f"Source changed during preparation: {path}")
                image.save(output / record["destination"], format="PNG")
                written += 1
                if written % 250 == 0:
                    stage("prepare-images", 3, 5, f"Wrote {written} unique images")
            elif record["status"] == "quarantined":
                destination = output / "quarantine" / record["source"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)
                record["destination"] = destination.relative_to(output).as_posix()
        stage(
            "prepare-images",
            4,
            5,
            "Audit prepared images for readability and exact leakage",
        )
        audit = audit_images(output / "image")
        report = {
            "status": audit["status"],
            "source": str(source),
            "image_dir": str(output / "image"),
            "counts": dict(Counter(r["status"] for r in records)),
            "audit": audit,
            "split_policy": "Original splits preserved; exact duplicates retain test, then val, then train copies",
            "limitations": [
                "Labels require human review; conflicts are excluded rather than guessed.",
                "Exact pixels only: related domains, campaigns and near-duplicate screenshots need manual grouping/review.",
                "Existing test data already used during model development is not a new untouched benchmark.",
            ],
        }
        with (output / "manifest.jsonl").open("w", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record) + "\n")
        (output / "preparation-report.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
        if audit["errors"]:
            raise ValueError(
                "Prepared dataset failed audit; inspect preparation-report.json; do not train"
            )
        marker.unlink()
        (output / "PREPARATION_COMPLETE").write_text(
            "Automatic image checks passed; review report limitations before training.\n",
            encoding="utf-8",
        )
        stage(
            "prepare-images",
            5,
            5,
            f"Complete: {report['counts']}; dataset: {output / 'image'}; no training started",
        )
        return report
    except Exception as exc:
        # Partial output remains for inspection; rerun with a new output directory.
        marker.write_text(
            f"Preparation failed: {type(exc).__name__}: {exc}\nDo not train on this output.\n",
            encoding="utf-8",
        )
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Folder containing train/val/test class folders")
    parser.add_argument("output", help="New preparation directory")
    args = parser.parse_args(argv)
    prepare_images(args.source, args.output)


if __name__ == "__main__":
    main()
