"""ocr.py - partial-screen OCR (crop a dragged rectangle -> text).

    from .ocr import extract_text
    text = extract_text("screenshot.png", box=(x1, y1, x2, y2))

box = two opposite corners of the selected rectangle in screenshot pixels
(any drag direction works). box=None reads the whole image.
"""
import re
import time
from functools import lru_cache

import cv2
import easyocr
import numpy as np
from PIL import Image

from .config import device

MIN_CONF = 0.30        # drop detections EasyOCR is unsure about (lower it to keep more text)
MIN_CROP = 16          # reject selections smaller than this many pixels (accidental taps)
TARGET_HEIGHT = 160    # upscale tiny crops so small text is readable
VERBOSE = True


def log(msg):
    if VERBOSE:
        print(f"[ocr] {msg}", flush=True)


@lru_cache(maxsize=1)
def get_reader(langs=("en",)):
    use_gpu = device.type == "cuda"
    log(f"Loading EasyOCR reader for {list(langs)} (GPU: {use_gpu}).")
    log("First run downloads the OCR models (needs internet) and can take a minute - later runs are fast.")
    t = time.time()
    reader = easyocr.Reader(list(langs), gpu=use_gpu)
    log(f"Reader ready in {time.time() - t:.1f}s")
    return reader


def load_image(src) -> Image.Image:
    if isinstance(src, Image.Image):
        return src.convert("RGB")
    if isinstance(src, np.ndarray):
        return Image.fromarray(src).convert("RGB")
    log(f"Opening image: {src}")
    return Image.open(src).convert("RGB")


def crop_region(img: Image.Image, box):
    log(f"Image size: {img.width}x{img.height}")
    if box is None:
        log("No selection box given - reading the whole image.")
        return img
    x1, y1, x2, y2 = box
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))
    # clamp to image bounds (a finger drag can go off-screen)
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(img.width, int(x2)), min(img.height, int(y2))
    if (x2 - x1) < MIN_CROP or (y2 - y1) < MIN_CROP:
        raise ValueError(f"Selected area too small ({x2 - x1}x{y2 - y1}px)")
    log(f"Cropping selection ({x1},{y1}) -> ({x2},{y2})  [{x2 - x1}x{y2 - y1}px]")
    return img.crop((x1, y1, x2, y2))


def preprocess(img: Image.Image) -> np.ndarray:
    arr = np.array(img)
    h = arr.shape[0]
    if h < TARGET_HEIGHT:
        scale = TARGET_HEIGHT / h
        log(f"Selection is small, upscaling x{scale:.2f} for readability")
        arr = cv2.resize(arr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    # Light text on a dark background (dark mode) reads worse -> invert
    if cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY).mean() < 110:
        log("Dark background detected, inverting colours")
        arr = 255 - arr
    return arr


def group_into_lines(results):
    """[(bbox, text, conf)] -> text in reading order, one line per row."""
    items = []
    for bbox, text, conf in results:
        if conf < MIN_CONF or not text.strip():
            continue
        ys = [p[1] for p in bbox]
        xs = [p[0] for p in bbox]
        items.append({"text": text.strip(), "x": min(xs),
                      "y": (min(ys) + max(ys)) / 2, "h": max(ys) - min(ys)})
    if not items:
        return ""

    items.sort(key=lambda d: d["y"])
    lines, current = [], [items[0]]
    for it in items[1:]:
        if abs(it["y"] - current[-1]["y"]) < 0.6 * max(it["h"], current[-1]["h"]):
            current.append(it)
        else:
            lines.append(current)
            current = [it]
    lines.append(current)

    out = []
    for line in lines:
        line.sort(key=lambda d: d["x"])
        out.append(" ".join(d["text"] for d in line))
    return "\n".join(out)


def extract_text(src, box=None, langs=("en",)) -> str:
    start = time.time()
    img = crop_region(load_image(src), box)
    arr = preprocess(img)
    reader = get_reader(tuple(langs))
    log("Detecting and reading text (a few seconds on CPU)...")
    t = time.time()
    results = reader.readtext(arr)  # [(bbox, text, conf), ...]
    kept = sum(1 for _, _, c in results if c >= MIN_CONF)
    log(f"Found {len(results)} text regions in {time.time() - t:.1f}s ({kept} above confidence {MIN_CONF})")
    text = group_into_lines(results)
    log(f"Done in {time.time() - start:.1f}s total - {len(text)} characters extracted")
    return text


def find_urls(text: str):
    """Pull URLs/domains out of OCR text (useful for the phishing side)."""
    return re.findall(r"(?:https?://|www\.)\S+|\b[\w-]+\.(?:com|net|org|in|io|co)\b\S*", text)
