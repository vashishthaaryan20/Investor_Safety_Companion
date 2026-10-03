"""Request hardening for the SANGYAN Shield API: input limits, image checks, safe errors.

Screenshots and message text are handled in memory only and never written to logs.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
import traceback
from collections import deque
from io import BytesIO

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError

log = logging.getLogger("sangyan.api")

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MIN_IMAGE_SIDE = 16
# Multipart/base64 overhead on top of the largest allowed image.
MAX_BODY_BYTES = 15 * 1024 * 1024
MAX_TEXT_CHARS = 20_000

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}

# Pillow refuses images this large outright, before decoding any pixels.
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

PRODUCTION = os.getenv("SANGYAN_ENV", "development").lower() == "production"

RATE_LIMIT_REQUESTS = int(os.getenv("SANGYAN_RATE_LIMIT", "30"))
RATE_LIMIT_WINDOW_S = 60.0

MSG_UNREADABLE = "The uploaded file is not a readable image. Try a normal screenshot (JPG or PNG)."
MSG_UNSUPPORTED = "This image type isn't supported. Use a JPG, PNG, or WebP screenshot."
MSG_TOO_LARGE = "The image is too large. Use a screenshot under 10 MB."
MSG_TOO_MANY_PIXELS = "The image is too large to check. Crop it to just the message."
MSG_TOO_SMALL = "The image is too small to read."
MSG_EMPTY = "The uploaded image is empty."
MSG_INVALID = "Some request details were missing or invalid."
MSG_BUSY = "Too many checks in a short time. Please wait a minute and try again."
MSG_INTERNAL = "Something went wrong while checking. Please try again."
MSG_HTTPS = "This server only accepts secure (HTTPS) connections."

_CAPTURE_SOURCE = re.compile(r"^[a-z0-9-]{1,40}$")


def safe_label(value: str | None) -> str:
    """Header values end up in logs; anything unexpected is replaced, never echoed."""
    if value and _CAPTURE_SOURCE.match(value):
        return value
    return "unknown"


def where(exc: BaseException) -> str:
    """File and line of an exception, without its message (which may quote user content)."""
    frames = traceback.extract_tb(exc.__traceback__)
    if not frames:
        return type(exc).__name__
    last = frames[-1]
    return f"{type(exc).__name__} at {os.path.basename(last.filename)}:{last.lineno}"


def decode_image(data: bytes) -> tuple[Image.Image, str]:
    """Validate and decode an upload. Returns an RGB image and its detected format.

    The format comes from the file's own bytes, not its name or declared content type.
    """
    if not data:
        raise HTTPException(status_code=400, detail=MSG_EMPTY)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=MSG_TOO_LARGE)
    try:
        with Image.open(BytesIO(data)) as probe:
            image_format = probe.format or ""
            width, height = probe.size
            if image_format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(status_code=415, detail=MSG_UNSUPPORTED)
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail=MSG_TOO_MANY_PIXELS)
            if min(width, height) < MIN_IMAGE_SIDE:
                raise HTTPException(status_code=400, detail=MSG_TOO_SMALL)
            probe.verify()
        # verify() leaves the image unusable; decode again to catch truncated pixel data.
        with Image.open(BytesIO(data)) as image:
            image.load()
            return ImageOps.exif_transpose(image).convert("RGB"), image_format
    except HTTPException:
        raise
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=413, detail=MSG_TOO_MANY_PIXELS) from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError) as exc:
        raise HTTPException(status_code=400, detail=MSG_UNREADABLE) from exc


class RateLimiter:
    """Sliding-window request counter per client address, kept in memory."""

    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(client, deque())
            while hits and now - hits[0] > self.window_s:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:
                stale = [key for key, value in self._hits.items() if not value]
                for key in stale:
                    del self._hits[key]
            return True


def _error(status: int, detail: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail}, headers=headers)


def install(app: FastAPI) -> None:
    """Attach request limits, security headers and safe error responses to the app."""
    limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_S)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if PRODUCTION:
            scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
            if scheme != "https":
                return _error(400, MSG_HTTPS)

        if request.method == "POST":
            length = request.headers.get("content-length")
            if length is not None:
                if not length.isdigit():
                    return _error(400, MSG_INVALID)
                if int(length) > MAX_BODY_BYTES:
                    return _error(413, MSG_TOO_LARGE)
            client = request.client.host if request.client else "unknown"
            if not limiter.allow(client):
                return _error(429, MSG_BUSY, {"Retry-After": str(int(RATE_LIMIT_WINDOW_S))})

        response = await call_next(request)
        # Results describe someone's private messages; keep them out of shared caches.
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if PRODUCTION:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        # FastAPI's default reply echoes the submitted values, which can be the user's message.
        fields = sorted(
            {".".join(str(part) for part in error.get("loc", ())[1:]) or "body" for error in exc.errors()}
        )
        return JSONResponse(status_code=422, content={"detail": MSG_INVALID, "fields": fields})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        log.error("Unhandled error on %s: %s", request.url.path, where(exc))
        return _error(500, MSG_INTERNAL)
