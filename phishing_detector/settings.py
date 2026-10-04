"""Validated detector configuration, independent of torch and training settings."""

import copy
import json
import math
import os
from pathlib import Path

from dotenv import load_dotenv

from .detectors import hostname
from .entities import normalize_entity
from .fusion import WEIGHTS

SRC_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SRC_DIR / ".env")


def validate_settings(value):
    settings = copy.deepcopy(value)
    if not isinstance(settings, dict):
        raise TypeError("Detection settings must be an object")
    brands = settings.get("brands", {})
    if not isinstance(brands, dict):
        raise TypeError("brands must map names/aliases to official domain lists")
    normalized = {}
    for name, domains in brands.items():
        if (
            not isinstance(name, str)
            or not name.strip()
            or not isinstance(domains, list)
            or not domains
        ):
            raise ValueError(
                "Every configured brand/alias needs a name and nonempty domain list"
            )
        hosts = [hostname(d) if isinstance(d, str) else "" for d in domains]
        if any(not host or "." not in host for host in hosts):
            raise ValueError(f"Invalid official domain for {name}")
        normalized[name.casefold().strip()] = sorted(set(hosts))
    settings["brands"] = normalized
    entries = settings.get("blocklist", [])
    if not isinstance(entries, list):
        raise TypeError("blocklist must be a list")
    allowed = {
        "url",
        "domain",
        "phone",
        "email",
        "payment_id",
        "bank_account",
        "crypto_wallet",
    }
    for entry in entries:
        if (
            not isinstance(entry, dict)
            or entry.get("type") not in allowed
            or not isinstance(entry.get("value"), str)
            or not entry["value"].strip()
        ):
            raise ValueError(
                "Every blocklist entry needs a supported type and nonempty value"
            )
        entry["value"] = (
            hostname(entry["value"])
            if entry["type"] == "domain"
            else normalize_entity(entry["type"], entry["value"])
        )
        if not entry["value"]:
            raise ValueError("Invalid blocklist indicator")
        if not isinstance(entry.get("source", "local"), str):
            raise TypeError("Blocklist source must be a string")
    settings["blocklist"] = entries
    for name in ("shorteners", "risky_tlds"):
        values = settings.get(name, [])
        if not isinstance(values, list) or any(
            not isinstance(v, str) or not v.strip() for v in values
        ):
            raise ValueError(f"{name} must be a list of nonempty strings")
        settings[name] = [
            hostname(v) if name == "shorteners" else v.lower().lstrip(".")
            for v in values
        ]
        if any(not v for v in settings[name]):
            raise ValueError(f"Invalid {name} value")
    fusion = settings.get("fusion", {})
    if not isinstance(fusion, dict):
        raise TypeError("fusion must be an object")
    weights = dict(WEIGHTS)
    weight_values = fusion.get("weights", {})
    if not isinstance(weight_values, dict):
        raise TypeError("fusion.weights must be an object")
    for name, weight in weight_values.items():
        if (
            name not in weights
            or isinstance(weight, bool)
            or not isinstance(weight, (int, float))
            or not math.isfinite(weight)
            or not 0 <= weight <= 2
        ):
            raise ValueError(
                "Fusion weights must name a detector and be finite values from 0 to 2"
            )
        weights[name] = weight
    suspicious, dangerous = (
        fusion.get("suspicious_threshold", 0.4),
        fusion.get("dangerous_threshold", 0.8),
    )
    if (
        any(
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            for v in (suspicious, dangerous)
        )
        or not 0 < suspicious < dangerous <= 1
    ):
        raise ValueError("Thresholds must satisfy 0 < suspicious < dangerous <= 1")
    settings["fusion"] = {
        "weights": weights,
        "suspicious_threshold": suspicious,
        "dangerous_threshold": dangerous,
    }
    provider = settings.get("safe_browsing", {})
    if not isinstance(provider, dict) or not isinstance(
        provider.get("enabled", False), bool
    ):
        raise TypeError("safe_browsing.enabled must be boolean")
    timeout = provider.get("timeout_seconds", 2)
    if (
        isinstance(timeout, bool)
        or not isinstance(timeout, (int, float))
        or not math.isfinite(timeout)
        or not 0.1 <= timeout <= 10
    ):
        raise ValueError("Safe Browsing timeout must be from 0.1 to 10 seconds")
    settings["safe_browsing"] = {
        "enabled": provider.get("enabled", False),
        "timeout_seconds": timeout,
    }
    return settings


def load_settings():
    path = os.getenv("DETECTION_CONFIG")
    target = SRC_DIR / path if path else None
    value = json.loads(target.read_text(encoding="utf-8")) if target else {}
    return validate_settings(value)
