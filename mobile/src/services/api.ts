import { fetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { DEFAULT_FOCUS, type AnalysisFocus } from "@/constants/analysis-focus";
import apiConfig from "@/constants/api-config.json";

import { ContractError, parseAnalysisResult } from "./analysis-contract";
import { clearImageJSON, createImageJSON, getImageJSONString, storeImageJSON } from "./imageJson";

/**
 * Server address. Set EXPO_PUBLIC_API_BASE_URL for a deployed (HTTPS) server, or edit
 * constants/api-config.json for the laptop on your Wi-Fi. The Android build only permits
 * plain HTTP to that one local address, so run `npx expo prebuild` after changing it.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || apiConfig.apiBaseUrl).replace(
  /\/+$/,
  ""
);

// The first screenshot after a server restart also loads the OCR model.
const REQUEST_TIMEOUT_MS = 90_000;
const FEEDBACK_TIMEOUT_MS = 20_000;
// Matches the server limit; larger files are refused before anything is uploaded.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface AnalysisSignal {
  id?: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence?: string[];
  /** "engine" for detection-engine findings, "investor_rules" for SANGYAN's investor-safety rules. */
  origin?: string;
}

export interface AnalysisRisk {
  level: string;
  score: number;
  /** 100 from contract 1.0; results saved earlier used a 1-10 scale and have no score_max. */
  score_max?: number;
  /** How reliably the input was read (0-1). Not the probability that it is a scam. */
  confidence?: number;
  confidence_basis?: "ocr_read_quality" | "typed_text";
  engine_level?: string;
  engine_score?: number;
  /** Contract 1.1: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN". */
  category?: string;
}

/** One detection step. Trained models also report their validated threshold tier. */
export interface AnalysisDetector {
  name: string;
  status: string;
  score: number;
  /** Raw model output (0-1). Not calibrated, so it is never shown as a probability. */
  model_score?: number | null;
  tier?: "medium" | "high" | null;
}

export interface AnalysisRecommendation {
  action: string;
  message: string;
}

export interface AnalysisMetadata {
  processing_time_ms?: number;
  ocr_time_ms?: number | null;
  engine_time_ms?: number;
  engine_version?: string;
  contract_version?: string;
  source?: string;
  /** Checks that could not run for this result, in plain words. */
  unavailable_checks?: string[];
}

/** Answer to the question picked before analysis; detected and uncertain points are kept apart. */
export interface FocusReport {
  focus: AnalysisFocus;
  question: string;
  answer: string;
  detected: string[];
  uncertain: string[];
  next_steps: string[];
}

export interface AnalysisResult {
  analysis_id?: string;
  analyzed_at?: string;
  status: string;
  /** Contract 1.1: "COMPLETED" | "PARTIAL" (a trained model could not run) | "INCONCLUSIVE". */
  analysis_status?: string;
  /** Contract 1.1: "likely_scam" | "suspicious" | "no_strong_indicators" | "undetermined". */
  classification?: string;
  detectors?: AnalysisDetector[];
  extracted_text?: string;
  detected_urls: string[];
  analysis_mode?: string;
  risk: AnalysisRisk;
  signals: AnalysisSignal[];
  explanation: string;
  verification: string[];
  recommendation?: AnalysisRecommendation;
  metadata?: AnalysisMetadata;
  focus_report?: FocusReport;
}

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "invalid_input"
  | "too_large"
  | "rate_limited"
  | "insecure"
  | "server"
  | "bad_response"
  | "cancelled";

export class ApiError extends Error {
  kind: ApiErrorKind;
  /** The server's machine-readable reason, e.g. "image_too_small", when it sent one. */
  code?: string;

  constructor(kind: ApiErrorKind, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.code = code;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError("network", "The request could not be completed.");
}

// localhost, the Android emulator's host alias, and private (RFC 1918) network ranges.
const LOCAL_HOST =
  /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

/**
 * "https" for encrypted connections, "local" for plain HTTP to a laptop on the same Wi-Fi
 * (development and demos), "insecure" for plain HTTP over the internet, which is refused.
 */
export function connectionSecurity(url: string): "https" | "local" | "insecure" {
  const match = /^(https?):\/\/([^/:?#]+)/i.exec(url);
  if (!match) return "insecure";
  if (match[1].toLowerCase() === "https") return "https";
  return LOCAL_HOST.test(match[2].toLowerCase()) ? "local" : "insecure";
}

function errorKindForStatus(status: number): ApiErrorKind {
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 415 || status === 422) return "invalid_input";
  if (status === 504) return "timeout";
  return "server";
}

/** Technical summary for the error screen: status code and the server's own short message only. */
function describeFailure(status: number, data: unknown) {
  const detail =
    typeof data === "object" && data !== null && "detail" in data
      ? String((data as { detail: unknown }).detail).slice(0, 160)
      : "";
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
}

function errorCode(data: unknown): string | undefined {
  const code = typeof data === "object" && data !== null ? (data as { error?: unknown }).error : undefined;
  return typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : undefined;
}

async function request(
  path: string,
  init: { headers: Record<string, string>; body: FormData | string },
  { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal }
): Promise<unknown> {
  if (connectionSecurity(API_BASE_URL) === "insecure") {
    throw new ApiError("insecure", "Refused to send data over an unencrypted internet connection.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort);

  let response: Response;
  let responseText: string;

  try {
    response = (await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", ...init.headers },
      body: init.body,
      signal: controller.signal,
    })) as unknown as Response;
    responseText = await response.text();
  } catch {
    if (timedOut) {
      throw new ApiError("timeout", "The server took too long to respond.");
    }
    if (signal?.aborted) {
      throw new ApiError("cancelled", "The check was cancelled.");
    }
    throw new ApiError("network", "Could not reach the server.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new ApiError("bad_response", `HTTP ${response.status}: unreadable reply`);
  }

  if (!response.ok) {
    throw new ApiError(
      errorKindForStatus(response.status),
      describeFailure(response.status, data),
      errorCode(data)
    );
  }
  return data;
}

function asAnalysisResult(data: unknown): AnalysisResult {
  try {
    return parseAnalysisResult(data);
  } catch (error) {
    if (error instanceof ContractError) throw new ApiError("bad_response", error.message);
    throw error;
  }
}

export async function convertScreenshotToJSON(imageUri: string): Promise<string> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  storeImageJSON(createImageJSON(base64Image));
  const jsonString = getImageJSONString();
  // The screenshot shouldn't linger in memory once it has been handed over.
  clearImageJSON();

  if (!jsonString) {
    throw new Error("Failed to create image JSON.");
  }

  return jsonString;
}

/** Sends the screenshot as Base64 JSON. The server checks it in memory and stores nothing. */
export async function saveScreenshotAsJson(imageUri: string, fileName: string): Promise<string> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });
  void fileName;
  const data = (await request(
    "/api/v1/save-image-json",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: base64Image }) },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  )) as { message?: string };
  return data.message || "Image checked";
}

export async function sendScreenshotForAnalysis(
  imageUri: string,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal,
  captureSource = "scan",
  focus: AnalysisFocus = DEFAULT_FOCUS
): Promise<AnalysisResult> {
  const formData = new FormData();
  if (Platform.OS === "web") {
    // ImagePicker returns a browser URI; Expo's filesystem File is native-only.
    const imageResponse = await globalThis.fetch(imageUri);
    if (!imageResponse.ok) {
      throw new ApiError("invalid_input", "The selected image could not be read.");
    }
    const blob = await imageResponse.blob();
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new ApiError("too_large", "The image is larger than 10 MB.");
    }
    const imageBlob = blob.type || !mimeType ? blob : new Blob([blob], { type: mimeType });
    formData.append("image", imageBlob, fileName || "screenshot.jpg");
  } else {
    const imageFile = new ExpoFile(imageUri);
    if (!imageFile.exists) {
      throw new ApiError("invalid_input", "The screenshot is no longer on this phone.");
    }
    if ((imageFile.size ?? 0) > MAX_UPLOAD_BYTES) {
      throw new ApiError("too_large", "The image is larger than 10 MB.");
    }
    formData.append("image", imageFile as unknown as Blob, fileName || "screenshot.jpg");
  }

  return asAnalysisResult(
    await request(
      "/api/v1/analyze",
      {
        headers: { "X-Capture-Source": captureSource, "X-Analysis-Focus": focus },
        body: formData,
      },
      { timeoutMs: REQUEST_TIMEOUT_MS, signal }
    )
  );
}

export async function sendTextForAnalysis(
  text: string,
  signal?: AbortSignal,
  focus: AnalysisFocus = DEFAULT_FOCUS
): Promise<AnalysisResult> {
  return asAnalysisResult(
    await request(
      "/api/v1/analyze-text",
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, focus }) },
      { timeoutMs: REQUEST_TIMEOUT_MS, signal }
    )
  );
}

export async function submitFeedback(
  analysisId: string,
  kind: "wrong_verdict" | "report_scam",
  evidenceText: string
): Promise<void> {
  await request(
    "/api/v1/feedback",
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_id: analysisId,
        kind,
        evidence_text: evidenceText.slice(0, 20_000),
      }),
    },
    { timeoutMs: FEEDBACK_TIMEOUT_MS }
  );
}
