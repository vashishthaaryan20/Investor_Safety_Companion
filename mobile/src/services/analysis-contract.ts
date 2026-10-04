import type {
  AnalysisDetector,
  AnalysisMetadata,
  AnalysisRecommendation,
  AnalysisResult,
  AnalysisRisk,
  AnalysisSignal,
} from "./api";

export const RISK_LEVELS = ["HIGH_ATTENTION", "ELEVATED", "MODERATE", "LOW_ATTENTION", "INCONCLUSIVE"];

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isSignal = (value: unknown): value is AnalysisSignal =>
  isRecord(value) &&
  ["category", "severity", "title", "description"].every((key) => typeof value[key] === "string");

/**
 * Checks a server reply against the analysis contract (docs/backend-integration.md) before
 * anything is shown or saved. Required fields must be present and well-typed; optional ones
 * get safe defaults. Replies without `score_max` come from servers older than contract 1.0,
 * which scored out of 10.
 */
export function parseAnalysisResult(data: unknown): AnalysisResult {
  const invalid = (what: string) => new ContractError(`The server reply has ${what}.`);
  if (!isRecord(data)) throw invalid("no analysis details");

  const risk = data.risk;
  if (
    !isRecord(risk) ||
    typeof risk.level !== "string" ||
    !RISK_LEVELS.includes(risk.level) ||
    typeof risk.score !== "number" ||
    !Number.isFinite(risk.score)
  ) {
    throw invalid("a missing or unknown risk rating");
  }
  if (
    typeof data.status !== "string" ||
    typeof data.explanation !== "string" ||
    !Array.isArray(data.signals) ||
    !data.signals.every(isSignal) ||
    !isStringArray(data.verification) ||
    !isStringArray(data.detected_urls)
  ) {
    throw invalid("missing analysis details");
  }

  const scoreMax = typeof risk.score_max === "number" && risk.score_max > 0 ? risk.score_max : 10;
  const confidence =
    typeof risk.confidence === "number" && Number.isFinite(risk.confidence)
      ? Math.min(1, Math.max(0, risk.confidence))
      : undefined;
  const recommendation =
    isRecord(data.recommendation) &&
    typeof data.recommendation.action === "string" &&
    typeof data.recommendation.message === "string"
      ? (data.recommendation as unknown as AnalysisRecommendation)
      : undefined;

  return {
    ...(data as unknown as AnalysisResult),
    risk: {
      ...(risk as unknown as AnalysisRisk),
      score: Math.min(scoreMax, Math.max(0, risk.score)),
      score_max: scoreMax,
      confidence,
    },
    signals: (data.signals as AnalysisSignal[]).map((signal) => ({
      ...signal,
      evidence: isStringArray(signal.evidence) ? signal.evidence : [],
    })),
    recommendation,
    metadata: isRecord(data.metadata) ? (data.metadata as AnalysisMetadata) : undefined,
    detectors: Array.isArray(data.detectors) ? data.detectors.filter(isDetector) : undefined,
  };
}

const isDetector = (value: unknown): value is AnalysisDetector =>
  isRecord(value) && typeof value.name === "string" && typeof value.status === "string";
