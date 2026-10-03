"""Stage 1: pure-text entity extraction; no OCR/model dependencies."""

import re
from urllib.parse import urlsplit, urlunsplit

CONTEXT_CHARS = 100

# ENTITY REGEX PATTERNS

# URL

# Unicode labels and arbitrary suffixes; candidates are not proof of registration.
DOMAIN_TEXT = r"(?:[^\W_](?:[\w-]{0,61}[^\W_])?\.)+(?:[^\W_][\w-]{1,62})"
URL_PATTERN = re.compile(r"\b(?:https?://|www\.)[^\s<>\"'`]+", re.IGNORECASE)
DOMAIN_PATTERN = re.compile(
    r"(?<![\w@.-])" + DOMAIN_TEXT + r"(?::\d{1,5})?(?:[/?#][^\s<>\"'`]*)?",
    re.IGNORECASE,
)

# Email

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


# Indian / international phone numbers

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


# UPI / payment ID
# Example:
#     user@oksbi
#     name@ybl
#     abc@paytm

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
    re.IGNORECASE,
)


# Generic UPI-like ID
# This is intentionally broader but should be filtered against
# email addresses.

GENERIC_PAYMENT_ID_PATTERN = re.compile(
    r"\b"
    r"[A-Za-z0-9._-]{2,100}"
    r"@[A-Za-z][A-Za-z0-9._-]{2,30}"
    r"\b"
)


# Bank account number
# We mainly trigger this when the number is near bank/account
# terminology to avoid treating every 9-18 digit number as an
# account number.

BANK_ACCOUNT_PATTERN = re.compile(
    r"(?:"
    r"(?:account|a/c|acct)"
    r"(?:\s*(?:number|no\.?|#))?"
    r"\s*[:\-]?\s*"
    r")"
    r"(\d{9,18})",
    re.IGNORECASE,
)


# IFSC

IFSC_PATTERN = re.compile(
    r"\b"
    r"[A-Z]{4}0[A-Z0-9]{6}"
    r"\b",
    re.IGNORECASE,
)


# Bitcoin

BITCOIN_PATTERN = re.compile(
    r"\b(?:"
    r"bc1[a-zA-HJ-NP-Z0-9]{20,87}"
    r"|"
    r"[13][a-km-zA-HJ-NP-Z1-9]{25,34}"
    r")\b"
)


# Ethereum

ETHEREUM_PATTERN = re.compile(r"\b0x[a-fA-F0-9]{40}\b")


# SECRET / SENSITIVE INFORMATION PATTERNS

SECRET_PATTERNS = {
    "otp": re.compile(r"\b(?:otp|one[\s-]?time[\s-]?password)\b", re.IGNORECASE),
    "pin": re.compile(r"\b(?:pin|upi[\s-]?pin|mpin)\b", re.IGNORECASE),
    "cvv": re.compile(r"\b(?:cvv|cvc|cvv2|security[\s-]?code)\b", re.IGNORECASE),
    "password": re.compile(
        r"\b(?:password|passcode|login[\s-]?password)\b", re.IGNORECASE
    ),
    "card_number": re.compile(
        r"\b(?:card[\s-]?"
        r"(?:number|no\.?|num))\b",
        re.IGNORECASE,
    ),
}


# SECRET REQUEST PATTERNS

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
    re.IGNORECASE,
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
    re.IGNORECASE,
)


# BRAND LIST

# This is deliberately configurable.
# Add brands relevant to your phishing detection dataset here.
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


# ENTITY CLEANING


def clean_entity(value):
    """Remove punctuation accidentally captured around entities."""

    if value is None:
        return ""

    value = value.strip()

    # Common punctuation at the end of OCR-extracted entities.
    value = value.rstrip(".,;:!?)]}>\"'`")

    # Opening brackets that accidentally surround an entity.
    value = value.lstrip("([{<\"'`")

    return value.strip()


# ENTITY NORMALIZATION


def normalize_entity(entity_type, value):
    """Create a normalized representation of an entity."""

    value = clean_entity(value)

    if entity_type in {
        "email",
        "payment_id",
        "ifsc",
    }:
        return value.lower()

    if entity_type in {"url", "domain"}:
        parsed = urlsplit(value if "://" in value else "https://" + value)
        return urlunsplit(
            (
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                parsed.path,
                parsed.query,
                parsed.fragment,
            )
        )

    if entity_type == "phone":
        # Keep leading '+' if present, remove formatting.
        if value.startswith("+"):
            return "+" + re.sub(r"\D", "", value)

        return re.sub(r"\D", "", value)

    if entity_type == "bank_account":
        return re.sub(r"\D", "", value)

    return value


# OCR CONFIDENCE MAPPING


def get_entity_ocr_confidence(start, end, ocr_tokens):
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
        token_start = token.get("char_start")

        token_end = token.get("char_end")

        if token_start is None or token_end is None:
            continue

        # Character span overlap.
        if start < token_end and end > token_start:
            overlapping.append(float(token["confidence"]))

    if not overlapping:
        return None

    return min(overlapping)


# ENTITY CONTEXT


def get_context(text, start, end, context_chars=CONTEXT_CHARS):
    """Return text surrounding an entity."""

    left = max(0, start - context_chars)

    right = min(len(text), end + context_chars)

    return text[left:right].strip()


# ENTITY EXTRACTION


def extract_entities(text, ocr_tokens=None):
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

    # Prevent duplicate entities.

    seen = set()

    def add_entity(entity_type, value, start, end, extra=None):
        """Add an entity while avoiding duplicates."""

        raw_value = value
        value = clean_entity(value)
        if value:
            start += raw_value.find(value)

        if not value:
            return

        # Recalculate end after cleaning.
        # The original regex span is still used for confidence.
        clean_end = min(end, start + len(value))

        normalized = normalize_entity(entity_type, value)

        key = (entity_type, normalized, start)

        if key in seen:
            return

        seen.add(key)

        confidence = get_entity_ocr_confidence(start, end, ocr_tokens)

        entity = {
            "type": entity_type,
            "value": value,
            "normalized": normalized,
            "ocr_confidence": confidence,
            "context": get_context(text, start, end),
            "start": start,
            "end": clean_end,
        }

        if extra:
            entity.update(extra)

        entities.append(entity)

    # EMAILS

    email_spans = []

    for match in EMAIL_PATTERN.finditer(text):
        value = match.group(0)

        start = match.start()
        end = match.end()

        email_spans.append((start, end))

        add_entity("email", value, start, end)

    # URLS

    url_spans = []

    for match in URL_PATTERN.finditer(text):
        value = clean_entity(match.group(0))

        start = match.start()
        end = start + len(value)

        url_spans.append((start, end))

        add_entity("url", value, start, end)

    # DOMAINS

    for match in DOMAIN_PATTERN.finditer(text):
        start = match.start()
        end = match.end()

        value = clean_entity(match.group(0))

        # Ignore domains that are part of an email.
        inside_email = any(
            start >= email_start and end <= email_end
            for email_start, email_end in email_spans
        )

        if inside_email:
            continue

        # Ignore domains that are already part of a URL.
        inside_url = any(
            start < url_end and end > url_start for url_start, url_end in url_spans
        )

        if inside_url:
            continue

        add_entity("domain", value, start, end)

    # PHONE NUMBERS

    for match in PHONE_PATTERN.finditer(text):
        value = clean_entity(match.group(0))

        start = match.start()
        end = start + len(value)

        digits = re.sub(r"\D", "", value)

        # Avoid treating obvious long account/card numbers
        # as phone numbers.
        if len(digits) < 10 or len(digits) > 13:
            continue

        add_entity("phone", value, start, end)

    # UPI / PAYMENT IDS

    payment_spans = []

    # First detect known payment handles.

    for match in PAYMENT_ID_PATTERN.finditer(text):
        start = match.start()
        end = match.end()

        value = clean_entity(match.group(0))

        if any(start < b and end > a for a, b in email_spans):
            continue

        payment_spans.append((start, end))

        add_entity("payment_id", value, start, end)

    # Then detect generic payment-style IDs.

    for match in GENERIC_PAYMENT_ID_PATTERN.finditer(text):
        start = match.start()
        end = match.end()

        value = clean_entity(match.group(0))

        # Don't classify normal email addresses as payment IDs.
        inside_email = any(
            start >= email_start and end <= email_end
            for email_start, email_end in email_spans
        )

        if inside_email:
            continue

        # Don't duplicate known payment IDs.
        already_payment = any(
            start == payment_start and end == payment_end
            for payment_start, payment_end in payment_spans
        )

        if already_payment:
            continue

        add_entity("payment_id", value, start, end)

    # BANK ACCOUNT NUMBERS

    for match in BANK_ACCOUNT_PATTERN.finditer(text):
        # Group 1 contains the actual account number.
        value = match.group(1)

        start = match.start(1)
        end = match.end(1)

        add_entity("bank_account", value, start, end)

    # IFSC

    for match in IFSC_PATTERN.finditer(text):
        value = match.group(0)

        add_entity("ifsc", value, match.start(), match.end())

    # BITCOIN

    for match in BITCOIN_PATTERN.finditer(text):
        value = match.group(0)

        add_entity(
            "crypto_wallet",
            value,
            match.start(),
            match.end(),
            extra={"crypto_type": "bitcoin"},
        )

    # ETHEREUM

    for match in ETHEREUM_PATTERN.finditer(text):
        value = match.group(0)

        add_entity(
            "crypto_wallet",
            value,
            match.start(),
            match.end(),
            extra={"crypto_type": "ethereum"},
        )

    # SECRET INFORMATION

    for secret_type, pattern in SECRET_PATTERNS.items():
        for match in pattern.finditer(text):
            value = match.group(0)

            start = match.start()
            end = match.end()

            context = get_context(text, start, end, context_chars=80)

            # Determine whether this appears to be an actual
            # request for the secret.

            request_window_start = max(0, start - 60)

            request_window_end = min(len(text), end + 60)

            left = (
                max(
                    text.rfind(".", 0, start),
                    text.rfind("\n", 0, start),
                    text.rfind(";", 0, start),
                )
                + 1
            )
            stops = [p for mark in ".\n;" if (p := text.find(mark, end)) >= 0]
            right = min(stops) if stops else len(text)
            request_window = text[
                max(left, request_window_start) : min(right, request_window_end)
            ]

            has_action = bool(SECRET_REQUEST_ACTIONS.search(request_window))

            has_negation = bool(SECRET_NEGATION_PATTERN.search(request_window))

            is_request = has_action and not has_negation

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
                },
            )

    # CARD NUMBER

    # Card numbers are detected separately because the keyword
    # "card number" and the actual number may occur separately.
    # Example:
    #     Card Number
    #     4111 1111 1111 1111

    card_keyword_pattern = re.compile(
        r"\bcard[\s-]?"
        r"(?:number|no\.?|num)"
        r"\b",
        re.IGNORECASE,
    )

    for keyword_match in card_keyword_pattern.finditer(text):
        search_start = keyword_match.end()

        search_end = min(len(text), search_start + 80)

        nearby = text[search_start:search_end]

        card_number_match = re.search(
            r"(?<!\d)"
            r"(?:\d[\s-]?){13,19}"
            r"(?!\d)",
            nearby,
        )

        if not card_number_match:
            continue

        raw_value = card_number_match.group(0)

        value = re.sub(r"[\s-]", "", raw_value)

        if not (13 <= len(value) <= 19):
            continue

        start = search_start + card_number_match.start()

        end = search_start + card_number_match.end()

        add_entity(
            "card_number",
            raw_value.strip(),
            start,
            end,
            extra={"secret_type": "card_number"},
        )

    # BRANDS

    for brand in BRANDS:
        pattern = re.compile(r"(?<!\w)" + re.escape(brand) + r"(?!\w)", re.IGNORECASE)

        for match in pattern.finditer(text):
            value = match.group(0)

            add_entity(
                "brand", value, match.start(), match.end(), extra={"brand_name": brand}
            )

    # SORT ENTITIES

    entities.sort(key=lambda entity: (entity["start"], entity["end"]))

    return entities


def find_urls(text):
    return list(
        dict.fromkeys(
            e["value"] for e in extract_entities(text) if e["type"] in {"url", "domain"}
        )
    )
