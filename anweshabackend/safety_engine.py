"""Rule-based investor-safety signals. No buy/sell/hold advice."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

GUARANTEED_RETURN = re.compile(
    r"\b(guaranteed|assured|risk[- ]?free|sure[- ]?shot)\b.{0,40}?\b("
    r"returns?|profits?|income|gains?|times)\b",
    re.I | re.S,
)
MULTIPLIER = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:x|times)\s+(?:your\s+)?(?:returns?|profits?|money|gains?)\b"
    r"|\bdouble your money\b"
    r"|\b\d{2,3}\s*%\s*(?:monthly|per month|daily|per day|weekly|per week)\b",
    re.I,
)
URGENCY = re.compile(
    r"\b(today only|last chance|hurry|limited slots?|only \d+ (?:minutes?|hours?|seats?|slots?)"
    r"(?: left| remaining)?|act now|invest now|before it.?s too late|immediately)\b",
    re.I,
)
INSIDER = re.compile(r"\b(insider tips?|insider|tip group|secret tips?|pump)\b", re.I)
SEBI_MISUSE = re.compile(
    r"\b(sebi[- ]approved|sebi[- ]certified|sebi[- ]registered scheme|nsdl[- ]approved|"
    r"government[- ]approved scheme)\b",
    re.I,
)
OTP_PRESSURE = re.compile(r"\b(otp|cvv|upi pin|pin|password|netbanking)\b", re.I)
PAYMENT_PUSH = re.compile(
    r"\b(send (?:money|rs\.?|₹)|pay (?:now|immediately)|upi|gpay|phonepe|paytm|crypto wallet|usdt)\b",
    re.I,
)
SOCIAL_TIP = re.compile(
    r"\b(telegram|whatsapp|instagram|youtube)\b.{0,30}?\b(tips?|group|channel|signals?)\b",
    re.I | re.S,
)
FAKE_PLATFORM = re.compile(
    r"\b(withdrawal (?:fees?|charges?|tax)|pay (?:the )?(?:tax|fees?) (?:to|before) withdraw\w*|"
    r"institutional account|qib account|vip (?:account|trading account)|otc (?:trading|account)|"
    r"ipo allotment (?:guaranteed|confirmed|assured)|download (?:our|the) (?:trading )?app)\b",
    re.I,
)
PYRAMID = re.compile(
    r"\b(refer(?:ral)? (?:bonus|income)|refer and earn|joining bonus|level income|"
    r"add \d+ members|recruit(?:ing)? (?:members|people|friends)|earn (?:by|on) (?:joining|referring)|"
    r"chain (?:scheme|plan)|binary plan)\b",
    re.I,
)
ADVISER_CLAIM = re.compile(
    r"\b(investment advis[eo]r|research analyst|stock (?:expert|guru|advis[eo]r)|"
    r"trading (?:expert|mentor|academy|coach)|portfolio manag\w+|advisory (?:services?|firm|team)|"
    r"premium calls|intraday calls|paid (?:calls|tips|signals))\b",
    re.I,
)
# SEBI registration numbers: INA (investment adviser), INH (research analyst), INZ / INP (others).
SEBI_REG_NUMBER = re.compile(r"\bIN[AHZP]\d{9}\b")

# Below this much readable text, a "no warning signs" verdict would be misleading.
MIN_READABLE_CHARS = 15

VERIFICATION_STEPS = [
    "Do not send money, share OTPs, or click unknown payment links based on this message.",
    "Verify the person or firm on SEBI's official registers before trusting any investment claim.",
    "Genuine market investments do not guarantee profits. Treat 'guaranteed returns' as a warning sign.",
    "If you already paid or shared details, contact your bank immediately and file a complaint on SCORES / the National Cybercrime portal.",
    "SANGYAN Shield does not recommend buying, selling, or holding any security.",
]


def _matches(*patterns: re.Pattern, text: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            phrase = " ".join(match.group(0).split())
            if phrase and not any(phrase.lower() in f.lower() for f in found):
                found.append(phrase)
            if len(found) >= limit:
                return found
    return found


def _add(
    signals: list[dict],
    signal_id: str,
    category: str,
    severity: str,
    title: str,
    description: str,
    evidence: list[str] | None = None,
) -> None:
    signals.append(
        {
            "id": signal_id,
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
            "evidence": evidence or [],
        }
    )


def _score(signals: list[dict]) -> tuple[str, int]:
    weights = {"high": 3, "medium": 2, "low": 1}
    # A serious signal backed by several distinct phrases is stronger evidence than a single word.
    total = min(
        10,
        sum(
            weights.get(s["severity"], 1)
            + (1 if s["severity"] == "high" and len(s.get("evidence") or []) >= 2 else 0)
            for s in signals
        ),
    )
    if not signals:
        return "LOW_ATTENTION", 1
    if total >= 7:
        return "HIGH_ATTENTION", total
    if total >= 4:
        return "ELEVATED", total
    if total >= 2:
        return "MODERATE", total
    return "LOW_ATTENTION", total


def analyze_content(
    text: str,
    entities: list[dict[str, Any]] | None = None,
    phishing_label: str | None = None,
    phishing_confidence: float | None = None,
) -> dict[str, Any]:
    text = text or ""
    entities = entities or []
    signals: list[dict] = []
    urls = [
        e.get("normalized") or e.get("value")
        for e in entities
        if e.get("type") in {"url", "domain"} and (e.get("normalized") or e.get("value"))
    ]

    evidence = _matches(GUARANTEED_RETURN, MULTIPLIER, text=text)
    if evidence:
        _add(
            signals,
            "guaranteed_returns",
            "content",
            "high",
            "Promises guaranteed or huge returns",
            "The message promises guaranteed, multiplied, or very high returns. "
            "Real investments can lose money, so no one can honestly guarantee profits.",
            evidence,
        )

    evidence = _matches(URGENCY, text=text)
    if evidence:
        _add(
            signals,
            "urgency",
            "behavior",
            "medium",
            "Pushes you to act fast",
            "It creates pressure with deadlines or limited slots. "
            "Scammers rush people so they don't stop to check.",
            evidence,
        )

    evidence = _matches(INSIDER, SOCIAL_TIP, text=text)
    if evidence:
        _add(
            signals,
            "unverified_tip",
            "source",
            "high",
            "Secret tip or chat-group promotion",
            "'Insider tips' and stock tips from WhatsApp or Telegram groups are a common way "
            "people get cheated. Genuine advisers don't sell secret tips in chat groups.",
            evidence,
        )

    evidence = _matches(SEBI_MISUSE, text=text)
    if evidence:
        _add(
            signals,
            "fake_regulator",
            "source",
            "high",
            "Uses SEBI or government name to look trustworthy",
            "SEBI does not approve schemes that promise returns. Scammers often fake "
            "'SEBI approved' or 'government approved' labels.",
            evidence,
        )

    evidence = _matches(ADVISER_CLAIM, text=text)
    if evidence:
        reg_numbers = _matches(SEBI_REG_NUMBER, text=text)
        if reg_numbers:
            _add(
                signals,
                "unregistered_adviser",
                "source",
                "low",
                "Shows a registration number. Verify it.",
                "The message claims to be from an adviser and shows a SEBI-style registration "
                "number. Scammers sometimes copy real numbers, so check that the name and contact "
                "details match SEBI's official records.",
                evidence[:2] + reg_numbers[:1],
            )
        else:
            _add(
                signals,
                "unregistered_adviser",
                "source",
                "medium",
                "Claims to be an adviser without proof of registration",
                "Only SEBI-registered advisers and research analysts may give paid stock advice. "
                "This message offers advice but shows no SEBI registration number.",
                evidence,
            )

    evidence = _matches(FAKE_PLATFORM, text=text)
    if evidence:
        _add(
            signals,
            "fake_platform",
            "content",
            "high",
            "Signs of a fake trading app or platform",
            "Fake trading apps show made-up profits, then ask for 'withdrawal tax' or fees "
            "before you can take money out. Real brokers never charge to release your own money.",
            evidence,
        )

    evidence = _matches(PYRAMID, text=text)
    if evidence:
        _add(
            signals,
            "pyramid_scheme",
            "content",
            "high",
            "Pays you for recruiting others",
            "Schemes that reward you for bringing in new members are typical of Ponzi and "
            "pyramid schemes. They collapse when recruiting slows, and most people lose money.",
            evidence,
        )

    evidence = _matches(OTP_PRESSURE, text=text)
    if evidence:
        _add(
            signals,
            "sensitive_request",
            "privacy",
            "high",
            "Asks for OTP, PIN, or password",
            "No real bank, broker, or SEBI officer will ever ask for your OTP or UPI PIN. "
            "Sharing it can let someone empty your account.",
            evidence,
        )

    evidence = _matches(PAYMENT_PUSH, text=text)
    if evidence:
        _add(
            signals,
            "payment_request",
            "behavior",
            "medium",
            "Asks you to send money",
            "It asks you to pay through UPI, a wallet, or crypto. "
            "Money sent this way is very hard to get back.",
            evidence,
        )

    entity_types = {e.get("type") for e in entities}
    if "secret_request" in entity_types and not any(s["id"] == "sensitive_request" for s in signals):
        _add(
            signals,
            "sensitive_request",
            "privacy",
            "high",
            "Asks for sensitive details",
            "The screenshot seems to ask for secret details like card numbers or codes. "
            "Never share these with someone who contacted you first.",
        )

    if urls:
        _add(
            signals,
            "suspicious_url",
            "source",
            "medium",
            "Contains links",
            "Links in such messages can lead to fake websites that look real. "
            "Don't open them. Type official website addresses yourself.",
            urls[:3],
        )

    if phishing_label == "phishing" and (phishing_confidence or 0) >= 55:
        _add(
            signals,
            "phishing_visual",
            "visual",
            "high",
            "Looks like a known fake page",
            "Our image check found this screenshot looks similar to known phishing pages.",
            [f"{phishing_confidence:.0f}% match with phishing layouts"],
        )

    level, score = _score(signals)
    readable = len(text.strip()) >= MIN_READABLE_CHARS
    status = "success" if signals or readable else "inconclusive"

    if status == "inconclusive":
        explanation = (
            "We could not read enough text to check this properly. "
            "Try a clearer screenshot, or paste the message as text."
        )
    elif level == "HIGH_ATTENTION":
        explanation = (
            "This message shows several signs that are common in investment scams. "
            "Do not send money or share any details until you verify it through official sources."
        )
    elif level in {"ELEVATED", "MODERATE"}:
        explanation = (
            "We found some warning signs. Read them below and check the source carefully "
            "before you take any action."
        )
    else:
        explanation = (
            "We did not find common scam signs. That does not mean it is safe. "
            "Always verify before you invest or pay."
        )

    return {
        "analysis_id": str(uuid.uuid4()),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "extracted_text": text,
        "detected_urls": urls,
        "analysis_mode": "ocr_and_rules",
        "risk": {"level": level, "score": score},
        "signals": signals,
        "explanation": explanation,
        "verification": VERIFICATION_STEPS,
    }
