"""Stages 3–4: provisional rules, never a calibrated fraud probability."""

WEIGHTS = {
    "safe_browsing": 1,
    "url_domain": 1,
    "text_rules": 1,
    "brand_mismatch": 0.8,
    "blocklist": 1,
    "text_ml": 0.8,
    "url_ml": 0.8,
    "image_classifier": 0.55,
}


def fuse(detections, text, tokens, options=None):
    options = options or {}
    weights = options.get("weights", WEIGHTS)
    suspicious = options.get("suspicious_threshold", 0.4)
    dangerous = options.get("dangerous_threshold", 0.8)
    findings = [f for d in detections for f in d.findings]
    # A family contributes once, so repeated words/links cannot inflate the score.
    score = min(
        1,
        sum(
            max((f.score for f in d.findings), default=0) * weights.get(d.name, 0)
            for d in detections
        ),
    )
    if any(f.hard_override for f in findings):
        score = 1
    level = (
        "dangerous"
        if score >= dangerous
        else "suspicious"
        if score >= suspicious
        else "low"
    )
    readable = bool(text.strip()) and (
        not tokens or any(t["confidence"] >= 0.5 for t in tokens)
    )
    if not readable and level == "low":
        level = "unknown"
    reasons, seen = [], set()
    for finding in sorted(
        findings, key=lambda f: (f.hard_override, f.score), reverse=True
    ):
        if finding.score < 0.1 or finding.title in seen:
            continue
        seen.add(finding.title)
        reasons.append(
            {
                "category": finding.category,
                "severity": "high" if finding.score >= 0.65 else "medium",
                "title": finding.title,
                "description": finding.description,
                "evidence": finding.evidence,
            }
        )
        if len(reasons) == 3:
            break
    action = (
        "Do not tap the link or share secrets; verify through the official app."
        if level in {"dangerous", "suspicious"}
        else "Upload a clearer image or verify the message independently."
        if level == "unknown"
        else "Verify unexpected requests through a trusted contact before acting."
    )
    explanation = " ".join(r["description"] for r in reasons) or (
        "Not enough readable text to assess this image."
        if level == "unknown"
        else "No strong scam indicators found in the available checks. This does not establish safety or factual accuracy."
    )
    return {
        "risk": {"level": level, "score": round(score * 100, 1)},
        "signals": reasons,
        "explanation": explanation,
        "verification": [action],
        "action": action,
    }
