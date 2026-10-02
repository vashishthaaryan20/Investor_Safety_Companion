"""phishing-detector - screenshot OCR + phishing check.

From src/main.py (the folder name has a hyphen, so use importlib):

    import importlib
    phishing_detector = importlib.import_module("phishing-detector")

    result = phishing_detector.analyze("screenshot.png", box=(x1, y1, x2, y2))
    result -> {"text", "urls", "label", "confidence", "probs", "warning"}

    text = phishing_detector.extract_text("screenshot.png")   # OCR only
"""
from .ocr import extract_text, find_urls
from .pipeline import analyze

__all__ = ["analyze", "extract_text", "find_urls"]
