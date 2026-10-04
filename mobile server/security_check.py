"""Security checks against a running SANGYAN Shield API.

    python security_check.py                         # http://127.0.0.1:8000
    python security_check.py http://127.0.0.1:8001   # another server
    python security_check.py --log server.log ...    # also scan the server's log output

Exits non-zero if any check fails. Uses only the standard library and Pillow.
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

# Planted in requests; it must never come back in a response or show up in the server log.
MARKER = "SANGYAN-PRIVATE-7731-OTP-482915"

results: list[tuple[bool, str]] = []


def check(ok: bool, name: str) -> None:
    results.append((ok, name))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")


def request(base: str, method: str, path: str, body: bytes | None = None, headers=None, timeout=120):
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def multipart(filename: str, content_type: str, data: bytes, field: str = "image"):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def upload(base, filename, content_type, data, extra_headers=None):
    body, headers = multipart(filename, content_type, data)
    headers.update(extra_headers or {})
    return request(base, "POST", "/api/v1/analyze", body, headers)


def post_json(base, path, payload):
    return request(
        base, "POST", path, json.dumps(payload).encode(), {"Content-Type": "application/json"}
    )


def image_bytes(fmt: str, size=(400, 200), text: str | None = None) -> bytes:
    image = Image.new("RGB", size, "white")
    if text:
        ImageDraw.Draw(image).text((10, 10), text, fill="black")
    out = BytesIO()
    image.save(out, fmt)
    return out.getvalue()


def detail(body: bytes) -> str:
    try:
        return str(json.loads(body).get("detail", ""))
    except (ValueError, AttributeError):
        return body.decode("utf-8", "replace")


def safe_error(status: int, body: bytes, expected: int) -> bool:
    """Right status, a plain-language message, and no internals or user content."""
    text = body.decode("utf-8", "replace")
    leaks = ("Traceback", 'File "', "Exception", "Error:", "\\\\", "/home/", "C:\\", MARKER)
    return status == expected and bool(detail(body)) and not any(leak in text for leak in leaks)


def run(base: str, log_path: Path | None) -> None:
    print(f"\nSANGYAN Shield security checks against {base}\n")

    print("Server basics")
    status, headers, _ = request(base, "GET", "/api/v1/health")
    check(status == 200, "health endpoint responds")
    lowered = {key.lower(): value for key, value in headers.items()}
    check(lowered.get("cache-control") == "no-store", "responses are marked no-store")
    check(lowered.get("x-content-type-options") == "nosniff", "nosniff header is set")

    print("\nMalformed and unexpected uploads")
    status, _, body = upload(base, "shot.png", "image/png", b"\x89PNG\r\n\x1a\n" + b"\x00garbage" * 40)
    check(safe_error(status, body, 400), f"corrupted PNG is rejected safely ({status})")

    jpeg = image_bytes("JPEG", text="hello")
    status, _, body = upload(base, "shot.jpg", "image/jpeg", jpeg[: len(jpeg) // 2])
    check(safe_error(status, body, 400), f"truncated JPEG is rejected safely ({status})")

    status, _, body = upload(base, "shot.jpg", "image/jpeg", f"not an image {MARKER}".encode())
    check(safe_error(status, body, 400), f"text disguised as .jpg is rejected safely ({status})")

    status, _, body = upload(base, "anim.gif", "image/gif", image_bytes("GIF"))
    check(safe_error(status, body, 415), f"GIF (unsupported format) is rejected ({status})")

    status, _, body = upload(base, "shot.bmp", "image/jpeg", image_bytes("BMP"))
    check(safe_error(status, body, 415), f"BMP mislabelled as JPEG is rejected by content ({status})")

    status, _, body = upload(base, "notes.txt", "text/plain", jpeg)
    check(safe_error(status, body, 415), f"non-image content type is rejected ({status})")

    status, _, body = upload(base, "empty.png", "image/png", b"")
    check(safe_error(status, body, 400), f"empty file is rejected ({status})")

    status, _, body = upload(base, "tiny.png", "image/png", image_bytes("PNG", size=(4, 4)))
    check(safe_error(status, body, 400), f"too-small image is rejected ({status})")

    status, _, body = request(base, "POST", "/api/v1/analyze", b"", {"Content-Type": "multipart/form-data; boundary=x"})
    check(safe_error(status, body, 422), f"missing image field is rejected ({status})")

    print("\nOversized uploads")
    big = b"\xff\xd8\xff\xe0" + b"\x00" * (11 * 1024 * 1024)
    status, _, body = upload(base, "big.jpg", "image/jpeg", big)
    check(safe_error(status, body, 413), f"11 MB upload is rejected ({status})")

    bomb = BytesIO()
    Image.new("L", (6000, 6000)).save(bomb, "PNG")
    status, _, body = upload(base, "bomb.png", "image/png", bomb.getvalue())
    check(
        safe_error(status, body, 413),
        f"36-megapixel image ({len(bomb.getvalue()) // 1024} KB file) is rejected before decoding ({status})",
    )

    status, _, body = request(
        base, "POST", "/api/v1/analyze-text", b"{}",
        {"Content-Type": "application/json", "Content-Length": str(50 * 1024 * 1024)},
    )
    check(status == 413, f"declared 50 MB body is refused up front ({status})")

    print("\nText and feedback validation")
    status, _, body = post_json(base, "/api/v1/analyze-text", {"text": "   "})
    check(safe_error(status, body, 422), f"blank text is rejected ({status})")

    status, _, body = post_json(base, "/api/v1/analyze-text", {"text": MARKER + "x" * 25_000})
    check(safe_error(status, body, 422), f"over-long text is rejected without echoing it ({status})")

    status, _, body = post_json(base, "/api/v1/analyze-text", {"txt": MARKER})
    check(safe_error(status, body, 422), f"wrong field name is rejected without echoing input ({status})")

    status, _, body = request(base, "POST", "/api/v1/analyze-text", b"{not json", {"Content-Type": "application/json"})
    check(safe_error(status, body, 422), f"malformed JSON is rejected ({status})")

    status, _, body = post_json(
        base, "/api/v1/feedback", {"analysis_id": "../../etc/passwd", "kind": "report_scam", "evidence_text": MARKER}
    )
    check(safe_error(status, body, 422), f"feedback with an invalid id is rejected ({status})")

    status, _, body = post_json(base, "/api/v1/feedback", {"analysis_id": str(uuid.uuid4()), "kind": "delete_all"})
    check(safe_error(status, body, 422), f"feedback with an unknown kind is rejected ({status})")

    status, _, body = request(
        base, "POST", "/api/v1/save-image-json",
        json.dumps({"image": "%%%not-base64%%%"}).encode(), {"Content-Type": "application/json"},
    )
    check(safe_error(status, body, 400), f"invalid base64 image is rejected ({status})")

    print("\nValid requests")
    message = f"Guaranteed 10x returns! Share OTP {MARKER} now. Join telegram tips group: https://bit.ly/x"
    status, _, body = post_json(base, "/api/v1/analyze-text", {"text": message, "focus": "links"})
    ok = status == 200 and json.loads(body).get("risk", {}).get("level") not in (None, "LOW_ATTENTION")
    check(ok, f"scam text is analyzed ({status})")

    status, _, body = upload(
        base, "msg.png", "image/png", image_bytes("PNG", size=(900, 200), text="Guaranteed returns, invest now"),
        {"X-Capture-Source": f"scan {MARKER} ${{jndi:x}} %0aFAKE LOG LINE", "X-Analysis-Focus": "<script>"},
    )
    check(status == 200, f"valid PNG with hostile headers is analyzed ({status})")

    print("\nNothing retained or leaked")
    uploads = Path(__file__).resolve().parent / "uploads"
    retained = [p.name for p in uploads.iterdir()] if uploads.exists() else []
    check(not retained, "no screenshots written to mobile server/uploads")
    if log_path:
        log_text = log_path.read_text(encoding="utf-8", errors="replace")
        check(MARKER not in log_text, "planted private text never appears in the server log")
        check("Traceback" not in log_text, "no stack traces in the server log")

    print("\nUnavailable backend")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        closed_port = probe.getsockname()[1]
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{closed_port}/api/v1/health", timeout=5)
        check(False, "connecting to a stopped server fails")
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        check(True, "connecting to a stopped server fails quickly (the app shows 'Can't connect')")

    print("\nRate limiting (runs last: it uses up this client's budget for a minute)")
    statuses = [post_json(base, "/api/v1/analyze-text", {"text": " "})[0] for _ in range(40)]
    check(429 in statuses, f"rapid repeated requests are throttled (first 429 after {statuses.index(429) if 429 in statuses else '-'} requests)")

    failed = [name for ok, name in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base", nargs="?", default="http://127.0.0.1:8000")
    parser.add_argument("--log", type=Path, help="server log file to scan for leaked text")
    args = parser.parse_args()
    run(args.base.rstrip("/"), args.log)
