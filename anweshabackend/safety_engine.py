"""Rule-based investor-safety signals. No buy/sell/hold advice."""

from __future__ import annotations

import re
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
    category: str,
    severity: str,
    title: str,
    description: str,
    evidence: list[str] | None = None,
) -> None:
    signals.append(
        {
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
            "evidence": evidence or [],
        }
    )


def _score(signals: list[dict]) -> tuple[str, int]:
    weights = {"high": 3, "medium": 2, "low": 1}
    total = min(10, sum(weights.get(s["severity"], 1) for s in signals))
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
            "source",
            "high",
            "Uses SEBI or government name to look trustworthy",
            "SEBI does not approve schemes that promise returns. Scammers often fake "
            "'SEBI approved' or 'government approved' labels.",
            evidence,
        )

    evidence = _matches(OTP_PRESSURE, text=text)
    if evidence:
        _add(
            signals,
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
            "behavior",
            "medium",
            "Asks you to send money",
            "It asks you to pay through UPI, a wallet, or crypto. "
            "Money sent this way is very hard to get back.",
            evidence,
        )

    entity_types = {e.get("type") for e in entities}
    if "secret_request" in entity_types and not any(s["category"] == "privacy" for s in signals):
        _add(
            signals,
            "privacy",
            "high",
            "Asks for sensitive details",
            "The screenshot seems to ask for secret details like card numbers or codes. "
            "Never share these with someone who contacted you first.",
        )

    if urls:
        _add(
            signals,
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
        "status": status,
        "extracted_text": text,
        "detected_urls": urls,
        "analysis_mode": "ocr_and_rules",
        "risk": {"level": level, "score": score},
        "signals": signals,
        "explanation": explanation,
        "verification": VERIFICATION_STEPS,
    }
