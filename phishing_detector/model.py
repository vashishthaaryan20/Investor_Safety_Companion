"""model.py - ResNet50 classifier: build, load weights, predict on one image."""
import torch
import torch.nn as nn
from torchvision import transforms, models

from . import storage
from .config import CLASS_NAMES, device

_classifier = None  # loaded once, reused across calls


def get_transform():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def build_model(num_classes=2, pretrained=True):
    if pretrained:
        print("[model] Loading pretrained ResNet50 (first run downloads ~100MB, needs internet)...")
        model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
    else:
        model = models.resnet50(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model


def load_trained_model(weight_path=None, num_classes=len(CLASS_NAMES)):
    """Load saved weights for inference. With no path given, the weights are fetched
    from S3 (S3_MODEL_KEY in config.py) the first time and cached locally."""
    weight_path = weight_path or storage.ensure_model()
    print(f"[model] Loading trained weights from {weight_path}")
    model = build_model(num_classes=num_classes, pretrained=False)
    model.load_state_dict(torch.load(weight_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model


def get_classifier():
    """Cached trained model for the pipeline (loads on first use)."""
    global _classifier
    if _classifier is None:
        _classifier = load_trained_model()
    return _classifier


def predict_image(model, pil_image):
    """Classify one PIL image. Returns (label, confidence_percent, {class: prob_percent})."""
    tensor = get_transform()(pil_image.convert("RGB")).unsqueeze(0).to(device)
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    idx = int(torch.argmax(probs))
    all_probs = {CLASS_NAMES[i]: float(probs[i]) * 100 for i in range(len(CLASS_NAMES))}
    return CLASS_NAMES[idx], float(probs[idx]) * 100, all_probs
