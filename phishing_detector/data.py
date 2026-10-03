"""data.py - dataset loaders (train / val / test). The dataset itself lives in S3."""

from pathlib import Path

from torch.utils.data import DataLoader
from torchvision import datasets

from . import storage
from .config import BATCH_SIZE, CLASS_NAMES, DATA_DIR
from .model import get_transform


def get_data_loaders(batch_size=BATCH_SIZE):
    # Pulls train/ val/ (and test/) from S3_DATA_PREFIX into .cache/ the first time.
    storage.ensure_dataset()
    print(f"[data] Looking for dataset in: {DATA_DIR}")
    for split in ("train", "val"):
        if not (DATA_DIR / split).exists():
            raise FileNotFoundError(
                f"Missing folder: {DATA_DIR / split}\n"
                f"Check S3_DATA_PREFIX in config.py - it must point at the folder containing train/ and val/."
            )

    transform = get_transform()
    print("[data] Indexing images (can take a moment)...")
    train_data = _image_folder(DATA_DIR / "train", transform)
    val_data = _image_folder(DATA_DIR / "val", transform)

    classes = train_data.classes
    print(f"[data] Classes: {classes}")
    print(f"[data] Train images: {len(train_data)} | Val images: {len(val_data)}")

    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_data, batch_size=batch_size, shuffle=False)
    return train_loader, val_loader, classes


def get_test_loader(batch_size=BATCH_SIZE):
    storage.ensure_dataset()
    test_dir = DATA_DIR / "test"
    if not test_dir.exists():
        return None
    test_data = _image_folder(test_dir, get_transform())
    print(f"[data] Test images: {len(test_data)}")
    return DataLoader(test_data, batch_size=batch_size, shuffle=False)


def _image_folder(path, transform):
    expected = {name: index for index, name in enumerate(CLASS_NAMES)}
    actual = {p.name for p in Path(path).iterdir() if p.is_dir()}
    if actual != set(expected):
        raise ValueError(
            f"{path}: expected class folders {sorted(expected)}, got {sorted(actual)}"
        )
    data = datasets.ImageFolder(
        path,
        transform=transform,
        is_valid_file=lambda value: (
            Path(value).suffix.lower()
            in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".avif"}
        ),
    )
    if data.class_to_idx != expected:
        raise ValueError(f"Class index mismatch in {path}")
    return data
