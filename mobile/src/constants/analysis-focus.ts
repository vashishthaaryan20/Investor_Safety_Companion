import type { IconName } from "@/components/sangyan/ui";

/** What the user wants to know about shared content. Sent to the backend as context. */
export type AnalysisFocus = "investment" | "links" | "explain" | "verify";

export const DEFAULT_FOCUS: AnalysisFocus = "investment";

export interface FocusOption {
  id: AnalysisFocus;
  label: string;
  description: string;
  icon: IconName;
}

export const FOCUS_OPTIONS: FocusOption[] = [
  {
    id: "investment",
    label: "Analyze this investment message",
    description: "Look for common scam warning signs.",
    icon: "shield-checkmark-outline",
  },
  {
    id: "links",
    label: "Check whether this URL looks suspicious",
    description: "Check the web addresses for warning signs.",
    icon: "link-outline",
  },
  {
    id: "explain",
    label: "Explain the risk signals",
    description: "Show what triggered each warning, in plain words.",
    icon: "chatbubble-ellipses-outline",
  },
  {
    id: "verify",
    label: "What should I verify before investing?",
    description: "Get a checklist to confirm who you are dealing with.",
    icon: "checkmark-done-outline",
  },
];

export function isAnalysisFocus(value: unknown): value is AnalysisFocus {
  return FOCUS_OPTIONS.some((option) => option.id === value);
}
