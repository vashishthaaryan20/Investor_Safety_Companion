### Paths / Devices / HyperParameters

from pathlib import Path

import torch

# Layout:  <project root>/code/src/config.py   (this file)
#          <project root>/data/dataset/Phishing dataset/image/{train,val,test}/{legitimate,phishing}
#          <project root>/models/model.pth
SRC_DIR = Path(__file__).resolve().parent
ROOT_DIR = SRC_DIR.parents[2]  # project root (contains code/, data/, models/)

DATA_DIR = ROOT_DIR / "data" / "dataset" / "Phishing dataset" / "image"
MODELS_DIR = ROOT_DIR / "models"
MODEL_PATH = MODELS_DIR / "model.pth"

# ImageFolder sorts class folders alphabetically, so index 0 = legitimate, 1 = phishing
CLASS_NAMES = ["legitimate", "phishing"]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Training hyperparameters
EPOCHS = 2
BATCH_SIZE = 32
LEARNING_RATE = 1e-4  # 1e-3 is too high for fine-tuning a pretrained ResNet50 with Adam
LOG_EVERY = 10        # print training progress every N batches

if __name__ == "__main__":
    print(ROOT_DIR, DATA_DIR.exists(), MODELS_DIR)