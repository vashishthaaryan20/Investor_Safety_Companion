"""Recover URL separators conservatively without changing OCR evidence."""

import re
from urllib.parse import urlsplit

# Whitespace around visible separators is repairable. Missing host dots are not.
LABEL = r"[^\W_](?:[\w-]{0,61}[^\W_])?"
HOST = rf"(?:{LABEL}(?:\s+\.\s*|\.))+(?:[^\W_][\w-]{{1,62}})"
SCHEME = r"https?\s*(?::\s*[/\\]\s*[/\\]|[lI|/\\]{2})\s*"
RECOVERABLE = re.compile(
    rf"\b(?:{SCHEME}|www\s*\.\s*){HOST}"
    r"(?::\d{1,5})?(?:[/?#]\s*[^\s<>\"'`]+)?"
    r"(?:(?<=[?&])\s+[A-Za-z0-9_.%~-]+=[^\s<>\"'`]+)?",
    re.IGNORECASE,
)
DAMAGED_SCHEME = re.compile(rf"\b{SCHEME}", re.IGNORECASE)
STANDARD = re.compile(r"\b(?:https?://|www\.)[^\s<>\"'`]+", re.IGNORECASE)


def trim(value):
    value = value.rstrip(".,;:!\"'`")
    for close, opening in ((")", "("), ("]", "["), ("}", "{")):
        while value.endswith(close) and value.count(close) > value.count(opening):
            value = value[:-1]
    return value


def scan_links(text):
    """Return links with raw spans plus uncertain fragments; never infer host dots."""
    links, occupied = [], []
    for pattern in (RECOVERABLE, STANDARD):
        for match in pattern.finditer(text):
            if any(
                match.start() < end and match.end() > start for start, end in occupied
            ):
                continue
            raw = trim(match.group())
            value = re.sub(r"\s+", "", raw)
            value = re.sub(
                r"^https?[^\w]*[lI|/\\]{2}",
                lambda m: (
                    "https://" if m.group().lower().startswith("https") else "http://"
                ),
                value,
                flags=re.IGNORECASE,
            )
            value = value.replace("\\", "/")
            if value.lower().startswith("www."):
                check = "https://" + value
            else:
                check = value
            try:
                host = urlsplit(check).hostname or ""
            except ValueError:
                continue
            if "." not in host:
                continue
            end = match.start() + len(raw)
            occupied.append((match.start(), end))
            links.append(
                {
                    "value": raw,
                    "normalized": value,
                    "start": match.start(),
                    "end": end,
                    "recovered": raw != value,
                }
            )
    candidates = []
    for match in DAMAGED_SCHEME.finditer(text):
        if any(start <= match.start() < end for start, end in occupied):
            continue
        # Retain the scheme and one following OCR line as evidence, not a guessed URL.
        tail_start = match.end()
        newline = text.find("\n", tail_start)
        end = min(len(text), tail_start + 160, newline if newline >= 0 else len(text))
        raw = text[match.start() : end].rstrip()
        candidates.append(
            {"value": raw, "start": match.start(), "end": match.start() + len(raw)}
        )
    return sorted(links, key=lambda e: e["start"]), candidates
