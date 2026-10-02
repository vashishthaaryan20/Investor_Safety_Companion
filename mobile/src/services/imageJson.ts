
export interface ImageJSON {
  image: string;
}

// Temporary in-memory storage.
let storedImageJSON: ImageJSON | null = null;

// Create the JSON object from a Base64 string.
export function createImageJSON(base64: string): ImageJSON {
  if (!base64 || base64.trim().length === 0) {
    throw new Error("Base64 image data cannot be empty.");
  }

  return {
    image: base64,
  };
}

// Store JSON in the running app's memory.
export function storeImageJSON(data: ImageJSON): void {
  storedImageJSON = data;
}

// Retrieve the JSON from memory.
export function getImageJSON(): ImageJSON | null {
  return storedImageJSON;
}

// Convert the stored object into a JSON string.
export function getImageJSONString(): string | null {
  if (!storedImageJSON) {
    return null;
  }

  return JSON.stringify(storedImageJSON);
}

// Clear the temporary data.
export function clearImageJSON(): void {
  storedImageJSON = null;
}