"""Backward-compatible entry point for the staged service."""

from .service import analyze_image


def analyze(src, box=None, classify="full"):
    return analyze_image(src, box=box, classify=classify)
