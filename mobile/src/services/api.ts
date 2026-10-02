import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import {
  createImageJSON,
  storeImageJSON,
  getImageJSONString,
} from "./imageJson";

// Keep this address aligned with the laptop running FastAPI.
export const API_BASE_URL = "http://10.30.54.3:8000";

// The first screenshot after a server restart also loads the OCR model.
const REQUEST_TIMEOUT_MS = 90_000;

export interface AnalysisSignal {
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence?: string[];
}

export interface AnalysisResult {
  analysis_id?: string;
  analyzed_at?: string;
  status: string;
  extracted_text?: string;
  detected_urls: string[];
  analysis_mode?: string;
  risk: {
    level: string;
    score: number;
  };
  signals: AnalysisSignal[];
  explanation: string;
  verification: string[];
}

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "invalid_input"
  | "server"
  | "bad_response"
  | "cancelled";

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError("network", message);
}

export async function convertScreenshotToJSON(
  imageUri: string
): Promise<string> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  const imageJSON = createImageJSON(base64Image);
  storeImageJSON(imageJSON);

  const jsonString = getImageJSONString();

  if (!jsonString) {
    throw new Error("Failed to create image JSON.");
  }

  return jsonString;
}

// Save the selected screenshot as Base64 JSON on the laptop.
export async function saveScreenshotAsJson(
  imageUri: string,
  fileName: string
): Promise<string> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  const response = await fetch(`${API_BASE_URL}/api/v1/save-image-json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ image: base64Image }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Image JSON save failed: ${responseText || response.status}`
    );
  }

  let result: { message?: string; saved_to?: string };

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error("The backend returned an invalid save response.");
  }

  void fileName;

  return result.saved_to || "Image JSON saved successfully";
}

async function postForAnalysis(
  path: string,
  init: { headers: Record<string, string>; body: FormData | string },
  signal?: AbortSignal
): Promise<AnalysisResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
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
  } catch (error) {
    if (timedOut) {
      throw new ApiError("timeout", "The server took too long to respond.");
    }
    if (signal?.aborted) {
      throw new ApiError("cancelled", "The check was cancelled.");
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError("network", message);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new ApiError("bad_response", "The server sent an unreadable reply.");
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    const kind: ApiErrorKind =
      response.status === 400 || response.status === 422
        ? "invalid_input"
        : "server";
    throw new ApiError(kind, detail);
  }

  const result = data as AnalysisResult;

  if (
    typeof result !== "object" ||
    result === null ||
    !result.risk ||
    !Array.isArray(result.signals) ||
    !Array.isArray(result.verification)
  ) {
    throw new ApiError(
      "bad_response",
      "The server reply is missing analysis details."
    );
  }

  return result;
}

export async function sendScreenshotForAnalysis(
  imageUri: string,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  const imageFile = new File(imageUri);
  const formData = new FormData();

  formData.append(
    "image",
    imageFile as unknown as Blob,
    fileName || "screenshot.jpg"
  );

  void mimeType;

  return postForAnalysis(
    "/api/v1/analyze",
    { headers: {}, body: formData },
    signal
  );
}

export async function sendTextForAnalysis(
  text: string,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  return postForAnalysis(
    "/api/v1/analyze-text",
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
    signal
  );
}
