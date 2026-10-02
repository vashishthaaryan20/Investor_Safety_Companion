"""ocr.py - Image OCR + entity extraction for phishing/risk analysis.

Pipeline:

    Screenshot/Image
          |
          v
    crop + preprocess
          |
          v
      EasyOCR (ONE PASS)
          |
          +----------------------+
          |                      |
          v                      v
    reconstructed text     OCR tokens with
                           confidence + bbox
          |
          v
    entity extraction
          |
          v
    entities with OCR confidence
          |
          v
       risk engine


Example:

    from .ocr import analyze_image

    result = analyze_image("screenshot.png")

    print(result["text"])
    print(result["entities"])


Or OCR only:

    from .ocr import extract_text

    text = extract_text("screenshot.png")

    # With OCR metadata:
    result = extract_text(
        "screenshot.png",
        return_confidence=True
    )
"""

import os
import re
import time
from functools import lru_cache

import cv2
import easyocr
import numpy as np
from PIL import Image

from .config import device


# ============================================================
# CONFIGURATION
# ============================================================

MIN_CONF = 0.30
MIN_CROP = 16
TARGET_HEIGHT = 160
VERBOSE = True

# Recognised words can contain OTPs, account numbers, or private chats, so they are
# only printed when SANGYAN_OCR_DEBUG=1 is set explicitly.
LOG_OCR_TEXT = os.environ.get("SANGYAN_OCR_DEBUG") == "1"

# Number of characters around an entity to retain as context.
CONTEXT_CHARS = 100


# ============================================================
# LOGGING
# ============================================================

def log(msg):
    """Print OCR debug information when VERBOSE is enabled."""
    if VERBOSE:
        print(f"[ocr] {msg}", flush=True)


# ============================================================
# EASYOCR READER
# ============================================================

@lru_cache(maxsize=8)
def get_reader(langs=("en",)):
    """Create and cache an EasyOCR reader.

    EasyOCR model loading is expensive, so the reader is cached.

    Args:
        langs: Tuple of language codes, e.g. ("en",)

    Returns:
        easyocr.Reader
    """

    use_gpu = device.type == "cuda"

    log(
        f"Loading EasyOCR reader for {list(langs)} "
        f"(GPU: {use_gpu})."
    )

    log(
        "First run downloads the OCR models "
        "(needs internet) and can take a minute - "
        "later runs are faster."
    )

    t = time.time()

    reader = easyocr.Reader(
        list(langs),
        gpu=use_gpu
    )

    log(
        f"Reader ready in {time.time() - t:.1f}s"
    )

    return reader


# ============================================================
# IMAGE LOADING
# ============================================================

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

    log(f"Opening image: {src}")

    return Image.open(src).convert("RGB")


# ============================================================
# CROPPING
# ============================================================

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

    log(
        f"Image size: "
        f"{img.width}x{img.height}"
    )

    if box is None:
        log(
            "No selection box given - "
            "reading the whole image."
        )
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
        raise ValueError(
            f"Selected area too small "
            f"({width}x{height}px)"
        )

    log(
        f"Cropping selection "
        f"({x1},{y1}) -> ({x2},{y2}) "
        f"[{width}x{height}px]"
    )

    return img.crop(
        (x1, y1, x2, y2)
    )


# ============================================================
# PREPROCESSING
# ============================================================

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

        log(
            f"Selection is small, "
            f"upscaling x{scale:.2f} "
            f"for readability"
        )

        arr = cv2.resize(
            arr,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC
        )

    gray = cv2.cvtColor(
        arr,
        cv2.COLOR_RGB2GRAY
    )

    if gray.mean() < 110:

        log(
            "Dark background detected, "
            "inverting colours"
        )

        arr = 255 - arr

    return arr


# ============================================================
# OCR TOKEN CONSTRUCTION
# ============================================================

def _bbox_to_dict(bbox):
    """Convert EasyOCR bbox to JSON-friendly format."""

    return [
        [float(point[0]), float(point[1])]
        for point in bbox
    ]


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

        if conf < MIN_CONF:
            continue

        if not text.strip():
            continue

        ys = [p[1] for p in bbox]
        xs = [p[0] for p in bbox]

        items.append(
            {
                "text": text.strip(),
                "confidence": float(conf),
                "bbox": _bbox_to_dict(bbox),
                "x": float(min(xs)),
                "y": float(
                    (min(ys) + max(ys)) / 2
                ),
                "h": float(
                    max(ys) - min(ys)
                ),
            }
        )

    if not items:
        return {
            "text": "",
            "tokens": []
        }

    # --------------------------------------------------------
    # Sort vertically first.
    # --------------------------------------------------------

    items.sort(
        key=lambda d: d["y"]
    )

    # --------------------------------------------------------
    # Group OCR regions into lines.
    # --------------------------------------------------------

    lines = []

    current = [items[0]]

    for item in items[1:]:

        current_y = item["y"]

        previous = current[-1]

        same_line = (
            abs(
                current_y - previous["y"]
            )
            <
            0.6
            *
            max(
                item["h"],
                previous["h"]
            )
        )

        if same_line:
            current.append(item)

        else:
            lines.append(current)
            current = [item]

    lines.append(current)

    # --------------------------------------------------------
    # Sort each line horizontally.
    # --------------------------------------------------------

    for line in lines:
        line.sort(
            key=lambda d: d["x"]
        )

    # --------------------------------------------------------
    # Reconstruct text and assign character spans.
    # --------------------------------------------------------

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
            char_end = (
                char_start
                + len(token_text)
            )

            output_parts.append(
                token_text
            )

            new_token = dict(token)

            new_token["char_start"] = char_start
            new_token["char_end"] = char_end

            final_tokens.append(
                new_token
            )

            char_position = char_end

    final_text = "".join(
        output_parts
    )

    return {
        "text": final_text,
        "tokens": final_tokens
    }


# ============================================================
# OCR
# ============================================================

def extract_text(
    src,
    box=None,
    langs=("en",),
    return_confidence=False
):
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

    img = crop_region(
        img,
        box
    )

    arr = preprocess(img)

    reader = get_reader(
        tuple(langs)
    )

    log(
        "Detecting and reading text "
        "(a few seconds on CPU)..."
    )

    t = time.time()

    results = reader.readtext(arr)

    elapsed = time.time() - t

    kept = sum(
        1
        for _, _, confidence in results
        if confidence >= MIN_CONF
    )

    log(
        f"Found {len(results)} text regions "
        f"in {elapsed:.1f}s "
        f"({kept} above confidence "
        f"{MIN_CONF})"
    )

    ocr_data = group_into_lines(
        results
    )

    text = ocr_data["text"]

    log(
        f"Done in "
        f"{time.time() - start:.1f}s total - "
        f"{len(text)} characters extracted"
    )

    # --------------------------------------------------------
    # Optional terminal confidence display.
    # --------------------------------------------------------

    if return_confidence:

        if LOG_OCR_TEXT:

            log("OCR results with confidence:")

            for token in ocr_data["tokens"]:

                print(
                    f"  {token['text']:<35} "
                    f"confidence="
                    f"{token['confidence']:.4f}",
                    flush=True
                )

        return ocr_data

    return text


# ============================================================
# ENTITY REGEX PATTERNS
# ============================================================

# ------------------------------------------------------------
# URL
# ------------------------------------------------------------

URL_PATTERN = re.compile(
    r"\b(?:https?://|www\.)"
    r"[a-zA-Z0-9][a-zA-Z0-9.-]*"
    r"(?:\.[a-zA-Z]{2,63})"
    r"(?:/[^\s<>'\"`]*)?",
    re.IGNORECASE
)


# ------------------------------------------------------------
# Domain
# ------------------------------------------------------------

DOMAIN_PATTERN = re.compile(
    r"\b"
    r"(?:[a-zA-Z0-9]"
    r"[a-zA-Z0-9-]{0,62}\.)+"
    r"[a-zA-Z]{2,63}"
    r"\b",
    re.IGNORECASE
)


# ------------------------------------------------------------
# Email
# ------------------------------------------------------------

EMAIL_PATTERN = re.compile(
    r"\b"
    r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
    r"@"
    r"[A-Za-z0-9]"
    r"(?:[A-Za-z0-9-]{0,61}"
    r"[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9]"
    r"(?:[A-Za-z0-9-]{0,61}"
    r"[A-Za-z0-9])?)+"
    r"\b"
)


# ------------------------------------------------------------
# Indian / international phone numbers
# ------------------------------------------------------------

PHONE_PATTERN = re.compile(
    r"(?<!\d)"
    r"(?:"
    r"(?:\+|00)?\s*"
    r"(?:91[\s.-]?)?"
    r"[6-9]\d{9}"
    r"|"
    r"(?:\+|00)"
    r"\d{1,3}"
    r"[\s.-]?"
    r"\d{6,12}"
    r")"
    r"(?!\d)"
)


# ------------------------------------------------------------
# UPI / payment ID
#
# Example:
#     user@oksbi
#     name@ybl
#     abc@paytm
# ------------------------------------------------------------

PAYMENT_ID_PATTERN = re.compile(
    r"\b"
    r"[A-Za-z0-9._-]{2,100}"
    r"@"
    r"(?:"
    r"oksbi|"
    r"okaxis|"
    r"okicici|"
    r"okhdfcbank|"
    r"ybl|"
    r"ibl|"
    r"axl|"
    r"paytm|"
    r"upi|"
    r"apl|"
    r"waicici|"
    r"barodampay|"
    r"pnb|"
    r"sbi|"
    r"hdfcbank|"
    r"icici|"
    r"axisbank|"
    r"kotak|"
    r"federal|"
    r"indus|"
    r"yesbank"
    r")"
    r"\b",
    re.IGNORECASE
)


# ------------------------------------------------------------
# Generic UPI-like ID
#
# This is intentionally broader but should be filtered against
# email addresses.
# ------------------------------------------------------------

GENERIC_PAYMENT_ID_PATTERN = re.compile(
    r"\b"
    r"[A-Za-z0-9._-]{2,100}"
    r"@[A-Za-z][A-Za-z0-9._-]{2,30}"
    r"\b"
)


# ------------------------------------------------------------
# Bank account number
#
# We mainly trigger this when the number is near bank/account
# terminology to avoid treating every 9-18 digit number as an
# account number.
# ------------------------------------------------------------

BANK_ACCOUNT_PATTERN = re.compile(
    r"(?:"
    r"(?:account|a/c|acct)"
    r"(?:\s*(?:number|no\.?|#))?"
    r"\s*[:\-]?\s*"
    r")"
    r"(\d{9,18})",
    re.IGNORECASE
)


# ------------------------------------------------------------
# IFSC
# ------------------------------------------------------------

IFSC_PATTERN = re.compile(
    r"\b"
    r"[A-Z]{4}0[A-Z0-9]{6}"
    r"\b",
    re.IGNORECASE
)


# ------------------------------------------------------------
# Bitcoin
# ------------------------------------------------------------

BITCOIN_PATTERN = re.compile(
    r"\b(?:"
    r"bc1[a-zA-HJ-NP-Z0-9]{20,87}"
    r"|"
    r"[13][a-km-zA-HJ-NP-Z1-9]{25,34}"
    r")\b"
)


# ------------------------------------------------------------
# Ethereum
# ------------------------------------------------------------

ETHEREUM_PATTERN = re.compile(
    r"\b0x[a-fA-F0-9]{40}\b"
)


# ============================================================
# SECRET / SENSITIVE INFORMATION PATTERNS
# ============================================================

SECRET_PATTERNS = {

    "otp": re.compile(
        r"\b(?:otp|one[\s-]?time[\s-]?password)\b",
        re.IGNORECASE
    ),

    "pin": re.compile(
        r"\b(?:pin|upi[\s-]?pin|mpin)\b",
        re.IGNORECASE
    ),

    "cvv": re.compile(
        r"\b(?:cvv|cvc|cvv2|security[\s-]?code)\b",
        re.IGNORECASE
    ),

    "password": re.compile(
        r"\b(?:password|passcode|login[\s-]?password)\b",
        re.IGNORECASE
    ),

    "card_number": re.compile(
        r"\b(?:card[\s-]?"
        r"(?:number|no\.?|num))\b",
        re.IGNORECASE
    ),
}


# ============================================================
# SECRET REQUEST PATTERNS
# ============================================================

SECRET_REQUEST_ACTIONS = re.compile(
    r"\b(?:"
    r"enter|"
    r"input|"
    r"type|"
    r"provide|"
    r"submit|"
    r"share|"
    r"send|"
    r"give|"
    r"confirm|"
    r"verify|"
    r"provide"
    r")\b",
    re.IGNORECASE
)


SECRET_NEGATION_PATTERN = re.compile(
    r"\b(?:"
    r"never|"
    r"do\s+not|"
    r"don't|"
    r"dont|"
    r"never\s+share|"
    r"never\s+provide|"
    r"do\s+not\s+share|"
    r"do\s+not\s+provide"
    r")\b",
    re.IGNORECASE
)


# ============================================================
# BRAND LIST
# ============================================================

# This is deliberately configurable.
#
# Add brands relevant to your phishing detection dataset here.
#
# This is NOT intended to be a complete global brand database.

BRANDS = [
    # Banks
    "SBI",
    "State Bank of India",
    "HDFC",
    "HDFC Bank",
    "ICICI",
    "ICICI Bank",
    "Axis Bank",
    "Kotak",
    "Kotak Mahindra",
    "Punjab National Bank",
    "PNB",
    "Bank of Baroda",
    "Canara Bank",
    "IDBI",
    "Yes Bank",
    "IndusInd Bank",

    # Payments
    "Paytm",
    "PhonePe",
    "Google Pay",
    "GPay",
    "BharatPe",
    "Amazon Pay",

    # E-commerce
    "Amazon",
    "Flipkart",
    "Myntra",
    "Meesho",

    # Social / communication
    "WhatsApp",
    "Instagram",
    "Facebook",
    "Telegram",
    "Snapchat",

    # Technology
    "Google",
    "Microsoft",
    "Apple",
    "Meta",
    "OpenAI",

    # Government / Indian services
    "Aadhaar",
    "UIDAI",
    "Income Tax",
    "IRCTC",
    "DigiLocker",
    "EPFO",
    "RBI",
]


# ============================================================
# ENTITY CLEANING
# ============================================================

def clean_entity(value):
    """Remove punctuation accidentally captured around entities."""

    if value is None:
        return ""

    value = value.strip()

    # Common punctuation at the end of OCR-extracted entities.
    value = value.rstrip(
        ".,;:!?)]}>\"'`"
    )

    # Opening brackets that accidentally surround an entity.
    value = value.lstrip(
        "([{<\"'`"
    )

    return value.strip()


# ============================================================
# ENTITY NORMALIZATION
# ============================================================

def normalize_entity(entity_type, value):
    """Create a normalized representation of an entity."""

    value = clean_entity(value)

    if entity_type in {
        "email",
        "domain",
        "payment_id",
        "url",
        "ifsc",
        "crypto_wallet",
    }:
        return value.lower()

    if entity_type == "phone":
        # Keep leading '+' if present, remove formatting.
        if value.startswith("+"):
            return "+" + re.sub(
                r"\D",
                "",
                value
            )

        return re.sub(
            r"\D",
            "",
            value
        )

    if entity_type == "bank_account":
        return re.sub(
            r"\D",
            "",
            value
        )

    return value


# ============================================================
# OCR CONFIDENCE MAPPING
# ============================================================

def get_entity_ocr_confidence(
    start,
    end,
    ocr_tokens
):
    """Map an entity's character span to OCR confidence.

    OCR tokens contain:

        char_start
        char_end
        confidence

    If an entity overlaps several OCR regions, the minimum
    confidence is used.

    Why minimum?

    Example:

        "support@example.com"

    may be detected as:

        support@       confidence 0.98
        example.com    confidence 0.72

    The complete entity depends on both regions, so 0.72 is a
    conservative confidence estimate.

    Returns:
        float or None
    """

    if not ocr_tokens:
        return None

    overlapping = []

    for token in ocr_tokens:

        token_start = token.get(
            "char_start"
        )

        token_end = token.get(
            "char_end"
        )

        if (
            token_start is None
            or token_end is None
        ):
            continue

        # Character span overlap.
        if (
            start < token_end
            and end > token_start
        ):
            overlapping.append(
                float(
                    token["confidence"]
                )
            )

    if not overlapping:
        return None

    return min(overlapping)


# ============================================================
# ENTITY CONTEXT
# ============================================================

def get_context(
    text,
    start,
    end,
    context_chars=CONTEXT_CHARS
):
    """Return text surrounding an entity."""

    left = max(
        0,
        start - context_chars
    )

    right = min(
        len(text),
        end + context_chars
    )

    return text[left:right].strip()


# ============================================================
# ENTITY EXTRACTION
# ============================================================

def extract_entities(
    text,
    ocr_tokens=None
):
    """Extract structured entities from OCR-generated text.

    Args:
        text:
            Reconstructed OCR text.

        ocr_tokens:
            OCR token metadata from extract_text(
                return_confidence=True
            ).

    Returns:
        List of dictionaries.

    Example:

        [
            {
                "type": "url",
                "value": "https://example.com",
                "normalized": "https://example.com",
                "ocr_confidence": 0.94,
                "context": "Click https://example.com...",
                "start": 6,
                "end": 25
            }
        ]

    """

    if not text:
        return []

    entities = []

    # --------------------------------------------------------
    # Prevent duplicate entities.
    # --------------------------------------------------------

    seen = set()

    def add_entity(
        entity_type,
        value,
        start,
        end,
        extra=None
    ):
        """Add an entity while avoiding duplicates."""

        value = clean_entity(value)

        if not value:
            return

        # Recalculate end after cleaning.
        # The original regex span is still used for confidence.
        clean_end = start + len(value)

        normalized = normalize_entity(
            entity_type,
            value
        )

        key = (
            entity_type,
            normalized,
            start
        )

        if key in seen:
            return

        seen.add(key)

        confidence = get_entity_ocr_confidence(
            start,
            end,
            ocr_tokens
        )

        entity = {
            "type": entity_type,
            "value": value,
            "normalized": normalized,
            "ocr_confidence": confidence,
            "context": get_context(
                text,
                start,
                end
            ),
            "start": start,
            "end": clean_end,
        }

        if extra:
            entity.update(extra)

        entities.append(entity)

    # ========================================================
    # EMAILS
    # ========================================================

    email_spans = []

    for match in EMAIL_PATTERN.finditer(text):

        value = match.group(0)

        start = match.start()
        end = match.end()

        email_spans.append(
            (start, end)
        )

        add_entity(
            "email",
            value,
            start,
            end
        )

    # ========================================================
    # URLS
    # ========================================================

    url_spans = []

    for match in URL_PATTERN.finditer(text):

        value = clean_entity(
            match.group(0)
        )

        start = match.start()
        end = start + len(value)

        url_spans.append(
            (start, end)
        )

        add_entity(
            "url",
            value,
            start,
            end
        )

    # ========================================================
    # DOMAINS
    # ========================================================

    for match in DOMAIN_PATTERN.finditer(text):

        start = match.start()
        end = match.end()

        value = clean_entity(
            match.group(0)
        )

        # Ignore domains that are part of an email.
        inside_email = any(
            start >= email_start
            and end <= email_end
            for email_start, email_end
            in email_spans
        )

        if inside_email:
            continue

        # Ignore domains that are already part of a URL.
        inside_url = any(
            start >= url_start
            and end <= url_end
            for url_start, url_end
            in url_spans
        )

        if inside_url:
            continue

        add_entity(
            "domain",
            value,
            start,
            end
        )

    # ========================================================
    # PHONE NUMBERS
    # ========================================================

    for match in PHONE_PATTERN.finditer(text):

        value = clean_entity(
            match.group(0)
        )

        start = match.start()
        end = start + len(value)

        digits = re.sub(
            r"\D",
            "",
            value
        )

        # Avoid treating obvious long account/card numbers
        # as phone numbers.
        if len(digits) < 10 or len(digits) > 13:
            continue

        add_entity(
            "phone",
            value,
            start,
            end
        )

    # ========================================================
    # UPI / PAYMENT IDS
    # ========================================================

    payment_spans = []

    # First detect known payment handles.

    for match in PAYMENT_ID_PATTERN.finditer(text):

        start = match.start()
        end = match.end()

        value = clean_entity(
            match.group(0)
        )

        payment_spans.append(
            (start, end)
        )

        add_entity(
            "payment_id",
            value,
            start,
            end
        )

    # Then detect generic payment-style IDs.

    for match in GENERIC_PAYMENT_ID_PATTERN.finditer(text):

        start = match.start()
        end = match.end()

        value = clean_entity(
            match.group(0)
        )

        # Don't classify normal email addresses as payment IDs.
        inside_email = any(
            start >= email_start
            and end <= email_end
            for email_start, email_end
            in email_spans
        )

        if inside_email:
            continue

        # Don't duplicate known payment IDs.
        already_payment = any(
            start == payment_start
            and end == payment_end
            for payment_start, payment_end
            in payment_spans
        )

        if already_payment:
            continue

        add_entity(
            "payment_id",
            value,
            start,
            end
        )

    # ========================================================
    # BANK ACCOUNT NUMBERS
    # ========================================================

    for match in BANK_ACCOUNT_PATTERN.finditer(text):

        # Group 1 contains the actual account number.
        value = match.group(1)

        start = match.start(1)
        end = match.end(1)

        add_entity(
            "bank_account",
            value,
            start,
            end
        )

    # ========================================================
    # IFSC
    # ========================================================

    for match in IFSC_PATTERN.finditer(text):

        value = match.group(0)

        add_entity(
            "ifsc",
            value,
            match.start(),
            match.end()
        )

    # ========================================================
    # BITCOIN
    # ========================================================

    for match in BITCOIN_PATTERN.finditer(text):

        value = match.group(0)

        add_entity(
            "crypto_wallet",
            value,
            match.start(),
            match.end(),
            extra={
                "crypto_type": "bitcoin"
            }
        )

    # ========================================================
    # ETHEREUM
    # ========================================================

    for match in ETHEREUM_PATTERN.finditer(text):

        value = match.group(0)

        add_entity(
            "crypto_wallet",
            value,
            match.start(),
            match.end(),
            extra={
                "crypto_type": "ethereum"
            }
        )

    # ========================================================
    # SECRET INFORMATION
    # ========================================================

    for secret_type, pattern in SECRET_PATTERNS.items():

        for match in pattern.finditer(text):

            value = match.group(0)

            start = match.start()
            end = match.end()

            context = get_context(
                text,
                start,
                end,
                context_chars=80
            )

            # ------------------------------------------------
            # Determine whether this appears to be an actual
            # request for the secret.
            # ------------------------------------------------

            request_window_start = max(
                0,
                start - 60
            )

            request_window_end = min(
                len(text),
                end + 60
            )

            request_window = text[
                request_window_start:
                request_window_end
            ]

            has_action = bool(
                SECRET_REQUEST_ACTIONS.search(
                    request_window
                )
            )

            has_negation = bool(
                SECRET_NEGATION_PATTERN.search(
                    request_window
                )
            )

            is_request = (
                has_action
                and not has_negation
            )

            if is_request:
                entity_type = "secret_request"
            else:
                entity_type = "secret_mention"

            add_entity(
                entity_type,
                value,
                start,
                end,
                extra={
                    "secret_type": secret_type,
                    "is_request": is_request,
                    "request_context": context,
                }
            )

    # ========================================================
    # CARD NUMBER
    # ========================================================

    # Card numbers are detected separately because the keyword
    # "card number" and the actual number may occur separately.
    #
    # Example:
    #
    #     Card Number
    #     4111 1111 1111 1111

    card_keyword_pattern = re.compile(
        r"\bcard[\s-]?"
        r"(?:number|no\.?|num)"
        r"\b",
        re.IGNORECASE
    )

    for keyword_match in card_keyword_pattern.finditer(text):

        search_start = keyword_match.end()

        search_end = min(
            len(text),
            search_start + 80
        )

        nearby = text[
            search_start:search_end
        ]

        card_number_match = re.search(
            r"(?<!\d)"
            r"(?:\d[\s-]?){13,19}"
            r"(?!\d)",
            nearby
        )

        if not card_number_match:
            continue

        raw_value = card_number_match.group(0)

        value = re.sub(
            r"[\s-]",
            "",
            raw_value
        )

        if not (
            13 <= len(value) <= 19
        ):
            continue

        start = (
            search_start
            + card_number_match.start()
        )

        end = (
            search_start
            + card_number_match.end()
        )

        add_entity(
            "secret_request"
            if False
            else "card_number",
            value,
            start,
            end,
            extra={
                "secret_type": "card_number"
            }
        )

    # ========================================================
    # BRANDS
    # ========================================================

    for brand in BRANDS:

        pattern = re.compile(
            r"(?<!\w)"
            + re.escape(brand)
            + r"(?!\w)",
            re.IGNORECASE
        )

        for match in pattern.finditer(text):

            value = match.group(0)

            add_entity(
                "brand",
                value,
                match.start(),
                match.end(),
                extra={
                    "brand_name": brand
                }
            )

    # ========================================================
    # SORT ENTITIES
    # ========================================================

    entities.sort(
        key=lambda entity: (
            entity["start"],
            entity["end"]
        )
    )

    return entities


# ============================================================
# BACKWARD-COMPATIBLE URL FUNCTION
# ============================================================

def find_urls(text: str):
    """Pull URLs/domains from OCR text.

    Kept for backward compatibility with the older OCR module.

    Returns:
        List[str]
    """

    if not text:
        return []

    urls = []

    # Full URLs.
    for match in URL_PATTERN.finditer(text):

        value = clean_entity(
            match.group(0)
        )

        if value:
            urls.append(value)

    # Bare domains.
    for match in DOMAIN_PATTERN.finditer(text):

        start = match.start()
        end = match.end()

        value = clean_entity(
            match.group(0)
        )

        # Skip if already inside an email.
        if EMAIL_PATTERN.fullmatch(value):
            continue

        # Skip if part of a URL.
        already_url = any(
            start >= url_match.start()
            and end <= url_match.end()
            for url_match in URL_PATTERN.finditer(text)
        )

        if already_url:
            continue

        if value not in urls:
            urls.append(value)

    return urls


# ============================================================
# HIGH-LEVEL IMAGE ANALYSIS
# ============================================================

def analyze_image(
    src,
    box=None,
    langs=("en",)
):
    """Run the complete image -> OCR -> entity pipeline.

    This is the recommended entry point for the mobile
    screenshot workflow.

    Pipeline:

        image
          |
          v
        OCR
          |
          +--> text
          |
          +--> tokens
          |
          v
        entities

    Returns:

        {
            "text": "...",

            "tokens": [
                {
                    "text": "...",
                    "confidence": 0.98,
                    "bbox": [...],
                    "char_start": 0,
                    "char_end": 5
                }
            ],

            "entities": [
                {
                    "type": "url",
                    "value": "https://...",
                    "normalized": "https://...",
                    "ocr_confidence": 0.94,
                    "context": "...",
                    "start": 10,
                    "end": 30
                }
            ]
        }
    """

    start = time.time()

    # --------------------------------------------------------
    # ONE AND ONLY ONE OCR PASS.
    # --------------------------------------------------------

    ocr_result = extract_text(
        src,
        box=box,
        langs=langs,
        return_confidence=True
    )

    text = ocr_result["text"]

    tokens = ocr_result["tokens"]

    # --------------------------------------------------------
    # Extract entities from reconstructed OCR text.
    #
    # Pass tokens so entity confidence can be mapped directly
    # back to EasyOCR regions.
    # --------------------------------------------------------

    entities = extract_entities(
        text,
        tokens
    )

    log(
        f"Entity extraction complete: "
        f"{len(entities)} entities found"
    )

    log(
        f"Full image analysis completed in "
        f"{time.time() - start:.1f}s"
    )

    return {
        "text": text,
        "tokens": tokens,
        "entities": entities
    }


# ============================================================
# OPTIONAL TERMINAL DEBUGGING
# ============================================================

def print_entities(entities):
    """Pretty-print extracted entities to the terminal."""

    if not entities:

        print(
            "[ocr] No entities found.",
            flush=True
        )

        return

    print(
        "[ocr] Extracted entities:",
        flush=True
    )

    for entity in entities:

        confidence = entity.get(
            "ocr_confidence"
        )

        if confidence is None:
            confidence_text = "N/A"
        else:
            confidence_text = (
                f"{confidence:.4f}"
            )

        print(
            f"  [{entity['type']}] "
            f"{entity['value']} "
            f"| OCR confidence="
            f"{confidence_text}",
            flush=True
        )


# ============================================================
# MODULE TEST
# ============================================================

if __name__ == "__main__":

    print(
        "ocr.py loaded successfully."
    )

    print(
        "Use analyze_image(image_path) "
        "to run the complete pipeline."
    )