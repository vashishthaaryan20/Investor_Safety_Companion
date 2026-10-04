"""Read mapped source files, validate canonical rows and preserve split boundaries."""

import csv
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from .progress import stage

LABELS = {"legitimate", "phishing"}
SPLITS = ("train", "val", "test")
COLUMNS = ("text", "label", "group", "split", "source")


def text_key(text):
    return hashlib.sha256(" ".join(text.split()).casefold().encode("utf-8")).hexdigest()


def read_source(path, spec=None):
    path, spec = Path(path), spec or {}
    columns = spec.get(
        "columns",
        {"text": "text", "label": "label", "group": "group", "split": "split"},
    )
    if not isinstance(columns, dict):
        raise TypeError(
            "columns must be an object mapping canonical names to source names"
        )
    if not {"text", "label"} <= set(columns):
        raise ValueError(f"{path}: column mapping requires text and label")
    label_map = spec.get("labels", {})
    if not isinstance(label_map, dict):
        raise TypeError("labels must be an explicit mapping")
    with path.open(encoding="utf-8-sig", newline="") as stream:
        if path.suffix.lower() == ".jsonl":
            raw_rows = [json.loads(line) for line in stream if line.strip()]
        elif path.suffix.lower() in {".csv", ".tsv"}:
            raw_rows = list(
                csv.DictReader(
                    stream,
                    delimiter=spec.get(
                        "delimiter", "\t" if path.suffix.lower() == ".tsv" else ","
                    ),
                )
            )
        else:
            raise ValueError(
                f"{path}: supported source formats are CSV, TSV and JSONL; export spreadsheets first"
            )
    if not raw_rows:
        raise ValueError(f"{path}: no records")
    records = []
    for index, raw in enumerate(raw_rows, 2):
        if not isinstance(raw, dict):
            raise TypeError(f"{path}:{index}: expected an object/row")
        for required in ("text", "label"):
            if columns[required] not in raw:
                raise ValueError(
                    f"{path}:{index}: missing column {columns[required]!r}"
                )
        text, label = raw[columns["text"]], raw[columns["label"]]
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{path}:{index}: text must be a nonempty string")
        label = label_map.get(str(label), str(label))
        if label not in LABELS:
            raise ValueError(
                f"{path}:{index}: label {label!r} needs an explicit legitimate/phishing mapping"
            )
        group = raw.get(columns.get("group", "group"), "") or ""
        split = raw.get(columns.get("split", "split"), spec.get("split", "")) or ""
        if split and split not in SPLITS:
            raise ValueError(f"{path}:{index}: split must be train, val or test")
        records.append(
            {
                "text": text.strip(),
                "label": label,
                "group": str(spec.get("group_prefix", "")) + str(group)
                if group
                else "",
                "split": str(split),
                "source": str(raw.get("source") or spec.get("source") or path.name),
            }
        )
    return records


def clean_records(records):
    """Remove same-split duplicates; reject conflicts and merge duplicate campaign groups."""
    unique, parent = {}, {}

    def find(key):
        parent.setdefault(key, key)
        trail, current = [], key
        while parent[current] != current:
            trail.append(current)
            current = parent[current]
        for node in trail:
            parent[node] = current
        return current

    for record in records:
        key = text_key(record["text"])
        node = "text:" + key
        if record["group"]:
            parent[find("group:" + record["group"])] = find(node)
        previous = unique.get(key)
        if previous:
            if previous["label"] != record["label"]:
                raise ValueError("Conflicting labels for duplicate text")
            if previous["split"] != record["split"]:
                raise ValueError(
                    "Duplicate text appears in different splits (or mixes assigned/unassigned splits)"
                )
        else:
            unique[key] = dict(record)
    output = []
    for key, record in unique.items():
        record["group"] = find("text:" + key)
        output.append(record)
    return output


def assign_splits(records, seed=42):
    assigned = [bool(r["split"]) for r in records]
    if any(assigned):
        if not all(assigned):
            raise ValueError(
                "Provide a split for every record, or leave all splits unassigned"
            )
        return records
    grouped = defaultdict(list)
    for record in records:
        grouped[record["group"]].append(record)
    by_label = defaultdict(list)
    for group, members in grouped.items():
        labels = {r["label"] for r in members}
        by_label[next(iter(labels)) if len(labels) == 1 else "mixed"].append(group)
    rng = random.Random(seed)
    if "mixed" in by_label:
        buckets = [sorted(grouped)]
    else:
        buckets = [sorted(by_label[label]) for label in sorted(LABELS)]
    for groups in buckets:
        if len(groups) < 3:
            raise ValueError(
                "Need at least three independent groups per class, or manually assigned splits"
            )
        rng.shuffle(groups)
        val_count = test_count = max(1, round(len(groups) * 0.15))
        train_end, val_end = (
            len(groups) - val_count - test_count,
            len(groups) - test_count,
        )
        for index, group in enumerate(groups):
            split = (
                "train" if index < train_end else "val" if index < val_end else "test"
            )
            for record in grouped[group]:
                record["split"] = split
    return records


def audit_text(records, require_splits=True):
    if not records:
        raise ValueError("No text records")
    text_splits, group_splits = {}, {}
    counts = {split: Counter() for split in SPLITS}
    for record in records:
        if record["label"] not in LABELS or not record["text"].strip():
            raise ValueError("Invalid text/label")
        split = record["split"]
        if require_splits and split not in SPLITS:
            raise ValueError("Prepared data must have train/val/test assignments")
        for lookup, key in (
            (text_splits, text_key(record["text"])),
            (group_splits, record["group"] or text_key(record["text"])),
        ):
            if key in lookup and lookup[key] != split:
                raise ValueError("Text or campaign group overlaps between splits")
            lookup[key] = split
        if split in counts:
            counts[split][record["label"]] += 1
    if require_splits and any(
        not counts[split][label] for split in SPLITS for label in LABELS
    ):
        raise ValueError(
            "Each split must contain both labels; review grouped split assignments"
        )
    return {
        "rows": len(records),
        "counts": {s: dict(counts[s]) for s in SPLITS},
        "groups": len(group_splits),
        "status": "passed",
        "limitations": "Exact normalized duplicates and supplied groups checked; near-duplicate templates require review",
    }


def load_text_data(path, seed=42):
    path = Path(path)
    paths = sorted(path.glob("*.csv")) if path.is_dir() else [path]
    if not paths:
        raise ValueError(f"{path}: no CSV files")
    records = clean_records([r for file in paths for r in read_source(file)])
    records = assign_splits(records, seed)
    return records, audit_text(records)


def prepare_text(manifest_path, output_dir, seed=42):
    manifest_path, output_dir = Path(manifest_path), Path(output_dir)
    stage("prepare-text", 1, 4, "Read source mappings")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources = manifest.get("sources", [])
    if not sources:
        raise ValueError("Manifest needs a nonempty sources list")
    records = []
    for spec in sources:
        path = manifest_path.parent / spec["path"]
        records.extend(read_source(path, spec))
    stage("prepare-text", 2, 4, f"Validate and deduplicate {len(records)} source rows")
    source_count = len(records)
    records = clean_records(records)
    stage(
        "prepare-text",
        3,
        4,
        "Assign or verify campaign-separated train/val/test splits",
    )
    records = assign_splits(records, seed)
    report = audit_text(records)
    report.update(
        source_rows=source_count,
        duplicates_removed=source_count - len(records),
        seed=seed,
    )
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(
            "Use a new or empty output directory; prepared data is never silently overwritten"
        )
    output_dir.mkdir(parents=True, exist_ok=True)
    for split in SPLITS:
        with (output_dir / f"{split}.csv").open(
            "w", encoding="utf-8", newline=""
        ) as stream:
            writer = csv.DictWriter(stream, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows(r for r in records if r["split"] == split)
    (output_dir / "dataset-report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    stage(
        "prepare-text",
        4,
        4,
        f"Prepared data saved to {output_dir.resolve()}; no model trained",
    )
    return report


def audit_images(path, decode=True):
    """Check classes, unreadable images and exact duplicate leakage without training."""
    from PIL import Image

    path = Path(path)
    extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".avif"}
    Image.init()
    counts, errors, warnings, hashes = {}, [], [], {}
    seen = 0
    for split in SPLITS:
        folder = path / split
        if not folder.is_dir():
            if split == "test":
                warnings.append(
                    "No test split; separate final evaluation data is required"
                )
                continue
            errors.append(f"Missing split: {folder}")
            continue
        classes = {d.name for d in folder.iterdir() if d.is_dir()}
        if classes != LABELS:
            errors.append(
                f"{split}: expected only legitimate and phishing class folders, got {sorted(classes)}"
            )
        counts[split] = {}
        for label in sorted(LABELS):
            files = sorted(
                p
                for p in (folder / label).rglob("*")
                if p.is_file() and p.suffix.lower() in extensions
            )
            counts[split][label] = len(files)
            if not files:
                errors.append(f"{split}/{label}: no images")
            for file in files:
                seen += 1
                if not decode:
                    continue
                try:
                    with Image.open(file) as image:
                        if image.width * image.height > 20_000_000:
                            raise ValueError("exceeds 20 million pixels")
                        image = image.convert("RGB")
                        digest = hashlib.sha256(
                            str(image.size).encode() + image.tobytes()
                        ).hexdigest()
                    previous = hashes.get(digest)
                    if previous and (previous[0] != split or previous[1] != label):
                        errors.append(
                            f"Duplicate pixels across splits/labels: {previous[2]} and {file}"
                        )
                    elif previous:
                        warnings.append(
                            f"Duplicate image within {split}/{label}: {file}"
                        )
                    else:
                        hashes[digest] = (split, label, str(file))
                except (OSError, ValueError, Image.DecompressionBombError) as exc:
                    errors.append(f"Unreadable image: {file} ({type(exc).__name__})")
                if seen % 250 == 0:
                    stage("image-preflight", 1, 1, f"Checked {seen} images")
    return {
        "status": "failed" if errors else "passed" if decode else "structure_only",
        "counts": counts,
        "errors": errors,
        "warnings": warnings,
        "decoded": decode,
        "images": seen,
        "limitations": "Exact decoded pixels checked; campaign/near-duplicate separation still needs review",
    }
