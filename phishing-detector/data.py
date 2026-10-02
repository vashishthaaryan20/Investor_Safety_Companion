"""data.py - dataset loaders (train / val / test). The dataset itself lives in S3."""
from torch.utils.data import DataLoader
from torchvision import datasets

from . import storage
from .config import DATA_DIR, CLASS_NAMES, BATCH_SIZE
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
    storage.ensure_dataset()
    test_dir = DATA_DIR / "test"
    if not test_dir.exists():
        return None
    test_data = datasets.ImageFolder(root=test_dir, transform=get_transform())
    print(f"[data] Test images: {len(test_data)}")
    return DataLoader(test_data, batch_size=batch_size, shuffle=False)
