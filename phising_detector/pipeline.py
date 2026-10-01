"""pipeline.py - the full tool: OCR the selected region + phishing verdict on the screenshot.

From your app:
    from pipeline import analyze
    result = analyze("screenshot.png", box=(x1, y1, x2, y2))
    result -> {"text": ..., "urls": [...], "label": ..., "confidence": ..., "probs": {...}}

CLI:
    python pipeline.py screenshot.png
    python pipeline.py screenshot.png 100 200 600 500
"""
import sys
import time

from config import MODEL_PATH, device
from ocr_tool import extract_text, find_urls, load_image, crop_region

_model = None  # loaded once, reused across calls


def _get_classifier():
    global _model
    if _model is None:
        from main import load_trained_model
        _model = load_trained_model()
    return _model


def analyze(src, box=None, classify="full"):
    """
    classify = "full"  -> phishing check on the whole screenshot (what the dataset looks like)
               "crop"  -> phishing check on just the selected region
               None    -> skip classification
    """
    start = time.time()
    print(f"[pipeline] Device: {device}")
    img = load_image(src)

    print("[pipeline] Step 1/2: reading text from the selected region...")
    text = extract_text(img, box)
    urls = find_urls(text)

    result = {"text": text, "urls": urls, "label": None, "confidence": None, "probs": None}

    if classify and MODEL_PATH.exists():
        from main import predict_image
        print(f"[pipeline] Step 2/2: phishing check on the {classify} image...")
        target = crop_region(img, box) if classify == "crop" else img
        label, conf, probs = predict_image(_get_classifier(), target)
        result.update(label=label, confidence=conf, probs=probs)
    elif classify:
        print(f"[pipeline] Step 2/2 skipped: no trained model at {MODEL_PATH} (run main.py first).")

    print(f"[pipeline] Finished in {time.time() - start:.1f}s")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python pipeline.py <image> [x1 y1 x2 y2]")
    path = sys.argv[1]
    box = tuple(map(int, sys.argv[2:6])) if len(sys.argv) >= 6 else None
    out = analyze(path, box)

    print("\n" + "=" * 50)
    print("EXTRACTED TEXT:")
    print(out["text"] or "[no text found]")
    if out["urls"]:
        print("\nURLs found:", out["urls"])
    if out["label"]:
        print(f"\nPhishing check: {out['label'].upper()} ({out['confidence']:.1f}% confident)")
        print("  ", {k: f"{v:.1f}%" for k, v in out["probs"].items()})
    print("=" * 50)
