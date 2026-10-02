"""Rule-based investor-safety signals. No buy/sell/hold advice."""

from __future__ import annotations

import re
from typing import Any

GUARANTEED_RETURN = re.compile(
    r"\b(guaranteed|assured|risk[- ]?free|sure[- ]?shot)\b.{0,40}\b("
    r"return|profit|income|gain|x\b|times)",
    re.I | re.S,
)
MULTIPLIER = re.compile(r"\b(\d+\s*[xX]|[0-9]+\s*times)\b.{0,20}\b(return|profit|money)?", re.I)
URGENCY = re.compile(
    r"\b(today only|last chance|hurry|limited slots?|only \d+ (minutes?|hours?|seats?)|"
    r"act now|invest now|before it.?s too late|immediate(ly)?)\b",
    re.I,
)
INSIDER = re.compile(r"\b(insider|tip group|secret tip|pump|guaranteed profit)\b", re.I)
SEBI_MISUSE = re.compile(r"\b(sebi[- ]approved|sebi certified|nsdl approved|government approved scheme)\b", re.I)
OTP_PRESSURE = re.compile(r"\b(otp|cvv|pin|password|upi pin|netbanking)\b", re.I)
PAYMENT_PUSH = re.compile(
    r"\b(send (money|rs|₹)|pay (now|immediately)|upi|gpay|phonepe|paytm|crypto wallet|usdt)\b",
    re.I,
)
SOCIAL_TIP = re.compile(r"\b(telegram|whatsapp|instagram|youtube).{0,30}\b(tip|group|channel|signal)\b", re.I)

VERIFICATION_STEPS = [
    "Do not send money, share OTPs, or click unknown payment links based on this message.",
    "Verify the person or firm on SEBI's official registers before trusting any investment claim.",
    "Genuine market investments do not guarantee profits. Treat 'guaranteed returns' as a warning sign.",
    "If you already paid or shared details, contact your bank immediately and file a complaint on SCORES / the National Cybercrime portal.",
    "SANGYAN Shield does not recommend buying, selling, or holding any security.",
]


def _add(signals: list[dict], category: str, severity: str, title: str, description: str) -> None:
    signals.append(
        {
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
        }
    )


def _score(signals: list[dict]) -> tuple[str, int]:
    weights = {"high": 3, "medium": 2, "low": 1}
    total = sum(weights.get(s["severity"], 1) for s in signals)
    total = min(10, total)
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

    if GUARANTEED_RETURN.search(text) or MULTIPLIER.search(text):
        _add(
            signals,
            "content",
            "high",
            "Guaranteed or extreme-return claim",
            "The message promises unusually high, guaranteed, or multiplied returns. "
            "Regulated market investments do not guarantee profits.",
        )

    if URGENCY.search(text):
        _add(
            signals,
            "behavior",
            "medium",
            "Urgency or scarcity pressure",
            "The content pushes immediate action, limited slots, or a short deadline. "
            "Pressure to act fast is a common scam pattern.",
        )

    if INSIDER.search(text) or SOCIAL_TIP.search(text):
        _add(
            signals,
            "source",
            "high",
            "Unverified tip or insider-style promotion",
            "Investment tips from chat groups or 'insider' claims are a frequent fraud vector. "
            "They are not a substitute for independent verification.",
        )

    if SEBI_MISUSE.search(text):
        _add(
            signals,
            "source",
            "high",
            "Possible misuse of a regulator's name",
            "SEBI, NSDL, or 'government approved' wording is often forged in scam messages. "
            "Check the claim on official websites only.",
        )

    if OTP_PRESSURE.search(text):
        _add(
            signals,
            "behavior",
            "high",
            "Request for OTP, PIN, or password",
            "No genuine broker, SEBI, or bank officer needs your OTP or UPI PIN. "
            "Sharing these can empty an account immediately.",
        )

    if PAYMENT_PUSH.search(text):
        _add(
            signals,
            "behavior",
            "medium",
            "Payment or wallet transfer prompt",
            "The message asks you to send money or use UPI/crypto wallets. "
            "Pause and verify the recipient independently before paying.",
        )

    entity_types = {e.get("type") for e in entities}
    if "secret_request" in entity_types or "card_number" in entity_types:
        _add(
            signals,
            "privacy",
            "high",
            "Sensitive credential or card details detected",
            "The screenshot appears to mention OTPs, cards, or other secrets. "
            "Do not share these with anyone who contacted you first.",
        )

    if urls:
        _add(
            signals,
            "source",
            "medium",
            "Links or websites found",
            "URLs were extracted from the content. Open only sites you typed yourself, "
            "and be wary of lookalike domains.",
        )

    if phishing_label == "phishing" and (phishing_confidence or 0) >= 55:
        _add(
            signals,
            "visual",
            "high",
            "Screenshot resembles known phishing layouts",
            f"The image classifier flagged this screenshot as phishing-like "
            f"({phishing_confidence:.0f}% model confidence). Treat it as untrusted until verified.",
        )

    if not text.strip() and not signals:
        _add(
            signals,
            "content",
            "low",
            "Little readable text",
            "OCR did not recover enough text to judge the claim. Try a clearer screenshot, "
            "or paste the message as text.",
        )

    level, score = _score(signals)

    if level == "HIGH_ATTENTION":
        explanation = (
            "This content contains several investor-safety warning signs. "
            "Pause, do not send money, and verify through official channels."
        )
    elif level in {"ELEVATED", "MODERATE"}:
        explanation = (
            "Some warning indicators are present. Review the signs below and verify "
            "the source before taking any financial action."
        )
    else:
        explanation = (
            "Few classic scam markers were found, but this is not a safety certificate. "
            "Always verify independently. SANGYAN never gives buy or sell advice."
        )

    return {
        "status": "success",
        "extracted_text": text,
        "detected_urls": urls,
        "analysis_mode": "ocr_and_rules",
        "risk": {"level": level, "score": score},
        "signals": signals,
        "explanation": explanation,
        "verification": VERIFICATION_STEPS,
    }
