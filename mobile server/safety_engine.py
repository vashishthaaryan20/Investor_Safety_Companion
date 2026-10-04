"""Rule-based investor-safety signals. No buy/sell/hold advice."""

from __future__ import annotations

import math
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
    # OCR wraps lines mid-phrase (also after a hyphen); the patterns use literal spaces.
    text = " ".join(re.sub(r"(\w)-[ \t]*\n\s*(\w)", r"\1-\2", text).split())
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
    origin: str = "investor_rules",
) -> None:
    signals.append(
        {
            "id": signal_id,
            "category": category,
            "severity": severity,
            "title": title,
            "description": description,
            "evidence": evidence or [],
            "origin": origin,
        }
    )


def _rules_score(signals: list[dict]) -> int:
    """0-100 from the investor-safety signals; 10 points per severity step."""
    weights = {"high": 3, "medium": 2, "low": 1}
    # A serious signal backed by several distinct phrases is stronger evidence than a single word.
    total = sum(
        weights.get(s["severity"], 1)
        + (1 if s["severity"] == "high" and len(s.get("evidence") or []) >= 2 else 0)
        for s in signals
    )
    return min(100, total * 10)


def level_for(score: float) -> str:
    # The engine's own bands (dangerous >= 80, suspicious >= 40) land in HIGH and ELEVATED.
    if score >= 70:
        return "HIGH_ATTENTION"
    if score >= 40:
        return "ELEVATED"
    if score >= 20:
        return "MODERATE"
    return "LOW_ATTENTION"


RECOMMENDATIONS = {
    "HIGH_ATTENTION": (
        "STOP_AND_VERIFY",
        "Do not pay, tap links, or share OTPs. Verify the sender on SEBI's official registers "
        "before you do anything.",
    ),
    "ELEVATED": (
        "STOP_AND_VERIFY",
        "Stop and verify the sender and offer through official sources before you act.",
    ),
    "MODERATE": (
        "VERIFY_BEFORE_PROCEEDING",
        "Check who sent this and verify the offer independently before you act.",
    ),
    # The explanation already says a low score is not proof of safety; this is the action.
    "LOW_ATTENTION": (
        "VERIFY_BEFORE_PROCEEDING",
        "Verify the sender and the offer independently before you invest or pay.",
    ),
    "INCONCLUSIVE": (
        "RETRY_WITH_CLEARER_INPUT",
        "We couldn't read enough to check this. Try a clearer screenshot or paste the message as text.",
    ),
}
TYPED_INCONCLUSIVE_ADVICE = "Paste the whole message so it can be checked properly."


def recommendation_for(level: str) -> dict:
    action, message = RECOMMENDATIONS[level]
    return {"action": action, "message": message}


# phishing_detector finding title -> (signal id, category, severity, title, description).
# Ids shared with our own rules are dropped when our rule already fired. The visual classifier
# finding is left out on purpose: phishing_visual applies its own confidence threshold.
DETECTOR_FINDINGS: dict[str, tuple[str, str, str, str, str]] = {
    "Possible brand imitation": (
        "brand_imitation", "source", "high", "Link pretends to be a known brand",
        "The web address looks like a well-known company's site but is not its official one. "
        "Fake look-alike sites are used to steal logins and money.",
    ),
    "Brand and link differ": (
        "brand_link_mismatch", "source", "medium", "Brand name and link don't match",
        "The message names a company, but the link goes somewhere else. "
        "Open the company's official app or website yourself instead.",
    ),
    "Known bad indicator": (
        "reported_scam", "source", "high", "Matches a reported scam",
        "A link or number here matches one already reported as a scam.",
    ),
    "Uncertain blocklist match": (
        "possible_reported_scam", "source", "medium", "May match a reported scam",
        "Part of this message looks like something already reported as a scam, "
        "but we could not read it clearly enough to be sure.",
    ),
    "Shortened link": (
        "short_link", "source", "medium", "Shortened link hides where it goes",
        "Short links hide the real website. Scammers use them so you can't see the address before tapping.",
    ),
    "Unusual subdomains": (
        "unusual_link", "source", "low", "Link has an unusual address",
        "The web address has many extra parts, a trick used to make fake sites look official.",
    ),
    "Internationalized domain": (
        "lookalike_letters", "source", "low", "Link uses unusual letters",
        "The web address uses special characters that can look like normal letters.",
    ),
    "Configured TLD risk": (
        "risky_domain_ending", "source", "low", "Unusual web address ending",
        "The link ends in a web address type that is often used by scam sites.",
    ),
    "Account threat or KYC demand": (
        "account_threat", "behavior", "high", "Threatens to block your account",
        "It says your account will be blocked or asks you to update KYC through a link. "
        "Banks and brokers never ask for KYC this way.",
    ),
    "Prize or refund bait": (
        "prize_bait", "content", "medium", "Promises a prize or refund",
        "Unexpected prizes and refunds are a common way to get you to tap a link or pay a fee.",
    ),
    "Remote access request": (
        "remote_access", "privacy", "high", "Asks you to install a screen-sharing app",
        "Apps like AnyDesk or TeamViewer let a stranger see and control your phone, "
        "including your banking apps.",
    ),
    "Text classifier signal": (
        "scam_language", "content", "medium", "Wording matches known scams",
        "Our text check found wording similar to known scam messages.",
    ),
    "URL classifier signal": (
        "scam_link_pattern", "source", "medium", "Link looks like known scam links",
        "Our link check found this web address looks similar to known phishing links.",
    ),
    "Urgency": (
        "urgency", "behavior", "medium", "Pushes you to act fast",
        "It creates pressure with deadlines or warnings. "
        "Scammers rush people so they don't stop to check.",
    ),
    "Payment demand": (
        "payment_request", "behavior", "medium", "Asks you to send money",
        "It asks you to pay a fee or send money. Money sent to strangers is very hard to get back.",
    ),
    "Request for a secret": (
        "sensitive_request", "privacy", "high", "Asks for OTP, PIN, or password",
        "No real bank, broker, or SEBI officer will ever ask for your OTP or UPI PIN. "
        "Sharing it can let someone empty your account.",
    ),
}

# Findings are pre-weighted by OCR confidence; below this they are mostly misreads.
MIN_DETECTOR_SCORE = 0.1

DETECTOR_CATEGORY = {
    "url_domain": "source",
    "brand_mismatch": "source",
    "blocklist": "source",
    "text_rules": "behavior",
    "text_ml": "content",
    "url_ml": "source",
}
VISUAL_FINDING = "Visual classifier signal"


def _finding_spec(finding: dict[str, Any]) -> tuple[str, str, str, str, str]:
    """Known titles use reviewed wording; anything new from the engine is still shown, never dropped."""
    title = str(finding.get("title") or "")
    if title in DETECTOR_FINDINGS:
        return DETECTOR_FINDINGS[title]
    score = finding.get("score") or 0
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") or "finding"
    return (
        f"engine_{slug}",
        DETECTOR_CATEGORY.get(str(finding.get("category") or ""), "content"),
        "high" if score >= 0.65 else "medium" if score >= 0.35 else "low",
        title,
        str(finding.get("description") or "The detection engine flagged this."),
    )


def detector_signals(detectors: list[dict[str, Any]] | None) -> list[dict]:
    """Turn phishing_detector findings into signals, one per kind, with all evidence merged."""
    merged: dict[str, dict] = {}
    for detection in detectors or []:
        for finding in detection.get("findings") or []:
            # The visual classifier is reported through phishing_visual in analyze_content.
            if finding.get("title") == VISUAL_FINDING or (finding.get("score") or 0) < MIN_DETECTOR_SCORE:
                continue
            signal_id, category, severity, title, description = _finding_spec(finding)
            signal = merged.setdefault(
                signal_id,
                {
                    "id": signal_id,
                    "category": category,
                    "severity": severity,
                    "title": title,
                    "description": description,
                    "evidence": [],
                    "origin": "engine",
                },
            )
            evidence = " ".join(str(finding.get("evidence") or "").split())
            if evidence and evidence not in signal["evidence"] and len(signal["evidence"]) < 3:
                signal["evidence"].append(evidence)
    return list(merged.values())


def analyze_content(
    text: str,
    entities: list[dict[str, Any]] | None = None,
    phishing_label: str | None = None,
    phishing_confidence: float | None = None,
    extra_signals: list[dict] | None = None,
    engine_risk: dict[str, Any] | None = None,
    typed: bool = False,
    visual_tier: str | None = None,
) -> dict[str, Any]:
    """Investor-safety rules on top of the detection engine's verdict.

    The final score is the higher of the engine's fused score and the rules score, so
    neither can hide the other's evidence. Every level above low has at least one signal.
    """
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

    if visual_tier and phishing_label in {"phishing", "legitimate"} and phishing_confidence is not None:
        phishing_percent = (
            phishing_confidence if phishing_label == "phishing" else 100 - phishing_confidence
        )
        if visual_tier == "high":
            _add(
                signals,
                "phishing_visual",
                "visual",
                "high",
                "Looks like a known fake page",
                "Our image check found this screenshot looks similar to known phishing pages.",
                [f"{phishing_percent:.0f}% match with phishing layouts"],
                origin="engine",
            )
        else:
            # The medium tier moves the engine score into "be careful", so it must be visible.
            _add(
                signals,
                "phishing_visual_weak",
                "visual",
                "low",
                "Layout looks a little like fake pages",
                "Our image check found some resemblance to known phishing pages. "
                "On its own this is weak evidence.",
                [f"{phishing_percent:.0f}% resemblance to phishing layouts"],
                origin="engine",
            )

    own_ids = {s["id"] for s in signals}
    for extra in extra_signals or []:
        if extra["id"] in own_ids:
            continue
        _add(
            signals,
            extra["id"],
            extra["category"],
            extra["severity"],
            extra["title"],
            extra["description"],
            extra.get("evidence"),
            extra.get("origin", "engine"),
        )

    engine_level = (engine_risk or {}).get("level")
    engine_score = float((engine_risk or {}).get("score") or 0)
    # Floor, so the shown score never crosses a band the evidence didn't reach.
    score = math.floor(max(_rules_score(signals), engine_score))
    level = level_for(score)
    readable = len(text.strip()) >= MIN_READABLE_CHARS and engine_level != "unknown"
    # The image model was trained on websites and leans slightly "phishing" on blurred or
    # noisy pictures, so a weak resemblance alone must not turn an unreadable image into a verdict.
    conclusive = [s for s in signals if s["id"] != "phishing_visual_weak"]
    status = "success" if conclusive or readable else "inconclusive"
    if status == "inconclusive":
        level = "INCONCLUSIVE"
        signals = conclusive

    recommendation = recommendation_for(level)
    if status == "inconclusive" and typed:
        explanation = (
            "There was not enough in this message to check it properly. "
            "Paste the whole message, including any offer or link it mentions."
        )
        recommendation["message"] = TYPED_INCONCLUSIVE_ADVICE
    elif status == "inconclusive":
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
            "We found a warning sign. Read it below"
            if len(signals) == 1
            else "We found some warning signs. Read them below"
        ) + " and check the source carefully before you take any action."
    elif signals:
        explanation = (
            "We found only minor signs, listed below. That does not mean it is safe. "
            "Always verify before you invest or pay."
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
        "recommendation": recommendation,
    }
