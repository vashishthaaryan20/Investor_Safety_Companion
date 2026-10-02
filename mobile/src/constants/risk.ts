import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

import type { AnalysisResult } from "@/services/api";

import { Palette } from "./palette";

type IconName = ComponentProps<typeof Ionicons>["name"];

export interface RiskCopy {
  label: string;
  headline: string;
  advice: string;
  color: string;
  soft: string;
  icon: IconName;
}

const RISK_COPY: Record<string, RiskCopy> = {
  HIGH_ATTENTION: {
    label: "High risk",
    headline: "Strong signs of a scam",
    advice: "Do not pay, click links, or share OTPs.",
    color: Palette.danger,
    soft: Palette.dangerSoft,
    icon: "warning",
  },
  ELEVATED: {
    label: "Risky",
    headline: "Several warning signs found",
    advice: "Stop and verify before doing anything.",
    color: Palette.warning,
    soft: Palette.warningSoft,
    icon: "alert-circle",
  },
  MODERATE: {
    label: "Be careful",
    headline: "Some warning signs found",
    advice: "Check the source before you act.",
    color: Palette.caution,
    soft: Palette.cautionSoft,
    icon: "help-circle",
  },
  LOW_ATTENTION: {
    label: "Low risk",
    headline: "No common scam signs found",
    advice: "This is not a guarantee. Always verify first.",
    color: Palette.success,
    soft: Palette.successSoft,
    icon: "shield-checkmark",
  },
};

export function getRiskCopy(level: string): RiskCopy {
  return RISK_COPY[level] ?? RISK_COPY.MODERATE;
}

export interface SeverityCopy {
  label: string;
  color: string;
  soft: string;
}

export function getSeverityCopy(severity: string): SeverityCopy {
  switch (severity) {
    case "high":
      return { label: "Serious", color: Palette.danger, soft: Palette.dangerSoft };
    case "medium":
      return { label: "Caution", color: Palette.warning, soft: Palette.warningSoft };
    default:
      return { label: "Note", color: Palette.muted, soft: Palette.background };
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
