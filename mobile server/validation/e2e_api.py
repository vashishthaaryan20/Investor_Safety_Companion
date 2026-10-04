"""Laptop end-to-end checks and performance measurements against a running SANGYAN API.

    python validation/e2e_api.py http://127.0.0.1:8001 --report validation/e2e_report.json
    python validation/e2e_api.py http://127.0.0.1:8002 --expect-partial   # server without models

Every case goes through the real HTTP API: OCR, the trained models, the risk layer and
response validation. Phone screenshots are simulated as 1080x2400 JPEGs at the app's
upload quality (0.8), so upload sizes match what the phone sends.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import textwrap
import time
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_validation import send_text  # noqa: E402

LEGIT = (
    "Your SIP of Rs 5,000 in XYZ Flexi Cap Fund has been processed on 05-Oct. "
    "NAV and units will be updated in your next account statement."
)
PHISHING = (
    "URGENT: Your SBI account will be blocked today. Update your KYC now at "
    "http://sbi-kyc-update.xyz and share the OTP sent to your phone."
)
MALICIOUS_URL = "Congratulations! Claim your reward at HTTPS://WWW.PAYTM.COM.SECURE-REWARD.XYZ/CLAIM"
OFFICIAL_URL = "Your statement is ready. Log in at https://www.hdfcbank.com/personal/pay/cards to view it."
SCREENSHOT_SCAM = (
    "VIP Stock Tips Group: Guaranteed 5X returns in 7 days! SEBI approved. Only 15 minutes "
    "left, invest now. Pay Rs 9,999 via UPI to join: bit.ly/vip-trade-now"
)


def phone_screenshot(text: str = "", blur: int = 0, quality: int = 80) -> bytes:
    image = Image.new("RGB", (1080, 2400), "#ECE5DD")
    if text:
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=44)
        lines = textwrap.wrap(text, width=38)
        draw.rounded_rectangle((40, 300, 1040, 340 + 64 * len(lines)), radius=28, fill="white")
        for index, line in enumerate(lines):
            draw.text((80, 320 + index * 64), line, fill="#111111", font=font)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def send_file(base: str, data: bytes, filename: str, mime: str, timeout: float = 120):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        f"{base}/api/v1/analyze",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "X-Capture-Source": "e2e"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except (ConnectionError, urllib.error.URLError) as exc:
        # The server answers 413 from Content-Length and closes before the body is sent,
        # which some clients only see as a dropped connection.
        status, raw = 0, json.dumps({"error": {"code": "connection_closed", "message": str(exc)}}).encode()
    elapsed = (time.perf_counter() - started) * 1000
    try:
        return status, json.loads(raw or b"{}"), elapsed
    except json.JSONDecodeError:
        return status, {"detail": "unreadable reply"}, elapsed


def summary(status: int, body: dict, ms: float, upload: int | None = None) -> dict:
    out = {"http": status, "ms": round(ms)}
    if upload is not None:
        out["upload_bytes"] = upload
    if status != 200:
        out["error"] = body.get("error")
        return out
    out.update(
        level=body["risk"]["level"],
        category=body["risk"]["category"],
        score=body["risk"]["score"],
        classification=body["classification"],
        analysis_status=body["analysis_status"],
        read_confidence=body["risk"]["confidence"],
        signals=[s["id"] for s in body["signals"]],
        models={d["name"]: d["tier"] or d["status"] for d in body["detectors"] if d["name"] in {"text_ml", "url_ml", "image_classifier"}},
        unavailable=body["metadata"]["unavailable_checks"],
        server_ms=body["metadata"]["processing_time_ms"],
    )
    return out


def check(name: str, result: dict, ok: bool, results: list) -> None:
    result["pass"] = bool(ok)
    results.append({"case": name, **result})
    print(f"{'PASS' if ok else 'FAIL'}  {name:28} {json.dumps({k: v for k, v in result.items() if k not in {'pass', 'signals', 'unavailable'}})}")


def run_cases(base: str, expect_partial: bool) -> list:
    results: list = []
    not_low = lambda r: r.get("category") in {"MEDIUM", "HIGH"}  # noqa: E731
    partial_ok = lambda r: (r.get("analysis_status") == "PARTIAL") == expect_partial  # noqa: E731

    r = summary(*send_text(base, LEGIT))
    check("text: legitimate SIP notice", r, r["http"] == 200 and r["category"] != "HIGH" and partial_ok(r), results)
    r = summary(*send_text(base, PHISHING))
    check("text: known phishing", r, r["http"] == 200 and r["category"] == "HIGH" and partial_ok(r), results)
    r = summary(*send_text(base, MALICIOUS_URL))
    check("text: suspicious URL", r, r["http"] == 200 and not_low(r) and partial_ok(r), results)
    r = summary(*send_text(base, OFFICIAL_URL))
    check("text: official bank URL", r, r["http"] == 200 and r["category"] != "HIGH", results)
    r = summary(*send_text(base, "   "))
    check("text: empty", r, r["http"] in {200, 422} and r.get("category") in {None, "UNKNOWN"}, results)
    r = summary(*send_text(base, "x" * 25_000))
    check("text: too long", r, r["http"] in {413, 422}, results)

    shot = phone_screenshot(SCREENSHOT_SCAM)
    r = summary(*send_file(base, shot, "shot.jpg", "image/jpeg"), upload=len(shot))
    check("image: readable scam", r, r["http"] == 200 and not_low(r) and partial_ok(r), results)
    shot = phone_screenshot(LEGIT)
    r = summary(*send_file(base, shot, "shot.jpg", "image/jpeg"), upload=len(shot))
    check("image: readable legitimate", r, r["http"] == 200 and r["category"] != "HIGH", results)
    shot = phone_screenshot(SCREENSHOT_SCAM, blur=14)
    r = summary(*send_file(base, shot, "blur.jpg", "image/jpeg"), upload=len(shot))
    check("image: poor readability", r, r["http"] == 200 and r["category"] == "UNKNOWN", results)
    shot = phone_screenshot()
    r = summary(*send_file(base, shot, "blank.jpg", "image/jpeg"), upload=len(shot))
    check("image: blank", r, r["http"] == 200 and r["category"] == "UNKNOWN", results)

    r = summary(*send_file(base, b"definitely not an image", "x.jpg", "image/jpeg"))
    check("invalid: not an image", r, r["http"] == 400, results)
    gif = BytesIO()
    Image.new("RGB", (64, 64)).save(gif, format="GIF")
    r = summary(*send_file(base, gif.getvalue(), "x.gif", "image/gif"))
    check("invalid: unsupported GIF", r, r["http"] == 415, results)
    big = BytesIO()
    Image.effect_noise((3000, 3000), 100).convert("RGB").save(big, format="PNG")
    payload = big.getvalue() + b"\0" * max(0, 10 * 1024 * 1024 + 1 - len(big.getvalue()))
    r = summary(*send_file(base, payload, "big.png", "image/png"), upload=len(payload))
    check("invalid: over 10 MB", r, r["http"] in {413, 0}, results)
    return results


def measure(base: str, runs: int) -> dict:
    def stats(values):
        values = sorted(values)
        return {
            "n": len(values),
            "median_ms": round(statistics.median(values)),
            "p95_ms": round(values[max(0, int(len(values) * 0.95) - 1)]),
            "max_ms": round(values[-1]),
        }

    text_total, text_server = [], []
    for _ in range(runs * 4):
        status, body, ms = send_text(base, PHISHING)
        text_total.append(ms)
        text_server.append(body["metadata"]["processing_time_ms"])
    shot = phone_screenshot(SCREENSHOT_SCAM)
    image_total, image_ocr, image_server = [], [], []
    for _ in range(runs):
        status, body, ms = send_file(base, shot, "shot.jpg", "image/jpeg")
        image_total.append(ms)
        image_ocr.append(body["metadata"]["ocr_time_ms"])
        image_server.append(body["metadata"]["processing_time_ms"])
    sizes = {f"jpeg_q{q}": len(phone_screenshot(SCREENSHOT_SCAM, quality=q)) for q in (60, 80, 95)}
    png = BytesIO()
    Image.open(BytesIO(phone_screenshot(SCREENSHOT_SCAM, quality=95))).save(png, format="PNG")
    sizes["png"] = len(png.getvalue())
    return {
        "text_round_trip": stats(text_total),
        "text_server": stats(text_server),
        "screenshot_round_trip": stats(image_total),
        "screenshot_ocr": stats(image_ocr),
        "screenshot_server": stats(image_server),
        "screenshot_upload_bytes_1080x2400": sizes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base", nargs="?", default="http://127.0.0.1:8001")
    parser.add_argument("--expect-partial", action="store_true", help="the server runs without trained models")
    parser.add_argument("--runs", type=int, default=5, help="screenshot repetitions for timing")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    with urllib.request.urlopen(f"{args.base}/api/v1/health", timeout=10) as response:
        health = json.loads(response.read())
    print("Server", health["version"], "contract", health["contract_version"])
    results = run_cases(args.base, args.expect_partial)
    performance = None if args.expect_partial else measure(args.base, args.runs)
    passed = sum(r["pass"] for r in results)
    print(f"\n{passed}/{len(results)} passed")
    if performance:
        print(json.dumps(performance, indent=2))
    if args.report:
        report = {"health": health, "cases": results, "performance": performance}
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
