"""pipeline.py - the full tool: OCR the selected region + phishing verdict on the screenshot.
    
    from .pipeline import analyze
    result = analyze("screenshot.png", box=(x1, y1, x2, y2))
    result -> {"text", "urls", "label", "confidence", "probs", "warning"}
"""
import time

from .config import device
from .ocr import extract_text, find_urls, load_image, crop_region


def analyze(src, box=None, classify="full"):
    """
    src      path / PIL image / numpy array
    box      (x1, y1, x2, y2) selected region for OCR, or None for the whole image
    classify "full" -> phishing check on the whole screenshot (what the dataset looks like)
             "crop" -> phishing check on just the selected region
             None   -> skip classification (OCR only)
    """
    start = time.time()
    print(f"[pipeline] Device: {device}")
    img = load_image(src)

    print("[pipeline] Step 1/2: reading text from the selected region...")
    text = extract_text(img, box)
    urls = find_urls(text)

    result = {"text": text, "urls": urls, "label": None, "confidence": None,
              "probs": None, "warning": None}

    if classify:
        print(f"[pipeline] Step 2/2: phishing check on the {classify} image...")
        try:
            from .model import get_classifier, predict_image  # heavy import, only when needed
            target = crop_region(img, box) if classify == "crop" else img
            label, conf, probs = predict_image(get_classifier(), target)
            result.update(label=label, confidence=conf, probs=probs)
        except FileNotFoundError as e:
            # Model weights unavailable (not in .cache and S3 not configured/reachable).
            result["warning"] = f"Phishing check skipped: {e}"
            print(f"[pipeline] {result['warning']}")

    print(f"[pipeline] Finished in {time.time() - start:.1f}s")
    return result
