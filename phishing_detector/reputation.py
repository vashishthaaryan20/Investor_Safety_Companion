"""Opt-in Google Safe Browsing v4 lookup; never visits the suspect destination."""

import hashlib
import json
import os
import time
from collections import OrderedDict
from threading import Lock
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from .detectors import Detection, Finding, confidence

_CACHE = OrderedDict()
_LOCK = Lock()


def lookup(urls, key, timeout):
    payload = {
        "client": {"clientId": "sangyan-shield", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url} for url in urls],
        },
    }
    endpoint = "https://safebrowsing.googleapis.com/v4/threatMatches:find?" + urlencode(
        {"key": key}
    )
    request = Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def detect_reputation(entities, options, client=None):
    if not options.get("enabled"):
        return Detection(
            "safe_browsing", "disabled", detail="External lookup is opt-in"
        )
    key = os.getenv("SAFE_BROWSING_API_KEY")
    if not key:
        return Detection(
            "safe_browsing", "not_configured", detail="SAFE_BROWSING_API_KEY is missing"
        )
    candidates = {}
    for entity in entities:
        if entity["type"] not in {"url", "domain"}:
            continue
        value = entity["normalized"]
        value = value if "://" in value else "https://" + value
        try:
            parsed = urlsplit(value)
            valid = (
                parsed.scheme in {"http", "https"}
                and parsed.hostname
                and not parsed.username
                and not parsed.password
            )
        except ValueError:
            valid = False
        if valid and (
            value not in candidates
            or confidence(entity) > confidence(candidates[value])
        ):
            candidates[value] = entity
    if not candidates:
        return Detection("safe_browsing", "skipped", detail="No readable URLs")
    if len(candidates) > 50:
        return Detection(
            "safe_browsing", "unavailable", detail="Request exceeds 50 URL lookup limit"
        )
    fingerprint = hashlib.sha256(key.encode()).hexdigest()
    now, pending, hits = time.monotonic(), [], {}
    with _LOCK:
        for url in candidates:
            cached = _CACHE.get((fingerprint, url))
            if cached and cached[1] > now:
                hits[url] = cached[0]
            else:
                pending.append(url)
    if pending:
        try:
            response = (client or lookup)(
                pending, key, options.get("timeout_seconds", 2)
            )
            if not isinstance(response, dict) or not isinstance(
                response.get("matches", []), list
            ):
                raise TypeError("Malformed provider response")
            matches = {}
            for match in response.get("matches", []):
                url = match["threat"]["url"]
                if url not in pending:
                    raise ValueError("Provider returned an unrequested URL")
                ttl = max(
                    1,
                    min(
                        300, float(match.get("cacheDuration", "60s").removesuffix("s"))
                    ),
                )
                matches[url] = (str(match.get("threatType", "unsafe URL")), ttl)
            with _LOCK:
                for url in pending:
                    threat, ttl = matches.get(url, ("", 30))
                    hits[url] = threat
                    _CACHE[(fingerprint, url)] = (threat, now + ttl)
                while len(_CACHE) > 1024:
                    _CACHE.popitem(last=False)
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            # Do not log raw exceptions: provider URLs contain API credentials.
            return Detection(
                "safe_browsing",
                "unavailable",
                detail="Provider request failed or returned invalid data",
            )
    result = Detection(
        "safe_browsing",
        detail="URLs checked against Google Safe Browsing; no match does not establish safety",
    )
    for url, threat in hits.items():
        if threat:
            entity = candidates[url]
            certain = confidence(entity) >= 0.8
            result.findings.append(
                Finding(
                    "safe_browsing",
                    1 if certain else 0.5 * confidence(entity),
                    "Known unsafe URL" if certain else "Uncertain reputation match",
                    f"Google Safe Browsing reports {threat} for this URL.",
                    entity["value"],
                    hard_override=certain,
                )
            )
    return result
