"""phishing-detector - screenshot OCR + phishing check."""

from .ocr import extract_text, find_urls

__all__ = ["extract_text", "find_urls"]
