"""The detection engine contract, checked on every request.

`EngineOutput` is what `phishing_detector.service.analyze_text` must return to the API.
`AnalysisResponse` is what the mobile app receives. docs/backend-integration.md explains
each field; change both together and bump CONTRACT_VERSION.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.1"

# ---------------------------------------------------------------- engine output

DetectorStatus = Literal["ok", "disabled", "unavailable", "not_configured", "not_implemented"]
EngineLevel = Literal["dangerous", "suspicious", "low", "unknown"]
# Validated threshold tier a trained model's score reached (phishing_detector/model_thresholds.json).
ModelTier = Literal["medium", "high"]


class _Lenient(BaseModel):
    # The engine may add fields; only the ones below are relied on.
    model_config = ConfigDict(extra="ignore")


class EngineFinding(_Lenient):
    category: str
    score: float = Field(ge=0, le=1)
    title: str = Field(min_length=1)
    description: str
    evidence: str
    hard_override: bool = False


class EngineDetection(_Lenient):
    name: str = Field(min_length=1)
    status: DetectorStatus
    findings: list[EngineFinding] = []
    detail: str = ""
    score: float = Field(default=0, ge=0, le=1)
    model_score: float | None = Field(default=None, ge=0, le=1)
    tier: ModelTier | None = None


class EngineEntity(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str = Field(min_length=1)
    value: str
    normalized: str | None = None


class EngineRisk(_Lenient):
    level: EngineLevel
    score: float = Field(ge=0, le=100)


class EngineOutput(_Lenient):
    analysis_id: str = Field(min_length=1)
    text: str
    entities: list[EngineEntity]
    detected_urls: list[str]
    detectors: list[EngineDetection]
    risk: EngineRisk
    score_version: str
    # Image classifier result; None when it did not run.
    label: Literal["legitimate", "phishing"] | None = None
    confidence: float | None = Field(default=None, ge=0, le=100)


# ---------------------------------------------------------------- API response

RiskLevel = Literal["HIGH_ATTENTION", "ELEVATED", "MODERATE", "LOW_ATTENTION", "INCONCLUSIVE"]
RiskCategory = Literal["HIGH", "MEDIUM", "LOW", "UNKNOWN"]
Action = Literal["STOP_AND_VERIFY", "VERIFY_BEFORE_PROCEEDING", "RETRY_WITH_CLEARER_INPUT"]
Classification = Literal["likely_scam", "suspicious", "no_strong_indicators", "undetermined"]
# COMPLETED: every check that applies ran. PARTIAL: a trained model could not run.
AnalysisStatus = Literal["COMPLETED", "PARTIAL", "INCONCLUSIVE"]


class Risk(BaseModel):
    level: RiskLevel
    # Three-band summary of level: HIGH_ATTENTION, ELEVATED or MODERATE, LOW_ATTENTION.
    category: RiskCategory
    score: int = Field(ge=0, le=100)
    score_max: Literal[100] = 100
    # How reliably the input was read (OCR quality), not the probability of fraud.
    confidence: float = Field(ge=0, le=1)
    confidence_basis: Literal["ocr_read_quality", "typed_text"]
    engine_level: EngineLevel
    engine_score: float = Field(ge=0, le=100)


class Signal(BaseModel):
    id: str = Field(min_length=1)
    category: str
    severity: Literal["high", "medium", "low"]
    title: str = Field(min_length=1)
    description: str
    evidence: list[str] = []
    origin: Literal["engine", "investor_rules"]


class Recommendation(BaseModel):
    action: Action
    message: str = Field(min_length=1)


class DetectorSummary(BaseModel):
    name: str
    status: DetectorStatus
    score: float = Field(ge=0, le=1)
    # Trained models only. model_score is the raw, uncalibrated output; tier is what counts.
    model_score: float | None = Field(default=None, ge=0, le=1)
    tier: ModelTier | None = None


class Metadata(BaseModel):
    processing_time_ms: int = Field(ge=0)
    ocr_time_ms: int | None = Field(default=None, ge=0)
    engine_time_ms: int = Field(ge=0)
    engine_version: str
    contract_version: str = CONTRACT_VERSION
    source: str
    # Checks that could not run for this analysis, in plain words.
    unavailable_checks: list[str] = []


class FocusReport(BaseModel):
    focus: Literal["investment", "links", "explain", "verify"]
    question: str
    answer: str
    detected: list[str]
    uncertain: list[str]
    next_steps: list[str]


class AnalysisResponse(BaseModel):
    analysis_id: str = Field(min_length=1)
    analyzed_at: str
    status: Literal["success", "inconclusive"]
    analysis_status: AnalysisStatus
    classification: Classification
    analysis_mode: Literal["screenshot_ocr", "pasted_text"]
    extracted_text: str
    detected_urls: list[str]
    risk: Risk
    signals: list[Signal]
    explanation: str = Field(min_length=1)
    verification: list[str]
    recommendation: Recommendation
    detectors: list[DetectorSummary]
    metadata: Metadata
    focus_report: FocusReport | None = None
