import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
// Keep this address aligned with the laptop running FastAPI.
const API_BASE_URL = "http://192.168.29.197:8000";


import {
  createImageJSON,
  storeImageJSON,
  getImageJSON,
  getImageJSONString,
} from "./imageJson";

export async function convertScreenshotToJSON(
  imageUri: string
): Promise<string> {

  // Read image as Base64.
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  // Create JSON object.
  const imageJSON = createImageJSON(base64Image);

  // Store it in app memory.
  storeImageJSON(imageJSON);

  // Return JSON string for use elsewhere in the program.
  const jsonString = getImageJSONString();

  if (!jsonString) {
    throw new Error("Failed to create image JSON.");
  }

  return jsonString;
}

// Other functions in api.ts remain unchanged.
export interface AnalysisSignal {
  category: string;
  severity: string;
  title: string;
  description: string;
}

export interface AnalysisResult {
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

// Save the selected screenshot as Base64 JSON on the laptop.
export async function saveScreenshotAsJson(
  imageUri: string,
  fileName: string
): Promise<string> {
  // Convert the image into a Base64 string.
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  // Create the JSON payload.
  const payload = {
    image: base64Image,
  };

  // Send the JSON to FastAPI.
  const response = await fetch(
    `${API_BASE_URL}/api/v1/save-image-json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

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

  return result.saved_to || "Image JSON saved successfully";
}

// Existing screenshot analysis function.
export async function sendScreenshotForAnalysis(
  imageUri: string,
  fileName: string,
  mimeType: string
): Promise<AnalysisResult> {
  const imageFile = new File(imageUri);
  const formData = new FormData();

  formData.append(
    "image",
    imageFile as unknown as Blob,
    fileName || "screenshot.jpg"
  );

  const response = await fetch(`${API_BASE_URL}/api/v1/analyze`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  const responseText = await response.text();
  let data: unknown;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error("The backend returned an unreadable response.");
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;

    throw new Error(`Screenshot analysis failed: ${detail}`);
  }

  if (typeof data !== "object" || data === null) {
    throw new Error("The backend response has an unexpected format.");
  }

  const result = data as AnalysisResult;

  if (
    !result.risk ||
    !Array.isArray(result.signals) ||
    !Array.isArray(result.verification)
  ) {
    throw new Error("The backend response is missing required analysis fields.");
  }

  void mimeType;

  return result;
}

export async function sendTextForAnalysis(
  text: string
): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/api/v1/analyze-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const responseText = await response.text();
  let data: unknown;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error("The backend returned an unreadable response.");
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new Error(`Text analysis failed: ${detail}`);
  }

  if (typeof data !== "object" || data === null) {
    throw new Error("The backend response has an unexpected format.");
  }

  const result = data as AnalysisResult;

  if (
    !result.risk ||
    !Array.isArray(result.signals) ||
    !Array.isArray(result.verification)
  ) {
    throw new Error("The backend response is missing required analysis fields.");
  }

  return result;
}