"""evaluate.py - test the already-saved model without retraining.

Run from src/:   python -m phishing-detector.cli eval
Uses the test split; falls back to val if there is no test split.
"""
import time

import torch

from . import storage
from .config import CLASS_NAMES, device
from .data import get_data_loaders, get_test_loader
from .model import load_trained_model
from .utils import fmt_time


def main():
    print(f"[eval] Device: {device}")
    loader = get_test_loader()
    split = "test"
    if loader is None:
        print("[eval] No test split found, using validation split instead.")
        _, loader, _ = get_data_loaders()
        split = "val"

    model = load_trained_model()  # weights come from S3_MODEL_KEY (cached in .cache/)
    n_classes = len(CLASS_NAMES)
    confusion = [[0] * n_classes for _ in range(n_classes)]  # confusion[true][pred]

    n_batches = len(loader)
    start = time.time()
    print(f"[eval] Running on {split} split ({n_batches} batches)...")
    with torch.no_grad():
        for i, (images, labels) in enumerate(loader, 1):
            preds = model(images.to(device)).argmax(dim=1).cpu()
            for t, p in zip(labels, preds):
                confusion[int(t)][int(p)] += 1
            if i == 1 or i % 10 == 0 or i == n_batches:
                print(f"  batch {i}/{n_batches} | elapsed {fmt_time(time.time() - start)}")

    total = sum(sum(r) for r in confusion)
    correct = sum(confusion[i][i] for i in range(n_classes))
    print("\n" + "=" * 50)
    print(f"Accuracy on {split}: {100 * correct / total:.2f}%  ({correct}/{total})")
    print("\nConfusion matrix (rows = true, cols = predicted):")
    print(" " * 14 + "".join(f"{c:>14}" for c in CLASS_NAMES))
    for i, row in enumerate(confusion):
        print(f"{CLASS_NAMES[i]:>14}" + "".join(f"{v:>14}" for v in row))

    print("\nPer-class metrics:")
    per_class = {}
    for i, name in enumerate(CLASS_NAMES):
        tp = confusion[i][i]
        fp = sum(confusion[r][i] for r in range(n_classes)) - tp
        fn = sum(confusion[i]) - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        per_class[name] = {"precision": 100 * precision, "recall": 100 * recall}
        print(f"  {name:>12}: precision {100 * precision:.2f}% | recall {100 * recall:.2f}%")
    print("=" * 50)

    storage.save_results(f"eval_{split}", {
        "split": split, "accuracy": 100 * correct / total, "correct": correct, "total": total,
        "classes": CLASS_NAMES, "confusion": confusion, "per_class": per_class,
    })  # -> S3_RESULTS_PREFIX
