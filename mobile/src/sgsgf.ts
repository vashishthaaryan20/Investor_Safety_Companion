import { fetch } from "expo/fetch";
import * as FileSystem from "expo-file-system/legacy";

// Keep this address aligned with the laptop running FastAPI.
const API_BASE_URL = "http://192.168.29.197:8000";

/**
 * Converts an image URI into a Base64 JSON string.
 *
 * Input: Image URI from Expo Image Picker
 * Output: JSON string containing the Base64-encoded image
 */
export async function encodeImageToBase64(
  imageUri: string
): Promise<string> {
  try {
    // Read the image and encode it in Base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Construct the required JSON object
    const imageData = {
      image: base64Image,
    };

    // Return JSON as a text string
    return JSON.stringify(imageData, null, 4);
  } catch (error) {
    throw new Error(
      `Failed to encode image: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Encodes an image and saves the resulting JSON
 * into a separate file in the app's document directory.
 */
export async function saveImageAsBase64Json(
  imageUri: string
): Promise<string> {
  const jsonString = await encodeImageToBase64(imageUri);

  const outputUri =
    FileSystem.documentDirectory + "encoded_image.json";

  await FileSystem.writeAsStringAsync(outputUri, jsonString, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return jsonString;
}

export async function testImageEncoding(imageUri: string) {
  try {
    const jsonString = await saveImageAsBase64Json(imageUri);

    console.log("Image encoded successfully!");
    console.log("JSON file saved at:");

    console.log(
      FileSystem.documentDirectory + "encoded_image.json"
    );

    console.log("JSON output:", jsonString.substring(0, 200));

  } catch (error) {
    console.error("Encoding failed:", error);
  }
}