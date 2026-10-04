import type { AnalysisResult, AnalysisSignal, FocusReport } from "./api";

/**
 * Masks personal and financial details before a check is saved on the phone. The scam
 * signs stay readable; numbers that could identify the user or their accounts don't.
 * The same input always produces the same output, so evidence phrases still match the
 * saved text for highlighting.
 */

const MASK = "•";

function keepLast(value: string, visible: number) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= visible) return MASK.repeat(digits.length);
  return MASK.repeat(digits.length - visible) + digits.slice(-visible);
}

function maskName(local: string) {
  return local.length <= 2 ? MASK.repeat(local.length) : local.slice(0, 2) + MASK.repeat(3);
}

const URL_WITH_QUERY = /\b((?:https?:\/\/|www\.)[^\s?#]+)[?#][^\s]*/gi;
const EMAIL = /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;
const UPI_ID = /\b([A-Za-z0-9._-]{2,})@([A-Za-z][A-Za-z0-9]{1,30})\b(?!\.)/g;
const CARD = /\b\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}\b/g;
const AADHAAR = /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const SPLIT_PHONE = /(?:\+?91[ -]?)?\b[6-9]\d{4}[ -]\d{5}\b/g;
// Account, phone and reference numbers. Amounts written with commas or decimals are left alone.
const LONG_NUMBER = /(^|[^\d,.])((?:\+?91[ -]?)?\d{8,18})(?![\d,.])/g;
const SECRET_CODE = /\b(otp|one[- ]time password|code|pin|cvv|password|passcode)(\W{0,12}(?:is|:)?\W{0,4})(\d{3,8})\b/gi;

export function redactText(text: string): string {
  if (!text) return text;
  return (
    text
      // Reset links and payment links often carry tokens in the query string.
      .replace(URL_WITH_QUERY, (_match, base: string) => `${base}?…`)
      .replace(EMAIL, (_match, local: string, domain: string) => `${maskName(local)}@${domain}`)
      .replace(UPI_ID, (_match, name: string, handle: string) => `${maskName(name)}@${handle}`)
      .replace(CARD, (match) => keepLast(match, 4))
      .replace(AADHAAR, (match) => keepLast(match, 4))
      .replace(PAN, (match) => match.slice(0, 2) + MASK.repeat(7) + match.slice(-1))
      .replace(SECRET_CODE, (_match, label: string, gap: string, code: string) =>
        `${label}${gap}${MASK.repeat(code.length)}`
      )
      .replace(SPLIT_PHONE, (match) => keepLast(match, 4))
      .replace(LONG_NUMBER, (_match, before: string, number: string) => before + keepLast(number, 4))
  );
}

function redactList(items: string[] | undefined) {
  return items?.map(redactText);
}

function redactSignal(signal: AnalysisSignal): AnalysisSignal {
  return { ...signal, evidence: redactList(signal.evidence) };
}

function redactFocusReport(report: FocusReport): FocusReport {
  return {
    ...report,
    answer: redactText(report.answer),
    detected: report.detected.map(redactText),
    uncertain: report.uncertain.map(redactText),
  };
}

/** The copy of a result that is safe to keep in on-device history. */
export function redactResult(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    extracted_text: result.extracted_text ? redactText(result.extracted_text) : result.extracted_text,
    detected_urls: result.detected_urls.map(redactText),
    signals: result.signals.map(redactSignal),
    focus_report: result.focus_report ? redactFocusReport(result.focus_report) : undefined,
  };
}
