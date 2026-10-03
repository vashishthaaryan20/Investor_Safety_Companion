import { fetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";


import {
  createImageJSON,
  storeImageJSON,
  getImageJSONString,
} from "./imageJson";

// Keep this address aligned with the laptop running FastAPI.
const API_BASE_URL = "http://172.20.10.4:8000";

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
  analysis_id?: string;
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
  const formData = new FormData();
  if (Platform.OS === "web") {
    // ImagePicker returns a browser URI; Expo's filesystem File is native-only.
    const imageResponse = await globalThis.fetch(imageUri);
    if (!imageResponse.ok) {
      throw new Error("Unable to read the selected image. Please select it again.");
    }
    const blob = await imageResponse.blob();
    const imageBlob = blob.type || !mimeType ? blob : new Blob([blob], { type: mimeType });
    formData.append("image", imageBlob, fileName || "screenshot.jpg");
  } else {
    const imageFile = new ExpoFile(imageUri);
    formData.append("image", imageFile as unknown as Blob, fileName || "screenshot.jpg");
  }

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

  return result;
}
export async function submitFeedback(analysisId: string, kind: "wrong_verdict" | "report_scam", evidenceText: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_id: analysisId, kind, evidence_text: evidenceText }),
  });
  if (!response.ok) throw new Error("Unable to submit feedback. Please retry.");
}
