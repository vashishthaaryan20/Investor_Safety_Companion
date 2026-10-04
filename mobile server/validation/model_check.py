"""Loads each trained model on its own and records raw predictions (Phase 1, tasks 1-2).

    python validation/model_check.py [--report validation/model_check.json]

Nothing here goes through FastAPI or the app. Scores are the models' raw outputs; they are
not calibrated probabilities.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import warnings
from io import BytesIO
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from phishing_detector import artifacts  # noqa: E402

TEXT_CASES = {
    "legitimate": "Your SIP of Rs 5000 in XYZ Flexi Cap Fund has been processed. Units will be allotted at the applicable NAV.",
    "known_phishing": "Dear customer, your SBI account will be blocked today. Update your KYC immediately at http://sbi-kyc-update.top/verify to avoid suspension.",
    "suspicious_url": "Check this http://bit.ly/3xR9fake",
    "empty": "",
    "whitespace_only": "   \n\t  ",
    "unusual_formatting": "UR ACC0UNT  W1LL B3 SUSP3NDED!!! 🚨🚨\n\nCL1CK >>> hxxp://secure-login[.]verify-acct.co <<<\u200b\u200b NOW",
}
URL_CASES = {
    "legitimate": "https://www.hdfcbank.com/personal/pay/cards",
    "suspicious": "http://hdfc-netbanking-secure.verify-login.top/account/update.php?id=8812",
    "ip_host": "http://185.243.115.84/login/sbi/index.html",
    "unusual_formatting": "HTTPS://WWW.PAYTM.COM.SECURE-REWARD.XYZ/CLAIM",
    "empty": "",
    "invalid": "not a url at all",
}


def timed(fn, repeats):
    times, result = [], None
    for _ in range(repeats):
        started = time.perf_counter()
        result = fn()
        times.append((time.perf_counter() - started) * 1000)
    return result, round(statistics.median(times), 2)


def audit_sklearn(kind):
    import joblib

    path = artifacts.model_path(kind)
    entry = {"file": path.name, "exists": path.is_file()}
    if not entry["exists"]:
        return entry, None
    entry["size_mb"] = round(path.stat().st_size / 1e6, 2)
    entry["sha256"] = artifacts.file_sha256(path)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        started = time.perf_counter()
        model = joblib.load(path)
        entry["load_ms"] = round((time.perf_counter() - started) * 1000)
    entry["load_warnings"] = sorted({str(w.message)[:200] for w in caught})
    vectorizer, classifier = model.steps[0][1], model.steps[-1][1]
    entry.update(
        format="joblib (scikit-learn Pipeline)",
        steps=[f"{name}: {type(step).__name__}" for name, step in model.steps],
        analyzer=vectorizer.analyzer,
        ngram_range=list(vectorizer.ngram_range),
        lowercase=vectorizer.lowercase,
        vocabulary_size=len(vectorizer.vocabulary_),
        classes=[str(c) for c in classifier.classes_],
        phishing_index=list(classifier.classes_).index("phishing"),
        output="predict_proba(list[str]) -> [[p_legitimate, p_phishing]]",
    )
    return entry, model


def run_sklearn(model, cases, prepare=lambda value: value):
    index = list(model.classes_).index("phishing")
    rows = {}
    for name, value in cases.items():
        try:
            prepared = prepare(value)
            proba, ms = timed(lambda p=prepared: model.predict_proba([p])[0], 20)
            rows[name] = {
                "input": value,
                "model_input": prepared,
                "phishing_score": round(float(proba[index]), 4),
                "predicted": str(model.classes_[int(proba.argmax())]),
                "median_ms": ms,
            }
        except Exception as exc:  # recorded, not hidden
            rows[name] = {"input": value, "error": f"{type(exc).__name__}: {exc}"[:200]}
    return rows


def url_input(value):
    # Same rule as url_ml.detect: the model was trained on full http(s) URLs.
    return value if value.startswith(("http://", "https://")) else "https://" + value


def audit_image():
    import torch

    path = artifacts.model_path("image")
    entry = {"file": path.name, "exists": path.is_file()}
    if not entry["exists"]:
        return entry, None
    from phishing_detector.config import CLASS_NAMES
    from phishing_detector.model import load_trained_model

    state = torch.load(path, map_location="cpu", weights_only=True)
    entry.update(
        size_mb=round(path.stat().st_size / 1e6, 2),
        sha256=artifacts.file_sha256(path),
        format="PyTorch state_dict (ResNet50, fc -> 2 classes)",
        tensors=len(state),
        fc_weight_shape=list(state["fc.weight"].shape),
        classes=CLASS_NAMES,
        preprocessing="RGB, resize 224x224, ToTensor, ImageNet mean/std normalise",
        output="softmax over [legitimate, phishing]",
    )
    started = time.perf_counter()
    model = load_trained_model(str(path))
    entry["load_ms"] = round((time.perf_counter() - started) * 1000)
    entry["parameters"] = sum(p.numel() for p in model.parameters())
    return entry, model


def image_cases():
    from PIL import Image

    from run_validation import render

    legit = TEXT_CASES["legitimate"]
    phish = TEXT_CASES["known_phishing"]
    return {
        "legitimate_message_screenshot": render({"text": legit}),
        "phishing_message_screenshot": render({"text": phish}),
        "blank_image": render({"text": ""}),
        "noise_image": render({"image": "noise"}),
        "tiny_image": _png(Image.new("RGB", (10, 10), "white")),
        "invalid_bytes": b"this is not an image",
    }


def _png(image):
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def run_image(model, cases):
    from PIL import Image

    from phishing_detector.model import predict_image

    rows = {}
    for name, data in cases.items():
        try:
            image = Image.open(BytesIO(data))
            image.load()
            (label, confidence, probs), ms = timed(lambda i=image: predict_image(model, i), 5)
            rows[name] = {
                "phishing_score": round(probs["phishing"] / 100, 4),
                "predicted": label,
                "median_ms": ms,
            }
        except Exception as exc:
            rows[name] = {"error": f"{type(exc).__name__}: {exc}"[:200]}
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    import sklearn
    import torch

    report = {"environment": {"python": sys.version.split()[0], "scikit_learn": sklearn.__version__, "torch": torch.__version__}}
    text_entry, text_model = audit_sklearn("text")
    url_entry, url_model = audit_sklearn("url")
    image_entry, image_model = audit_image()
    report["models"] = {"text": text_entry, "url": url_entry, "image": image_entry}
    report["predictions"] = {
        "text": run_sklearn(text_model, TEXT_CASES) if text_model else None,
        "url": run_sklearn(url_model, URL_CASES, url_input) if url_model else None,
        "image": run_image(image_model, image_cases()) if image_model else None,
    }
    if text_model:
        bad = {}
        for name, value in {"none": None, "integer": 123}.items():
            try:
                text_model.predict_proba([value])
                bad[name] = "accepted"
            except Exception as exc:
                bad[name] = f"{type(exc).__name__}: {exc}"[:160]
        report["predictions"]["text_non_string"] = bad
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.report:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
