import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

import type { AnalysisResult } from "@/services/api";

import { ToneColors, type Tone } from "./design";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Every risk level has a distinct label and icon shape as well as a colour, so it is
 * understandable without colour (colour blindness, greyscale, screen readers).
 */
export interface RiskCopy {
  label: string;
  headline: string;
  advice: string;
  tone: Tone;
  color: string;
  soft: string;
  border: string;
  icon: IconName;
}

function riskCopy(
  tone: Tone,
  icon: IconName,
  label: string,
  headline: string,
  advice: string
): RiskCopy {
  const colors = ToneColors[tone];
  return { label, headline, advice, tone, icon, color: colors.fg, soft: colors.bg, border: colors.border };
}

const RISK_COPY: Record<string, RiskCopy> = {
  HIGH_ATTENTION: riskCopy(
    "critical",
    "warning",
    "High risk",
    "Strong signs of a scam",
    "Do not pay, click links, or share OTPs."
  ),
  ELEVATED: riskCopy(
    "warning",
    "alert-circle",
    "Risky",
    "Several warning signs found",
    "Stop and verify before doing anything."
  ),
  MODERATE: riskCopy(
    "caution",
    "eye",
    "Be careful",
    "Some warning signs found",
    "Check the source before you act."
  ),
  LOW_ATTENTION: riskCopy(
    "success",
    "shield-checkmark",
    "Low risk",
    "No common scam signs found",
    "This is not a guarantee. Always verify first."
  ),
};

const UNCLEAR_COPY = riskCopy(
  "neutral",
  "help-circle",
  "Unclear",
  "We couldn't check this properly",
  "Try a clearer screenshot or paste the message."
);

export function getRiskCopy(level: string): RiskCopy {
  if (level === "INCONCLUSIVE") return UNCLEAR_COPY;
  return RISK_COPY[level] ?? RISK_COPY.MODERATE;
}

/** The backend's score and the scale it used (results saved before contract 1.0 are out of 10). */
export function getRiskScore(result: AnalysisResult): { value: number; max: number } {
  const max = result.risk.score_max && result.risk.score_max > 0 ? result.risk.score_max : 10;
  return { value: Math.round(Math.min(max, Math.max(0, result.risk.score))), max };
}

export interface ConfidenceCopy {
  percent: number;
  label: string;
  note: string;
}

/** Reading confidence in plain words; undefined for results that don't report it. */
export function getConfidenceCopy(result: AnalysisResult): ConfidenceCopy | undefined {
  const { confidence, confidence_basis: basis } = result.risk;
  if (confidence === undefined) return undefined;
  const percent = Math.round(confidence * 100);
  if (basis === "typed_text") {
    return { percent, label: "Exact text", note: "You typed or pasted this, so every word was checked as written." };
  }
  const label = confidence >= 0.85 ? "Clear" : confidence >= 0.6 ? "Mostly clear" : "Hard to read";
  return {
    percent,
    label,
    note:
      "How clearly we could read the words in your screenshot. It is not the chance that this is a scam." +
      (confidence < 0.6 ? " Some words may have been misread, so check the original message." : ""),
  };
}

/** The level's headline, worded to match how many signals are listed under it. */
export function getHeadline(result: AnalysisResult): string {
  const copy = getRiskCopy(result.risk.level);
  const count = result.signals.length;
  switch (result.risk.level) {
    case "ELEVATED":
      return count === 1 ? "A serious warning sign found" : copy.headline;
    case "MODERATE":
      return count === 1 ? "A warning sign found" : copy.headline;
    case "LOW_ATTENTION":
      return count > 0 ? "Only minor signs found" : copy.headline;
    default:
      return copy.headline;
  }
}

export function getResultCopy(result: AnalysisResult): RiskCopy {
  return isInconclusive(result) ? UNCLEAR_COPY : getRiskCopy(result.risk.level);
}

export interface SeverityCopy {
  label: string;
  color: string;
  soft: string;
  icon: IconName;
}

export function getSeverityCopy(severity: string): SeverityCopy {
  switch (severity) {
    case "high":
      return { label: "Serious", color: ToneColors.critical.fg, soft: ToneColors.critical.bg, icon: "warning" };
    case "medium":
      return { label: "Caution", color: ToneColors.warning.fg, soft: ToneColors.warning.bg, icon: "alert-circle" };
    default:
      return { label: "Note", color: ToneColors.neutral.fg, soft: ToneColors.neutral.bg, icon: "information-circle" };
  }
}

const CATEGORY_ICONS: Record<string, IconName> = {
  content: "trending-up",
  behavior: "timer-outline",
  source: "people-outline",
  privacy: "key-outline",
  visual: "image-outline",
};

export function getCategoryIcon(category: string): IconName {
  return CATEGORY_ICONS[category] ?? "alert-circle-outline";
}

export function isInconclusive(result: AnalysisResult): boolean {
  if (result.status === "inconclusive" || result.risk.level === "INCONCLUSIVE") {
    return true;
  }
  return !result.extracted_text?.trim() && result.signals.length === 0;
}
