"""Orchestration: one OCR pass, independent detectors, one response."""

import logging
import os
from uuid import uuid4

from .detectors import (
    Detection,
    Finding,
    blocklist_detector,
    brand_detector,
    text_detector,
    url_detector,
)
from .entities import extract_entities
from .fusion import fuse
from .progress import pipeline_stage
from .reputation import detect_reputation
from .settings import load_settings, validate_settings


def analyze_text(text, tokens=None, settings=None, extra_detections=()):
    tokens = tokens or []
    pipeline_stage(2, "Extract entities")
    settings = load_settings() if settings is None else validate_settings(settings)
    brands = settings.get("brands", {})
    entities = extract_entities(text, tokens)
    import re

    from .entities import get_entity_ocr_confidence

    for name in brands:
        for match in re.finditer(
            r"(?<!\w)" + re.escape(name) + r"(?!\w)", text, re.IGNORECASE
        ):
            if not any(
                e["type"] == "brand"
                and e["start"] == match.start()
                and e["value"].lower() == name
                for e in entities
            ):
                entities.append(
                    {
                        "type": "brand",
                        "brand_name": name,
                        "value": match.group(),
                        "normalized": name,
                        "start": match.start(),
                        "end": match.end(),
                        "ocr_confidence": get_entity_ocr_confidence(
                            match.start(), match.end(), tokens
                        ),
                    }
                )
    pipeline_stage(3, "Run independent detectors")
    detections = [
        url_detector(
            entities,
            brands,
            settings.get("risky_tlds", []),
            settings.get("shorteners", []),
        ),
        text_detector(text, tokens, entities),
        brand_detector(entities, brands),
        blocklist_detector(entities, settings.get("blocklist", [])),
    ]
    from .text_ml import detect

    text_detection = detect(text, os.getenv("TEXT_MODEL_PATH"))
    if tokens:
        # Region confidence also qualifies the learned text signal.
        weight = sum(max(1, len(t["text"])) for t in tokens)
        trust = sum(t["confidence"] * max(1, len(t["text"])) for t in tokens) / weight
        for finding in text_detection.findings:
            finding.score *= trust
    detections.append(text_detection)
    from .url_ml import detect as detect_urls

    detections.append(detect_urls(entities, os.getenv("URL_MODEL_PATH")))
    detections.extend(extra_detections)
    detections.append(detect_reputation(entities, settings["safe_browsing"]))
    detections.extend(
        Detection(
            name, "not_implemented", detail="External provider integration required"
        )
        for name in ("rdap", "phishtank_openphish")
    )
    result = {
        "analysis_id": str(uuid4()),
        "status": "success",
        "analysis_mode": "multisignal",
        "text": text,
        "extracted_text": text,
        "tokens": tokens,
        "entities": entities,
        "detected_urls": list(
            dict.fromkeys(
                e["normalized"] if e.get("recovered_from_ocr") else e["value"]
                for e in entities
                if e["type"] in {"url", "domain"}
            )
        ),
        "detectors": [d.to_dict() for d in detections],
        "score_version": "rules-v1-uncalibrated",
    }
    pipeline_stage(4, "Fuse evidence and build explanation")
    result.update(fuse(detections, text, tokens, settings["fusion"]))
    result["coverage"] = {
        "completed": [d.name for d in detections if d.status == "ok"],
        "not_completed": [
            {"name": d.name, "status": d.status, "detail": d.detail}
            for d in detections
            if d.status != "ok"
        ],
    }
    candidates = [e for e in entities if e["type"] == "url_candidate"]
    result["url_candidates"] = candidates
    if candidates:
        warning = {
            "category": "ocr",
            "severity": "info",
            "title": "Link could not be read reliably",
            "description": "OCR detected a link fragment but could not identify its destination. Check the original image.",
            "evidence": candidates[0]["value"],
        }
        result["signals"] = result["signals"][:2] + [warning]
        if len(result["signals"]) == 1:
            result["explanation"] = warning["description"]
            result["action"] = (
                "Do not use an unreadable link; verify the destination independently."
            )
            result["verification"] = [result["action"]]
    result.update(
        risk_level=result["risk"]["level"], risk_score=result["risk"]["score"]
    )
    pipeline_stage(5, "Analysis complete")
    return result


def classify_image(image, box=None, classify="full"):
    """Optional ResNet50 visual signal as (Detection, legacy fields).

    Model problems never raise: the detection is marked "unavailable" instead, so text
    checks still run. Callers that require the model check the status.
    """
    from .ocr import crop_region

    if classify not in ("full", "crop", None):
        raise ValueError("classify must be full, crop, or None")
    detection = Detection("image_classifier", "disabled")
    legacy = {"label": None, "confidence": None, "probs": None, "warning": None}
    if classify:
        try:
            from .model import get_classifier, predict_image

            target = crop_region(image, box) if classify == "crop" else image
            label, confidence, probs = predict_image(get_classifier(), target)
            detection = Detection(
                "image_classifier",
                findings=[
                    Finding(
                        "image_classifier",
                        probs["phishing"] / 100,
                        "Visual classifier signal",
                        "The image model found visual patterns associated with phishing.",
                        "ResNet50",
                    )
                ],
            )
            legacy.update(label=label, confidence=confidence, probs=probs)
        except Exception:
            logging.getLogger(__name__).exception(
                "Optional image classifier unavailable"
            )
            detection = Detection(
                "image_classifier",
                "unavailable",
                detail="Model could not be loaded or evaluated",
            )
            legacy["warning"] = detection.detail
    return detection, legacy


def analyze_image(src, box=None, langs=("en",), classify="full", settings=None):
    from .ocr import extract_text, load_image

    if classify not in ("full", "crop", None):
        raise ValueError("classify must be full, crop, or None")
    pipeline_stage(1, "Load image and run OCR once")
    image = load_image(src)
    ocr = extract_text(image, box, langs, return_confidence=True)
    detection, legacy = classify_image(image, box, classify)
    result = analyze_text(
        ocr["text"], ocr["tokens"], settings=settings, extra_detections=[detection]
    )
    result.update(legacy)
    result["urls"] = result["detected_urls"]
    return result
