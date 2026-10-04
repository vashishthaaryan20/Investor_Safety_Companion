"""Image training with preflight validation, explicit stages and local checkpoints.

Run from src/: python -m phishing_detector.cli train --output ../models/image-v2.pth
Existing checkpoints require --overwrite; remote uploads require --upload.
"""

import math
import time
from pathlib import Path

import torch
from torch import nn
from torch.optim import Adam

from . import storage
from .config import (
    BATCH_SIZE,
    CLASS_NAMES,
    DATA_DIR,
    EPOCHS,
    LEARNING_RATE,
    LOG_EVERY,
    MODEL_PATH,
    device,
)
from .data import get_data_loaders, get_test_loader
from .datasets import audit_images
from .metrics import binary_metrics
from .model import build_model, load_trained_model
from .progress import stage
from .utils import fmt_time


def save_checkpoint(model, save_path=MODEL_PATH):
    save_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = save_path.with_name(save_path.name + ".tmp")
    try:
        torch.save(model.state_dict(), temporary)
        temporary.replace(save_path)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"  --> Saved best model weights to {save_path}")


def train_one_epoch(model, dataloader, criterion, optimizer, device, epoch, epochs):
    model.train()
    running_loss, correct, total = 0.0, 0, 0
    n_batches = len(dataloader)
    start = time.time()

    for i, (images, labels) in enumerate(dataloader, 1):
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

        if i == 1 or i % LOG_EVERY == 0 or i == n_batches:
            elapsed = time.time() - start
            eta = elapsed / i * (n_batches - i)
            print(
                f"  [train] epoch {epoch}/{epochs} | batch {i}/{n_batches} | "
                f"loss {running_loss / total:.4f} | acc {100 * correct / total:.2f}% | "
                f"elapsed {fmt_time(elapsed)} | ETA {fmt_time(eta)}",
                flush=True,
            )

    return running_loss / total, 100 * correct / total


def validate(model, dataloader, criterion, device, tag="val", return_metrics=False):
    model.eval()
    running_loss, correct, total = 0.0, 0, 0
    n_batches = len(dataloader)
    start = time.time()

    expected, predicted = [], []
    with torch.no_grad():
        for i, (images, labels) in enumerate(dataloader, 1):
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            expected.extend(CLASS_NAMES[int(v)] for v in labels.cpu())
            predicted.extend(CLASS_NAMES[int(v)] for v in preds.cpu())
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            if i == 1 or i % LOG_EVERY == 0 or i == n_batches:
                print(
                    f"  [{tag}] batch {i}/{n_batches} | elapsed {fmt_time(time.time() - start)}",
                    flush=True,
                )

    if return_metrics:
        return (
            running_loss / total,
            100 * correct / total,
            binary_metrics(expected, predicted),
        )
    return running_loss / total, 100 * correct / total


def main(output=None, overwrite=False, upload=False):
    output = Path(output) if output else MODEL_PATH
    if output.exists() and not overwrite:
        raise FileExistsError(
            f"Model already exists: {output}. Choose --output with a new path, or explicitly pass --overwrite."
        )
    if EPOCHS < 1 or BATCH_SIZE < 1 or LEARNING_RATE <= 0 or LOG_EVERY < 1:
        raise ValueError(
            "Epochs, batch size, learning rate and log interval must be positive"
        )
    stage(
        "image-training",
        1,
        7,
        "Resolve dataset and verify images/classes/split integrity",
    )
    if upload and (
        not storage.s3_enabled()
        or storage.config.S3_MODEL_KEY.startswith("<")
        or storage.config.S3_RESULTS_PREFIX.startswith("<")
    ):
        raise ValueError(
            "--upload requires valid S3 bucket, model key and results prefix"
        )
    storage.ensure_dataset()
    audit = audit_images(DATA_DIR)
    if audit["errors"]:
        raise ValueError("Image preflight failed: " + "; ".join(audit["errors"][:10]))
    print(
        f"[image-training] Preflight passed: {audit['counts']}; warnings: {len(audit['warnings'])}",
        flush=True,
    )
    print("=" * 60)
    print("TRAINING PHISHING SCREENSHOT CLASSIFIER")
    print(
        f"Device: {device} | epochs: {EPOCHS} | batch size: {BATCH_SIZE} | lr: {LEARNING_RATE}"
    )
    if device.type == "cpu":
        print(
            "NOTE: running on CPU - ResNet50 is slow here, expect several minutes per epoch."
        )
    print("=" * 60)

    stage("image-training", 2, 7, "Build data loaders")
    train_loader, val_loader, classes = get_data_loaders()

    stage("image-training", 3, 7, "Load pretrained backbone and initialize classifier")
    model = build_model(num_classes=len(classes)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = Adam(model.parameters(), lr=LEARNING_RATE)
    print("[model] Ready. Starting training...\n")

    best_acc = -math.inf
    history = []
    total_start = time.time()
    for epoch in range(1, EPOCHS + 1):
        stage("image-training", 4, 7, f"Train epoch {epoch}/{EPOCHS}")
        epoch_start = time.time()

        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device, epoch, EPOCHS
        )
        stage("image-training", 5, 7, f"Validate epoch {epoch}/{EPOCHS}")
        val_loss, val_acc, val_metrics = validate(
            model, val_loader, criterion, device, return_metrics=True
        )
        history.append(
            {
                "epoch": epoch,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "val_loss": val_loss,
                "val_acc": val_acc,
                "val_metrics": val_metrics,
            }
        )

        print(
            f"Epoch {epoch}/{EPOCHS} DONE in {fmt_time(time.time() - epoch_start)} | "
            f"train_loss {train_loss:.4f} train_acc {train_acc:.2f}% | "
            f"val_loss {val_loss:.4f} val_acc {val_acc:.2f}%"
        )

        if not math.isfinite(val_acc):
            raise ValueError("Non-finite validation accuracy; refusing to save a model")
        if val_acc > best_acc:
            best_acc = val_acc
            save_checkpoint(model, output)
        print()

    print(
        f"Training finished in {fmt_time(time.time() - total_start)}. Best val accuracy: {best_acc:.2f}%"
    )
    summary = {
        "best_val_acc": best_acc,
        "history": history,
        "dataset_audit": audit,
        "model_path": str(output.resolve()),
        "classes": classes,
    }

    # Final check on the untouched test split using the best saved weights
    stage("image-training", 6, 7, "Evaluate best checkpoint on the held-out test split")
    test_loader = get_test_loader()
    if test_loader is not None:
        print("\n[test] Evaluating best saved model on the test split...")
        best_model = load_trained_model(output, num_classes=len(classes))
        test_loss, test_acc, test_metrics = validate(
            best_model, test_loader, criterion, device, tag="test", return_metrics=True
        )
        print(f"[test] test_loss {test_loss:.4f} | test_acc {test_acc:.2f}%")
        summary.update(
            test_loss=test_loss, test_acc=test_acc, test_metrics=test_metrics
        )

    # Push to S3 only after everything succeeded
    stage("image-training", 7, 7, "Save evaluation report locally")
    import json

    report_path = output.with_name(output.name + ".metrics.json")
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if upload:
        print(
            "[image-training] Upload requested; writing configured S3 keys", flush=True
        )
        storage.upload_file(output, storage.config.S3_MODEL_KEY)
        storage.upload_file(
            report_path, storage.config.S3_RESULTS_PREFIX.rstrip("/") + "/training.json"
        )
    print(
        f"[image-training] Finished. Model: {output.resolve()} | Metrics: {report_path.resolve()}",
        flush=True,
    )
    return summary
