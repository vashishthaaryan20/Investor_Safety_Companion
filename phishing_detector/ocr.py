"""Stage 0: image preprocessing and OCR regions with confidence and text spans."""

import time
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image

from .entities import extract_entities, find_urls

__all__ = [
    "analyze_image",
    "crop_region",
    "extract_entities",
    "extract_text",
    "find_urls",
    "group_into_lines",
    "load_image",
]

# CONFIGURATION

MIN_CONF = 0.30
MIN_CROP = 16
TARGET_HEIGHT = 160
# Longest side the text detector works at; words are still read from the full image.
# 1600 halves CPU time on 1080x2400 phone screenshots versus EasyOCR's 2560 default
# with equal accuracy (docs/model-integration.md, performance).
DETECT_CANVAS = 1600
VERBOSE = False

# Number of characters around an entity to retain as context.
CONTEXT_CHARS = 100


# LOGGING


def log(msg):
    """Print OCR debug information when VERBOSE is enabled."""
    if VERBOSE:
        print(f"[ocr] {msg}", flush=True)


# EASYOCR READER


@lru_cache(maxsize=8)
def get_reader(langs=("en",)):
    """Create and cache an EasyOCR reader.

    EasyOCR model loading is expensive, so the reader is cached.

    Args:
        langs: Tuple of language codes, e.g. ("en",)

    Returns:
        easyocr.Reader
    """

    import easyocr
    import torch

    use_gpu = torch.cuda.is_available()

    log(f"Loading EasyOCR reader for {list(langs)} (GPU: {use_gpu}).")

    log(
        "First run downloads the OCR models "
        "(needs internet) and can take a minute - "
        "later runs are faster."
    )

    t = time.time()

    reader = easyocr.Reader(list(langs), gpu=use_gpu)

    log(f"Reader ready in {time.time() - t:.1f}s")

    return reader


# IMAGE LOADING


def load_image(src) -> Image.Image:
    """Load an image from a path, PIL Image, or NumPy array.

    Args:
        src:
            - file path
            - PIL.Image.Image
            - numpy.ndarray

    Returns:
        PIL Image in RGB format.
    """

    if isinstance(src, Image.Image):
        return src.convert("RGB")

    if isinstance(src, np.ndarray):
        return Image.fromarray(src).convert("RGB")

    if isinstance(src, (bytes, bytearray)):
        from io import BytesIO

        src = BytesIO(src)

    return Image.open(src).convert("RGB")


# CROPPING


def crop_region(img: Image.Image, box):
    """Crop the selected region of an image.

    Args:
        img: PIL image.
        box: (x1, y1, x2, y2)

    Returns:
        Cropped PIL image.

    Raises:
        ValueError: If selected area is too small.
    """

    log(f"Image size: {img.width}x{img.height}")

    if box is None:
        log("No selection box given - reading the whole image.")
        return img

    x1, y1, x2, y2 = box

    # Support dragging in any direction.
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))

    # Keep coordinates inside image.
    x1 = max(0, int(x1))
    y1 = max(0, int(y1))

    x2 = min(img.width, int(x2))
    y2 = min(img.height, int(y2))

    width = x2 - x1
    height = y2 - y1

    if width < MIN_CROP or height < MIN_CROP:
        raise ValueError(f"Selected area too small ({width}x{height}px)")

    log(f"Cropping selection ({x1},{y1}) -> ({x2},{y2}) [{width}x{height}px]")

    return img.crop((x1, y1, x2, y2))


# PREPROCESSING


def preprocess(img: Image.Image) -> np.ndarray:
    """Prepare image for EasyOCR.

    Small images are upscaled.
    Dark screenshots are inverted.

    Args:
        img: PIL image.

    Returns:
        NumPy RGB image.
    """

    arr = np.array(img)

    h = arr.shape[0]

    if h < TARGET_HEIGHT:
        scale = TARGET_HEIGHT / h

        log(f"Selection is small, upscaling x{scale:.2f} for readability")

        arr = cv2.resize(arr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)

    if gray.mean() < 110:
        log("Dark background detected, inverting colours")

        arr = 255 - arr

    return arr


# OCR TOKEN CONSTRUCTION


def _bbox_to_dict(bbox):
    """Convert EasyOCR bbox to JSON-friendly format."""

    return [[float(point[0]), float(point[1])] for point in bbox]


def group_into_lines(results):
    """Convert EasyOCR results into reconstructed text.

    IMPORTANT:

    EasyOCR returns confidence for each detected text REGION,
    not necessarily for every individual word.

    This function preserves that region confidence and also
    records the character positions in the final reconstructed
    text.

    Each token contains:

        text
        confidence
        bbox
        x
        y
        h
        char_start
        char_end

    The character positions allow entity extraction to map an
    entity back to the OCR regions that produced it.

    Args:
        results:
            EasyOCR output:
            [(bbox, text, confidence), ...]

    Returns:
        {
            "text": "...",
            "tokens": [...]
        }
    """

    items = []

    for bbox, text, conf in results:
        if not text.strip():
            continue

        ys = [p[1] for p in bbox]
        xs = [p[0] for p in bbox]

        items.append(
            {
                "text": text.strip(),
                "raw_text": text,
                "confidence": float(conf),
                "bbox": _bbox_to_dict(bbox),
                "x": float(min(xs)),
                "y": float((min(ys) + max(ys)) / 2),
                "h": float(max(ys) - min(ys)),
            }
        )

    if not items:
        return {"text": "", "tokens": []}

    # Sort vertically first.

    items.sort(key=lambda d: d["y"])

    # Group OCR regions into lines.

    lines = []

    current = [items[0]]

    for item in items[1:]:
        current_y = item["y"]

        previous = current[-1]

        same_line = abs(current_y - previous["y"]) < 0.6 * max(item["h"], previous["h"])

        if same_line:
            current.append(item)

        else:
            lines.append(current)
            current = [item]

    lines.append(current)

    # Sort each line horizontally.

    for line in lines:
        line.sort(key=lambda d: d["x"])

    # Reconstruct text and assign character spans.

    output_parts = []
    final_tokens = []

    char_position = 0

    for line_index, line in enumerate(lines):
        if line_index > 0:
            output_parts.append("\n")
            char_position += 1

        for token_index, token in enumerate(line):
            if token_index > 0:
                output_parts.append(" ")
                char_position += 1

            token_text = token["text"]

            char_start = char_position
            char_end = char_start + len(token_text)

            output_parts.append(token_text)

            new_token = dict(token)

            new_token["char_start"] = char_start
            new_token["char_end"] = char_end

            final_tokens.append(new_token)

            char_position = char_end

    final_text = "".join(output_parts)

    return {"text": final_text, "tokens": final_tokens}


# OCR


def extract_text(src, box=None, langs=("en",), return_confidence=False):
    """Run EasyOCR once and return extracted text.

    Args:
        src:
            Image path, PIL image, or numpy array.

        box:
            Optional crop:
            (x1, y1, x2, y2)

        langs:
            EasyOCR languages.

        return_confidence:
            False:
                return plain text string.

            True:
                return:
                {
                    "text": "...",
                    "tokens": [...]
                }

    Returns:
        str or dict
    """

    start = time.time()

    img = load_image(src)

    img = crop_region(img, box)

    arr = preprocess(img)

    reader = get_reader(tuple(langs))

    log("Detecting and reading text (a few seconds on CPU)...")

    t = time.time()

    results = reader.readtext(arr, canvas_size=DETECT_CANVAS)

    elapsed = time.time() - t

    kept = sum(1 for _, _, confidence in results if confidence >= MIN_CONF)

    log(
        f"Found {len(results)} text regions "
        f"in {elapsed:.1f}s "
        f"({kept} above confidence "
        f"{MIN_CONF})"
    )

    ocr_data = group_into_lines(results)

    text = ocr_data["text"]

    log(f"Done in {time.time() - start:.1f}s total - {len(text)} characters extracted")

    # Optional terminal confidence display.

    if return_confidence:
        return ocr_data

    if VERBOSE:
        log("OCR results with confidence:")

        for token in ocr_data["tokens"]:
            print(
                f"  {token['text']:<35} confidence={token['confidence']:.4f}",
                flush=True,
            )

    return text


# Compatibility exports; new code imports entities and service directly.


def analyze_image(src, box=None, langs=("en",)):
    from .service import analyze_image as run

    return run(src, box=box, langs=langs)
