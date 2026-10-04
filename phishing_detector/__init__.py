"""Screenshot scam screening. Heavy dependencies load only for image analysis."""

from .entities import find_urls


def extract_text(*args, **kwargs):
    from .ocr import extract_text as run

    return run(*args, **kwargs)


def analyze(*args, **kwargs):
    from .pipeline import analyze as run

    return run(*args, **kwargs)


__all__ = ["analyze", "extract_text", "find_urls"]
