"""config.py - the ONE place for paths, S3 locations, device and hyper-parameters."""

import os
from pathlib import Path

import torch
from dotenv import load_dotenv

PKG_DIR = Path(__file__).resolve().parent  # src/phishing-detector/
SRC_DIR = PKG_DIR.parent  # src/

# AWS credentials live in src/.env (NOT in git). boto3 reads these from the environment:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
# You may also put S3_BUCKET / S3_MODEL_KEY / S3_DATA_PREFIX / S3_RESULTS_PREFIX in the
# same .env file instead of editing the defaults below.
load_dotenv(SRC_DIR / ".env")

# =====================================================================================
#  S3 LOCATIONS  -  FILL THESE IN  (anything still starting with "<" counts as "not set")
# =====================================================================================
# TODO(S3): bucket name, e.g. "my-fraud-detection-bucket"
S3_BUCKET = os.getenv("S3_BUCKET", "sangayan")

# TODO(S3): object key of the trained weights, e.g. "phishing-detector/models/model.pth"
S3_MODEL_KEY = os.getenv("S3_MODEL_KEY", "models/phishing_detection/model.pth")

# TODO(S3): prefix of the dataset folder that directly contains train/ val/ test/
#           e.g. "phishing-detector/data/Phishing dataset/image/"
S3_DATA_PREFIX = os.getenv("S3_DATA_PREFIX", "data/image/")

# TODO(S3): prefix where evaluation / training results (json) get uploaded,
#           e.g. "phishing-detector/results/"
S3_RESULTS_PREFIX = os.getenv("S3_RESULTS_PREFIX", "results/")
# =====================================================================================

# Local cache - everything pulled from S3 lands here. It is git-ignored.
CACHE_DIR = PKG_DIR / ".cache"
MODELS_DIR = CACHE_DIR / "models"
MODEL_PATH = (
    Path(os.getenv("IMAGE_MODEL_PATH", str(MODELS_DIR / "model.pth")))
    .expanduser()
    .resolve()
)
# Prefer the dataset beside src/; DATA_DIR can override it with another local path.
LOCAL_DATA_CANDIDATES = (
    SRC_DIR.parent / "data" / "prepared" / "phishing_images_v1" / "image",
    SRC_DIR.parent / "data" / "phishing_dataset" / "image",
    SRC_DIR.parent / "data" / "dataset" / "dataset" / "Phishing dataset" / "image",
    SRC_DIR.parent / "data" / "dataset" / "Phishing dataset" / "image",
)
LOCAL_DATA_DIR = next(
    (path for path in LOCAL_DATA_CANDIDATES if path.is_dir()),
    LOCAL_DATA_CANDIDATES[0],
)
_data_override = os.getenv("DATA_DIR")
DATA_DIR = (
    Path(_data_override).expanduser().resolve()
    if _data_override
    else LOCAL_DATA_DIR
    if LOCAL_DATA_DIR.is_dir()
    else CACHE_DIR / "data"
)
RESULTS_DIR = CACHE_DIR / "results"

# ImageFolder sorts class folders alphabetically, so index 0 = legitimate, 1 = phishing
CLASS_NAMES = ["legitimate", "phishing"]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Training hyperparameters
EPOCHS = int(os.getenv("TRAIN_EPOCHS", "1"))
BATCH_SIZE = int(os.getenv("TRAIN_BATCH_SIZE", "32"))
LEARNING_RATE = 1e-4  # 1e-3 is too high for fine-tuning a pretrained ResNet50 with Adam
LOG_EVERY = 10  # print training progress every N batches
