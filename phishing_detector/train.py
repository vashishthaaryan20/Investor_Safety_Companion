"""train.py - train the phishing-screenshot classifier (ResNet50).

Run from src/:   python -m phishing-detector.cli train
Dataset is pulled from S3 (config.S3_DATA_PREFIX); the best weights are saved to .cache/
and uploaded to S3 (config.S3_MODEL_KEY).
"""
import time

import torch
import torch.nn as nn
from torch.optim import Adam

from . import storage
from .config import (
    MODEL_PATH, device, EPOCHS, BATCH_SIZE, LEARNING_RATE, LOG_EVERY,
)
from .data import get_data_loaders, get_test_loader
from .model import build_model, load_trained_model
from .utils import fmt_time


def save_checkpoint(model, save_path=MODEL_PATH):
    save_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), save_path)
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
                f"elapsed {fmt_time(elapsed)} | ETA {fmt_time(eta)}"
            )

    return running_loss / total, 100 * correct / total


def validate(model, dataloader, criterion, device, tag="val"):
    model.eval()
    running_loss, correct, total = 0.0, 0, 0
    n_batches = len(dataloader)
    start = time.time()

    with torch.no_grad():
        for i, (images, labels) in enumerate(dataloader, 1):
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            if i == 1 or i % LOG_EVERY == 0 or i == n_batches:
                print(f"  [{tag}] batch {i}/{n_batches} | elapsed {fmt_time(time.time() - start)}")

    return running_loss / total, 100 * correct / total


def main():
    print("=" * 60)
    print("TRAINING PHISHING SCREENSHOT CLASSIFIER")
    print(f"Device: {device} | epochs: {EPOCHS} | batch size: {BATCH_SIZE} | lr: {LEARNING_RATE}")
    if device.type == "cpu":
        print("NOTE: running on CPU - ResNet50 is slow here, expect several minutes per epoch.")
    print("=" * 60)

    train_loader, val_loader, classes = get_data_loaders()

    model = build_model(num_classes=len(classes)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = Adam(model.parameters(), lr=LEARNING_RATE)
    print("[model] Ready. Starting training...\n")

    best_acc = 0.0
    history = []
    total_start = time.time()
    for epoch in range(1, EPOCHS + 1):
        print(f"--- Epoch {epoch}/{EPOCHS} ---")
        epoch_start = time.time()

        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device, epoch, EPOCHS)
        print("  Validating...")
        val_loss, val_acc = validate(model, val_loader, criterion, device)
        history.append({"epoch": epoch, "train_loss": train_loss, "train_acc": train_acc,
                        "val_loss": val_loss, "val_acc": val_acc})

        print(
            f"Epoch {epoch}/{EPOCHS} DONE in {fmt_time(time.time() - epoch_start)} | "
            f"train_loss {train_loss:.4f} train_acc {train_acc:.2f}% | "
            f"val_loss {val_loss:.4f} val_acc {val_acc:.2f}%"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            save_checkpoint(model)
        print()

    print(f"Training finished in {fmt_time(time.time() - total_start)}. Best val accuracy: {best_acc:.2f}%")
    summary = {"best_val_acc": best_acc, "history": history}

    # Final check on the untouched test split using the best saved weights
    test_loader = get_test_loader()
    if test_loader is not None:
        print("\n[test] Evaluating best saved model on the test split...")
        best_model = load_trained_model(MODEL_PATH, num_classes=len(classes))
        test_loss, test_acc = validate(best_model, test_loader, criterion, device, tag="test")
        print(f"[test] test_loss {test_loss:.4f} | test_acc {test_acc:.2f}%")
        summary.update(test_loss=test_loss, test_acc=test_acc)

    # Push to S3 only after everything succeeded
    storage.upload_model()                    # -> S3_MODEL_KEY
    storage.save_results("training", summary)  # -> S3_RESULTS_PREFIX
