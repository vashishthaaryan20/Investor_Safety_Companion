"""main.py - train the phishing-screenshot classifier (ResNet50) + reusable model helpers.

Run training:   python main.py
"""
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models

from config import (
    DATA_DIR, MODEL_PATH, CLASS_NAMES, device,
    EPOCHS, BATCH_SIZE, LEARNING_RATE, LOG_EVERY,
)


# ----------------------------------------------------------------- helpers
def fmt_time(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}h{m:02d}m{s:02d}s" if h else f"{m}m{s:02d}s"


def get_transform():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


# -------------------------------------------------------------------- data
def get_data_loaders(batch_size=BATCH_SIZE):
    print(f"[data] Looking for dataset in: {DATA_DIR}")
    for split in ("train", "val"):
        if not (DATA_DIR / split).exists():
            raise FileNotFoundError(
                f"Missing folder: {DATA_DIR / split}\n"
                f"Fix DATA_DIR in config.py so it points at the folder containing train/ and val/."
            )

    transform = get_transform()
    print("[data] Indexing images (can take a moment)...")
    train_data = datasets.ImageFolder(root=DATA_DIR / "train", transform=transform)
    val_data = datasets.ImageFolder(root=DATA_DIR / "val", transform=transform)

    classes = train_data.classes
    print(f"[data] Classes: {classes}")
    print(f"[data] Train images: {len(train_data)} | Val images: {len(val_data)}")
    if classes != CLASS_NAMES:
        print(f"[data] WARNING: classes {classes} differ from CLASS_NAMES {CLASS_NAMES} in config.py - update it!")

    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_data, batch_size=batch_size, shuffle=False)
    return train_loader, val_loader, classes


def get_test_loader(batch_size=BATCH_SIZE):
    test_dir = DATA_DIR / "test"
    if not test_dir.exists():
        return None
    test_data = datasets.ImageFolder(root=test_dir, transform=get_transform())
    print(f"[data] Test images: {len(test_data)}")
    return DataLoader(test_data, batch_size=batch_size, shuffle=False)


# ------------------------------------------------------------------- model
def build_model(num_classes=2, pretrained=True):
    if pretrained:
        print("[model] Loading pretrained ResNet50 (first run downloads ~100MB, needs internet)...")
        model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
    else:
        model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model


def load_trained_model(weight_path=MODEL_PATH, num_classes=len(CLASS_NAMES)):
    """Load saved weights for inference (no pretrained download needed)."""
    weight_path = Path(weight_path)
    if not weight_path.exists():
        raise FileNotFoundError(f"No trained weights at {weight_path}. Run main.py to train first.")
    print(f"[model] Loading trained weights from {weight_path}")
    model = build_model(num_classes=num_classes, pretrained=False)
    model.load_state_dict(torch.load(weight_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model


def predict_image(model, pil_image):
    """Classify one PIL image. Returns (label, confidence_percent, {class: prob_percent})."""
    tensor = get_transform()(pil_image.convert("RGB")).unsqueeze(0).to(device)
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    idx = int(torch.argmax(probs))
    all_probs = {CLASS_NAMES[i]: float(probs[i]) * 100 for i in range(len(CLASS_NAMES))}
    return CLASS_NAMES[idx], float(probs[idx]) * 100, all_probs


def save_checkpoint(model, save_path=MODEL_PATH):
    path = Path(save_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), path)
    print(f"  --> Saved best model weights to {path}")


# ---------------------------------------------------------- train / validate
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

    # (the return is OUTSIDE the loop - this was the one-batch-per-epoch bug)
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


# -------------------------------------------------------------------- main
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
    total_start = time.time()
    for epoch in range(1, EPOCHS + 1):
        print(f"--- Epoch {epoch}/{EPOCHS} ---")
        epoch_start = time.time()

        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device, epoch, EPOCHS)
        print("  Validating...")
        val_loss, val_acc = validate(model, val_loader, criterion, device)

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

    # Final check on the untouched test split using the best saved weights
    test_loader = get_test_loader()
    if test_loader is not None:
        print("\n[test] Evaluating best saved model on the test split...")
        best_model = load_trained_model(num_classes=len(classes))
        test_loss, test_acc = validate(best_model, test_loader, criterion, device, tag="test")
        print(f"[test] test_loss {test_loss:.4f} | test_acc {test_acc:.2f}%")


if __name__ == "__main__":
    main()
