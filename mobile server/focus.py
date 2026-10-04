"""Answers for the question the user picked before analysis ("analysis focus").

Each report keeps what was actually found in the content ("detected") separate from
what SANGYAN cannot confirm ("uncertain"). Rule-based, and never buy/sell/hold advice.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from safety_engine import SEBI_REG_NUMBER

FOCUS_OPTIONS = {"investment", "links", "explain", "verify"}
DEFAULT_FOCUS = "investment"

QUESTIONS = {
    "investment": "Analyze this investment message",
    "links": "Check whether this URL looks suspicious",
    "explain": "Explain the risk signals",
    "verify": "What should I verify before investing?",
}

SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "shorturl.at",
    "tiny.cc", "ow.ly", "rebrand.ly", "t.ly", "s.id",
}
CHAT_LINKS = {"t.me", "telegram.me", "wa.me", "chat.whatsapp.com"}
RISKY_TLDS = {
    "xyz", "top", "club", "online", "site", "live", "buzz", "icu", "vip", "win", "loan", "click",
    "shop", "fun", "cyou", "rest",
}
OFFICIAL_NAMES = ("sebi", "nsdl", "cdsl", "nse", "bse", "rbi", "npci")
OFFICIAL_DOMAINS = (
    "sebi.gov.in", "nsdl.co.in", "nsdl.com", "cdslindia.com", "nseindia.com", "bseindia.com",
    "rbi.org.in", "npci.org.in",
)
IP_HOST = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")


def normalize_focus(value: str | None) -> str:
    focus = (value or "").strip().lower()
    return focus if focus in FOCUS_OPTIONS else DEFAULT_FOCUS


def _host(url: str) -> str:
    candidate = url if "://" in url else f"http://{url}"
    host = (urlparse(candidate).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _link_findings(url: str) -> list[str]:
    host = _host(url)
    if not host:
        return []
    findings: list[str] = []
    if host in SHORTENERS:
        findings.append("it is a shortened link, so the real destination is hidden")
    if host in CHAT_LINKS:
        findings.append("it opens a private chat or group, where scam tips are often shared")
    if IP_HOST.match(host):
        findings.append("it uses a number instead of a website name")
    tld = host.rsplit(".", 1)[-1]
    if tld in RISKY_TLDS:
        findings.append(f"it ends in “.{tld}”, which is cheap and common on scam sites")
    mentions_official = any(name in host for name in OFFICIAL_NAMES)
    is_official = any(host == d or host.endswith(f".{d}") for d in OFFICIAL_DOMAINS)
    if mentions_official and not is_official:
        findings.append("it uses a regulator or exchange name but is not that body's official website")
    if url.lower().startswith("http://"):
        findings.append("it is not a secure (https) link")
    return findings


def _links_report(result: dict) -> dict:
    urls = result.get("detected_urls") or []
    detected: list[str] = []
    for url in urls[:5]:
        findings = _link_findings(url)
        if findings:
            detected.append(f"{url}: " + "; ".join(findings) + ".")
        else:
            detected.append(f"{url}: no obvious warning sign in the address itself.")

    flagged = sum(1 for url in urls[:5] if _link_findings(url))
    if not urls:
        answer = "We didn't find any links in this content."
    elif flagged:
        answer = (
            f"We found {len(urls)} link{'s' if len(urls) != 1 else ''}, and "
            f"{flagged} {'has' if flagged == 1 else 'have'} warning signs in the address. "
            "Don't open them."
        )
    else:
        answer = (
            f"We found {len(urls)} link{'s' if len(urls) != 1 else ''}. The addresses don't show "
            "obvious warning signs, but that doesn't make them safe."
        )

    uncertain = [
        "We only read the link text. We can't see who owns the website or what it does when opened.",
        "A normal-looking address can still lead to a fake page.",
    ]
    if not urls:
        uncertain = ["Links inside buttons or images may not be readable, so some links can be missed."]

    return {
        "answer": answer,
        "detected": detected,
        "uncertain": uncertain,
        "next_steps": [
            "Don't tap links from unknown senders. Type the official website address yourself.",
            "Only download trading apps from the Play Store, from a SEBI-registered broker.",
            "If you already opened a link and entered details, change your passwords and call your bank.",
        ],
    }


def _explain_report(result: dict) -> dict:
    signals = result.get("signals") or []
    detected = []
    for signal in signals:
        evidence = signal.get("evidence") or []
        quoted = ", ".join(f"“{e}”" for e in evidence[:2])
        detected.append(f"{signal['title']}: we found {quoted}." if quoted else f"{signal['title']}.")

    if signals:
        answer = (
            f"We found {len(signals)} warning sign{'s' if len(signals) != 1 else ''}. "
            "Each one below quotes the words that triggered it."
        )
        uncertain = [
            "These signs are common in scams, but they don't prove who sent this or what they intend.",
            "Words can be misread from images. Check the original message if something looks wrong.",
        ]
    else:
        answer = "We didn't find any of the common warning signs we look for."
        uncertain = [
            "Not finding a sign doesn't mean the message is safe. Scammers keep changing their wording.",
        ]
    return {
        "answer": answer,
        "detected": detected,
        "uncertain": uncertain,
        "next_steps": list(result.get("verification") or [])[:3],
    }


def _verify_report(result: dict, text: str) -> dict:
    signal_ids = {s.get("id") for s in result.get("signals") or []}
    detected: list[str] = []
    uncertain: list[str] = []

    reg_numbers = sorted(set(SEBI_REG_NUMBER.findall(text)))
    if reg_numbers:
        detected.append(f"A SEBI registration number appears: {', '.join(reg_numbers[:3])}.")
        uncertain.append(
            "We can't confirm that this number belongs to the person contacting you. "
            "Scammers copy real numbers."
        )
    else:
        uncertain.append("No SEBI registration number was visible, so we couldn't check one.")

    if "payment_request" in signal_ids:
        detected.append("It asks you to pay money.")
    if "sensitive_request" in signal_ids:
        detected.append("It asks for secret details such as an OTP or PIN.")
    if "guaranteed_returns" in signal_ids:
        detected.append("It promises fixed or guaranteed returns.")

    steps = [
        "Search the person or firm on SEBI's official intermediary list (sebi.gov.in) and match the name, number, and contact details.",
        "Contact the firm only through the phone number or website listed on SEBI's site, not the one in this message.",
        "Ask for a written agreement and check that payments go to a bank account in the registered firm's own name.",
        "Be suspicious of any fixed or guaranteed return. Real investments carry risk.",
    ]
    if "payment_request" in signal_ids:
        steps.insert(0, "Don't pay to a personal UPI ID or wallet. Registered firms don't collect money this way.")
    if "sensitive_request" in signal_ids:
        steps.insert(0, "Never share an OTP, PIN, or password. No genuine adviser or broker asks for them.")

    return {
        "answer": "Before you invest, check these points yourself. SANGYAN Shield can't confirm who is behind this message.",
        "detected": detected,
        "uncertain": uncertain,
        "next_steps": steps[:5],
    }


def _investment_report(result: dict) -> dict:
    signals = result.get("signals") or []
    return {
        "answer": result.get("explanation", ""),
        "detected": [s["title"] for s in signals],
        "uncertain": ["This is an automated check of common warning signs. It can miss things or make mistakes."],
        "next_steps": list(result.get("verification") or [])[:3],
    }


def build_focus_report(focus: str, result: dict, text: str) -> dict:
    focus = normalize_focus(focus)
    if focus == "links":
        report = _links_report(result)
    elif focus == "explain":
        report = _explain_report(result)
    elif focus == "verify":
        report = _verify_report(result, text)
    else:
        report = _investment_report(result)
    return {"focus": focus, "question": QUESTIONS[focus], **report}
