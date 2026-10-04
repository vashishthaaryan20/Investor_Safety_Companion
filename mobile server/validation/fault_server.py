"""Test-only launcher: the real API with one switchable simulated failure (device tests).

    python validation/fault_server.py [--port 8001]
    python validation/fault_server.py --set ocr      # from another terminal; "none" to clear

Faults: none, ocr (OCR raises), engine (detection engine raises), invalid (engine returns
malformed output), timeout (engine hangs past SANGYAN_ANALYSIS_TIMEOUT_S), model (image
model treated as required and missing). The fault is read from a file on every request, so
it can be switched without restarting. Never use this to serve real users.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
FAULT_FILE = HERE / ".fault"
FAULTS = ("none", "ocr", "engine", "invalid", "timeout", "model")


def current_fault() -> str:
    try:
        value = FAULT_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return "none"
    return value if value in FAULTS else "none"


def install_faults() -> None:
    import engine_adapter
    from phishing_detector import ocr, service

    real_extract, real_analyze = ocr.extract_text, service.analyze_text

    def extract_text(*args, **kwargs):
        if current_fault() == "ocr":
            raise RuntimeError("simulated OCR failure")
        return real_extract(*args, **kwargs)

    def analyze_text(*args, **kwargs):
        fault = current_fault()
        if fault == "engine":
            raise RuntimeError("simulated inference failure")
        if fault == "invalid":
            return {"risk": {"level": "certain", "score": 900}}
        if fault == "timeout":
            time.sleep(engine_adapter.ANALYSIS_TIMEOUT_S + 5)
        return real_analyze(*args, **kwargs)

    ocr.extract_text, service.analyze_text = extract_text, analyze_text

    real_classify = engine_adapter.classify_screenshot

    def classify_screenshot(image):
        engine_adapter.REQUIRE_IMAGE_MODEL = current_fault() == "model"
        return real_classify(image)

    engine_adapter.classify_screenshot = classify_screenshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--set", choices=FAULTS, help="switch the fault of a running fault server")
    args = parser.parse_args()
    if args.set:
        FAULT_FILE.write_text(args.set, encoding="utf-8")
        print(f"fault = {args.set}")
        return

    os.environ.setdefault("SANGYAN_ANALYSIS_TIMEOUT_S", "10")
    sys.path.insert(0, str(HERE.parent))
    os.chdir(HERE.parent)
    import uvicorn

    import server

    install_faults()
    FAULT_FILE.write_text("none", encoding="utf-8")
    uvicorn.run(server.app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
