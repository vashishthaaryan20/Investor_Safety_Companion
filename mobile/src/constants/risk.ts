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
  return RISK_COPY[level] ?? RISK_COPY.MODERATE;
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
  if (result.status === "inconclusive") {
    return true;
  }
  return !result.extracted_text?.trim() && result.signals.length === 0;
}
