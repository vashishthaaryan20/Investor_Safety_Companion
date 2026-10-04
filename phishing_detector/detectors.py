"""Stage 2: independent, offline detectors with evidence and explicit status."""

import re
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from urllib.parse import urlsplit


@dataclass
class Finding:
    category: str
    score: float
    title: str
    description: str
    evidence: str
    hard_override: bool = False


@dataclass
class Detection:
    name: str
    status: str = "ok"
    findings: list = field(default_factory=list)
    detail: str = ""

    def to_dict(self):
        result = asdict(self)
        result["score"] = max((f.score for f in self.findings), default=0)
        return result


def hostname(value):
    try:
        host = urlsplit(value if "://" in value else "https://" + value).hostname or ""
        return host.rstrip(".").encode("idna").decode("ascii").lower()
    except (ValueError, UnicodeError):
        return ""


def belongs(host, official):
    return host == official or host.endswith("." + official)


def confidence(entity):
    value = entity.get("ocr_confidence")
    return 1.0 if value is None else max(0.0, min(1.0, value))


def url_detector(entities, brands, risky_tlds=(), shorteners=()):
    out = Detection("url_domain")
    skeleton_map = str.maketrans("0аоеірсх", "oaoeipcx")
    for e in entities:
        if e["type"] not in {"url", "domain"}:
            continue
        host = hostname(e.get("normalized", e["value"]))
        if not host:
            continue

        def add(score, title, description, entity=e):
            out.findings.append(
                Finding(
                    out.name,
                    score * confidence(entity),
                    title,
                    description,
                    entity["value"],
                )
            )

        try:
            unicode_host = host.encode("ascii").decode("idna")
        except UnicodeError:
            unicode_host = host
        if "xn--" in host:
            add(
                0.15,
                "Internationalized domain",
                f"{host} uses an internationalized name; this alone is not evidence of fraud.",
            )
        if any(belongs(host, d) for d in shorteners):
            add(0.15, "Shortened link", f"{host} hides the destination.")
        if host.rsplit(".", 1)[-1] in risky_tlds:
            add(
                0.1,
                "Configured TLD risk",
                f"{host} uses a suffix marked for extra review.",
            )
        if len(host.split(".")) > 4:
            add(0.15, "Unusual subdomains", f"{host} contains many subdomain labels.")
        for brand, domains in brands.items():
            if any(belongs(host, d) for d in domains):
                continue
            for official in domains:
                stem = official.split(".")[0]
                labels = unicode_host.split(".")
                similar = any(
                    len(stem) >= 4
                    and (
                        label.translate(skeleton_map) == stem
                        or 0.78 <= SequenceMatcher(None, label, stem).ratio() < 1
                    )
                    for label in labels[:-1]
                )
                deceptive = official in host or stem in labels[:-1]
                if similar or deceptive:
                    add(
                        0.70,
                        "Possible brand imitation",
                        f"{host} resembles {brand}, but is outside its configured official domains.",
                    )
                    break
    return out


RULES = [
    (r"\b(?:urgent|immediately|last warning|within \d+ hours?)\b", 0.25, "Urgency"),
    (
        r"\b(?:verify\s+(?:your\s+)?kyc|account\s+(?:is\s+|will be\s+)?(?:blocked|suspended))\b",
        0.45,
        "Account threat or KYC demand",
    ),
    (
        r"\b(?:claim\s+(?:your\s+)?(?:prize|reward|refund)|you(?:'ve| have)? won)\b",
        0.40,
        "Prize or refund bait",
    ),
    (
        r"\b(?:install|download)\b.{0,50}\b(?:anydesk|teamviewer|remote access)\b",
        0.65,
        "Remote access request",
    ),
    (
        r"\b(?:pay|send|buy)\b.{0,40}\b(?:gift cards?|processing fee|money|payment)\b",
        0.50,
        "Payment demand",
    ),
]


def text_detector(text, tokens, entities):
    from .entities import get_entity_ocr_confidence

    out = Detection("text_rules")
    for pattern, score, title in RULES:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            trust = get_entity_ocr_confidence(match.start(), match.end(), tokens)
            out.findings.append(
                Finding(
                    out.name,
                    score * (1 if trust is None else trust),
                    title,
                    f"The message says “{match.group()}”.",
                    match.group(),
                )
            )
    for e in entities:
        if e["type"] == "secret_request":
            out.findings.append(
                Finding(
                    out.name,
                    0.75 * confidence(e),
                    "Request for a secret",
                    f"The message appears to request {e['value']}.",
                    e["request_context"],
                )
            )
    return out


def brand_detector(entities, brands):
    out = Detection("brand_mismatch", status="ok" if brands else "not_configured")
    for brand in (e for e in entities if e["type"] == "brand"):
        domains = brands.get(brand["brand_name"].lower(), [])
        for link in (e for e in entities if e["type"] in {"url", "domain"}):
            host = hostname(link.get("normalized", link["value"]))
            # Mere co-occurrence is weaker than an authenticated sender claim.
            if domains and host and not any(belongs(host, d) for d in domains):
                out.findings.append(
                    Finding(
                        out.name,
                        0.55 * min(confidence(brand), confidence(link)),
                        "Brand and link differ",
                        f"{brand['value']} is mentioned, but {host} is outside its configured domains.",
                        link["value"],
                    )
                )
    return out


def blocklist_detector(entities, entries):
    out = Detection("blocklist", status="ok" if entries else "not_configured")
    for e in entities:
        for entry in entries:
            kind, value = entry["type"], entry["value"]
            hit = kind == e["type"] and value == e["normalized"]
            if kind == "domain" and e["type"] in {"url", "domain"}:
                hit = belongs(hostname(e.get("normalized", e["value"])), value)
            if hit:
                trusted = confidence(e) >= 0.8
                out.findings.append(
                    Finding(
                        out.name,
                        1.0 if trusted else 0.5 * confidence(e),
                        "Known bad indicator"
                        if trusted
                        else "Uncertain blocklist match",
                        f"{e['value']} matches a reviewed local blocklist entry ({entry.get('source', 'local')}).",
                        e["value"],
                        hard_override=trusted,
                    )
                )
    return out
