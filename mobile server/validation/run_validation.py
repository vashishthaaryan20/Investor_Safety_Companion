"""Runs the labeled validation set against a running SANGYAN API (Milestone 8).

    python validation/run_validation.py http://127.0.0.1:8001 [--text-only] [--report out.json]

Each case is sent as pasted text and, unless --text-only, as a rendered screenshot through
OCR. The expectations in cases.json were written before running the engine; a failure is a
finding to report, not a reason to edit the case. Start the server with a high
SANGYAN_RATE_LIMIT, because a full run sends about 30 requests.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import textwrap
import time
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
CASES = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))
ORDER = {level: index for index, level in enumerate(CASES["levels"])}


def render(case: dict) -> bytes:
    """A plain chat-style screenshot of the case text, or a deliberately unreadable image."""
    kind = case.get("image")
    width, height = 1080, 720
    if kind == "noise":
        rng = random.Random(7)
        image = Image.frombytes(
            "L", (width, height), bytes(rng.randrange(256) for _ in range(width * height))
        ).convert("RGB")
    else:
        image = Image.new("RGB", (width, height), "white")
        if case.get("text"):
            draw = ImageDraw.Draw(image)
            font = ImageFont.load_default(size=40)
            draw.rounded_rectangle((40, 60, width - 40, height - 60), radius=28, fill="#E7F3EF")
            lines = textwrap.wrap(case["text"], width=42)
            for index, line in enumerate(lines):
                draw.text((80, 100 + index * 56), line, fill="#111111", font=font)
        if kind == "blur":
            image = image.filter(ImageFilter.GaussianBlur(9))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def post(url: str, body: bytes, content_type: str, timeout: float = 120) -> tuple[int, dict, float]:
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": content_type, "X-Capture-Source": "validation"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    elapsed = (time.perf_counter() - started) * 1000
    try:
        return status, json.loads(raw or b"{}"), elapsed
    except json.JSONDecodeError:
        return status, {"detail": "unreadable reply"}, elapsed


def send_text(base: str, text: str):
    return post(f"{base}/api/v1/analyze-text", json.dumps({"text": text}).encode(), "application/json")


def send_image(base: str, png: bytes):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"case.png\"\r\n"
        "Content-Type: image/png\r\n\r\n"
    ).encode() + png + f"\r\n--{boundary}--\r\n".encode()
    return post(f"{base}/api/v1/analyze", body, f"multipart/form-data; boundary={boundary}")


def evaluate(expect: dict, status: int, body: dict) -> list[str]:
    if status != 200:
        return [f"HTTP {status}: {body.get('detail')}"]
    problems = []
    if body.get("status") != expect["status"]:
        problems.append(f"status {body.get('status')} (expected {expect['status']})")
    level = body.get("risk", {}).get("level")
    if expect["status"] == "success" and level in ORDER:
        if "min_level" in expect and ORDER[level] < ORDER[expect["min_level"]]:
            problems.append(f"level {level} below {expect['min_level']}")
        if "max_level" in expect and ORDER[level] > ORDER[expect["max_level"]]:
            problems.append(f"level {level} above {expect['max_level']}")
    found = {s.get("id") for s in body.get("signals", [])}
    if expect.get("signals_any") and not found & set(expect["signals_any"]):
        problems.append(f"none of {expect['signals_any']} in {sorted(found)}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base", nargs="?", default="http://127.0.0.1:8000")
    parser.add_argument("--text-only", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    base = args.base.rstrip("/")

    with urllib.request.urlopen(f"{base}/api/v1/health", timeout=10) as response:
        health = json.loads(response.read())
    print(f"Server {health.get('version')} contract {health.get('contract_version')}")
    print(f"Engine: {json.dumps(health.get('engine', {}).get('degraded', []))}\n")

    rows = []
    for case in CASES["cases"]:
        modes = []
        if not case.get("image"):
            modes.append(("text", lambda c=case: send_text(base, c["text"])))
        if not args.text_only:
            modes.append(("image", lambda c=case: send_image(base, render(c))))
        for mode, send in modes:
            status, body, elapsed = send()
            problems = evaluate(case["expect"], status, body)
            meta = body.get("metadata", {})
            row = {
                "id": case["id"],
                "group": case["group"],
                "label": case["label"],
                "mode": mode,
                "http": status,
                "status": body.get("status"),
                "level": body.get("risk", {}).get("level"),
                "score": body.get("risk", {}).get("score"),
                "engine_level": body.get("risk", {}).get("engine_level"),
                "confidence": body.get("risk", {}).get("confidence"),
                "signals": [s.get("id") for s in body.get("signals", [])],
                "client_ms": round(elapsed),
                "server_ms": meta.get("processing_time_ms"),
                "ocr_ms": meta.get("ocr_time_ms"),
                "passed": not problems,
                "problems": problems,
            }
            rows.append(row)
            mark = "PASS" if row["passed"] else "FAIL"
            print(
                f"{mark}  {case['id']:<20} {mode:<5} {str(row['level']):<15} score={row['score']!s:<4} "
                f"conf={row['confidence']!s:<5} {row['client_ms']:>6} ms  {', '.join(problems)}"
            )

    passed = sum(r["passed"] for r in rows)
    image_ms = sorted(r["client_ms"] for r in rows if r["mode"] == "image" and r["http"] == 200)
    print(f"\n{passed}/{len(rows)} passed")
    if image_ms:
        print(
            f"Screenshot latency: median {image_ms[len(image_ms) // 2]} ms, "
            f"max {image_ms[-1]} ms over {len(image_ms)} requests"
        )
    if args.report:
        args.report.write_text(json.dumps({"health": health, "results": rows}, indent=2), encoding="utf-8")
        print(f"Report written to {args.report}")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
