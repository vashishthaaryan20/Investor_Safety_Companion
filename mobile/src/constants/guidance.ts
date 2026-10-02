import type { AnalysisSignal } from "@/services/api";

import type { LearnTopicId } from "./learn-content";

export type SignalId =
  | "guaranteed_returns"
  | "urgency"
  | "unverified_tip"
  | "fake_regulator"
  | "unregistered_adviser"
  | "fake_platform"
  | "pyramid_scheme"
  | "sensitive_request"
  | "payment_request"
  | "suspicious_url"
  | "phishing_visual";

export interface SignalGuidance {
  /** Completes the sentence "We rated this … because it …". */
  reason: string;
  whyItMatters: string;
  action: string;
  steps: string[];
  learnTopic: LearnTopicId;
}

const GUIDANCE: Record<SignalId, SignalGuidance> = {
  guaranteed_returns: {
    reason: "promises guaranteed or very high returns",
    whyItMatters:
      "All market investments carry risk. Anyone promising fixed or multiplied profits is either misleading you or running a scam.",
    action: "Verify claims independently. Don't rely on promised profits.",
    steps: [
      "Ask yourself: how can anyone guarantee profit in a market that goes up and down?",
      "Search the company name with words like 'fraud' or 'complaint'.",
      "Check the firm on SEBI's registered intermediaries list before paying.",
    ],
    learnTopic: "common-scams",
  },
  urgency: {
    reason: "pushes you to act fast",
    whyItMatters:
      "Deadlines and 'limited slots' are used to stop you from thinking or asking others. Genuine investments don't vanish in minutes.",
    action: "Pause before transferring money.",
    steps: [
      "Wait at least a day before deciding on any investment.",
      "Talk to a family member or someone you trust first.",
      "If they won't let you take time, treat it as a scam.",
    ],
    learnTopic: "common-scams",
  },
  unverified_tip: {
    reason: "shares secret tips or promotes a chat group",
    whyItMatters:
      "Tip groups on WhatsApp and Telegram are a common entry point for 'pump and dump' schemes and fake trading apps.",
    action: "Ignore tips from strangers and chat groups.",
    steps: [
      "Exit groups that you were added to without asking.",
      "Don't buy shares or pay for 'premium tips' based on chat messages.",
      "Report the number on the Chakshu portal (sancharsaathi.gov.in).",
    ],
    learnTopic: "common-scams",
  },
  fake_regulator: {
    reason: "uses SEBI or government names to look trustworthy",
    whyItMatters:
      "SEBI registers advisers and brokers but never approves schemes or guarantees returns. A 'SEBI approved' label on an offer is a red flag.",
    action: "Verify registration through official sources.",
    steps: [
      "Search the firm on SEBI's registered intermediaries list at sebi.gov.in.",
      "Make sure the name, phone number, and website match SEBI's records.",
      "Call the SEBI helpline 1800 266 7575 if you're unsure.",
    ],
    learnTopic: "fake-sebi-registration",
  },
  unregistered_adviser: {
    reason: "offers investment advice without proof of SEBI registration",
    whyItMatters:
      "Only SEBI-registered investment advisers (INA…) and research analysts (INH…) may give paid stock advice. Unregistered 'experts' have no accountability.",
    action: "Verify registration through official sources.",
    steps: [
      "Ask for their SEBI registration number and check it on sebi.gov.in.",
      "Confirm the name and contact details match the SEBI record exactly.",
      "Pay only to the registered firm's account. Their UPI ID should contain '@valid'.",
    ],
    learnTopic: "fake-sebi-registration",
  },
  fake_platform: {
    reason: "shows signs of a fake trading app",
    whyItMatters:
      "Fake apps display made-up profits, then demand 'tax' or fees before withdrawal. The money never reaches the real market.",
    action: "Use only SEBI-registered brokers' official apps.",
    steps: [
      "Don't install trading apps from links. Use the Play Store or App Store only.",
      "Never pay a fee or tax to withdraw your own money.",
      "Check the broker's name on SEBI's list of registered stock brokers.",
    ],
    learnTopic: "fake-trading-platforms",
  },
  pyramid_scheme: {
    reason: "pays you to recruit other people",
    whyItMatters:
      "Schemes that pay for recruiting survive only while new people join. When joining slows, they collapse and most members lose money.",
    action: "Don't join, and don't recruit friends or family.",
    steps: [
      "Ask where the profit really comes from. If it's from new members, walk away.",
      "Don't forward the offer to others.",
      "Report the scheme on cybercrime.gov.in.",
    ],
    learnTopic: "ponzi-pyramid",
  },
  sensitive_request: {
    reason: "asks for your OTP, PIN, or password",
    whyItMatters:
      "An OTP or PIN gives full access to your bank, UPI, or demat account. No real bank, broker, or SEBI official will ever ask for it.",
    action: "Never share OTP, PIN, or passwords.",
    steps: [
      "Don't reply with any code you received by SMS.",
      "Hang up and call your bank using the number on your card or passbook.",
      "If you already shared it, use the emergency steps right away.",
    ],
    learnTopic: "phishing-impersonation",
  },
  payment_request: {
    reason: "asks you to send money",
    whyItMatters:
      "Money sent by UPI, wallet, or crypto to strangers is very hard to recover. Scammers prefer these because they are instant.",
    action: "Don't pay anyone who contacted you first.",
    steps: [
      "Pay only to the registered firm's own account, never a personal UPI ID.",
      "SEBI-registered firms use verified UPI IDs that contain '@valid'.",
      "Never pay to 'unlock', 'release', or 'confirm' anything.",
    ],
    learnTopic: "safe-investing",
  },
  suspicious_url: {
    reason: "contains links that could lead to fake websites",
    whyItMatters:
      "Links in such messages often open look-alike pages that steal login details or install harmful apps.",
    action: "Avoid opening links or submitting information.",
    steps: [
      "Don't tap the link. Type the official website address yourself.",
      "Watch for odd spellings or short links like bit.ly.",
      "Never enter your PIN, password, or OTP on a page opened from a message.",
    ],
    learnTopic: "phishing-impersonation",
  },
  phishing_visual: {
    reason: "looks like a known fake web page",
    whyItMatters:
      "The screenshot resembles pages used in phishing attacks, which copy the look of real brands to steal your details.",
    action: "Avoid opening links or submitting information.",
    steps: [
      "Close the page without entering anything.",
      "Open the company's official app or website yourself to check.",
      "If you entered details, change your passwords and call your bank.",
    ],
    learnTopic: "phishing-impersonation",
  },
};

const GENERIC_GUIDANCE: SignalGuidance = {
  reason: "shows a common scam warning sign",
  whyItMatters: "Scammers use many tricks. Any warning sign is a reason to slow down and check.",
  action: "Stop and verify before doing anything.",
  steps: [
    "Don't pay or share details until you've checked the source.",
    "Verify the person or firm on SEBI's website.",
  ],
  learnTopic: "safe-investing",
};

/** Older saved checks don't have signal ids, so fall back to the title and category. */
export function getSignalId(signal: AnalysisSignal): SignalId | undefined {
  if (signal.id && signal.id in GUIDANCE) {
    return signal.id as SignalId;
  }
  const title = signal.title.toLowerCase();
  if (title.includes("guaranteed") || title.includes("returns")) return "guaranteed_returns";
  if (title.includes("act fast")) return "urgency";
  if (title.includes("tip")) return "unverified_tip";
  if (title.includes("sebi") || title.includes("government")) return "fake_regulator";
  if (title.includes("adviser") || title.includes("registration")) return "unregistered_adviser";
  if (title.includes("trading app") || title.includes("platform")) return "fake_platform";
  if (title.includes("recruit")) return "pyramid_scheme";
  if (title.includes("otp") || title.includes("sensitive")) return "sensitive_request";
  if (title.includes("money")) return "payment_request";
  if (title.includes("link")) return "suspicious_url";
  if (title.includes("fake page")) return "phishing_visual";
  if (signal.category === "privacy") return "sensitive_request";
  if (signal.category === "visual") return "phishing_visual";
  return undefined;
}

export function getSignalGuidance(signal: AnalysisSignal): SignalGuidance {
  const id = getSignalId(signal);
  return id ? GUIDANCE[id] : GENERIC_GUIDANCE;
}

export function isLinkSignal(signal: AnalysisSignal): boolean {
  const id = getSignalId(signal);
  return id === "suspicious_url";
}

/** "it promises guaranteed returns, pushes you to act fast, and asks for your OTP" */
export function buildReasonSentence(signals: AnalysisSignal[]): string {
  const reasons = Array.from(new Set(signals.map((signal) => getSignalGuidance(signal).reason)));
  if (!reasons.length) return "";
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

export interface SafetyAction {
  key: string;
  title: string;
  detail?: string;
}

/** Signal-specific actions first (most serious first), then the general verification steps. */
export function buildSafetyPlan(signals: AnalysisSignal[], verification: string[]): SafetyAction[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...signals].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
  const plan: SafetyAction[] = [];
  const seen = new Set<string>();

  for (const signal of sorted) {
    const guidance = getSignalGuidance(signal);
    if (seen.has(guidance.action)) continue;
    seen.add(guidance.action);
    plan.push({ key: `signal-${guidance.action}`, title: guidance.action, detail: guidance.steps[0] });
  }

  for (const step of verification) {
    if (seen.has(step)) continue;
    seen.add(step);
    plan.push({ key: `verify-${step}`, title: step });
  }
  return plan;
}

export function getRelatedTopics(signals: AnalysisSignal[]): LearnTopicId[] {
  return Array.from(new Set(signals.map((signal) => getSignalGuidance(signal).learnTopic)));
}
