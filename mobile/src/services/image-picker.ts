import * as ImagePicker from "expo-image-picker";

export type ImageSource = "library" | "camera";

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

/**
 * `denied.canAskAgain` is false once Android stops showing the permission prompt;
 * the only recovery path then is the system Settings screen.
 */
export type PickResult =
  | { status: "picked"; image: PickedImage }
  | { status: "cancelled" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "error" };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  quality: 0.8,
};

function toPickedImage(asset: ImagePicker.ImagePickerAsset): PickedImage {
  return {
    uri: asset.uri,
    name: asset.fileName || "screenshot.jpg",
    type: asset.mimeType || "image/jpeg",
  };
}

/** The gallery uses the system photo picker, which needs no storage permission. */
export async function pickImage(source: ImageSource): Promise<PickResult> {
  try {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { status: "denied", canAskAgain: permission.canAskAgain };
      }
    }
    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

    if (picked.canceled || !picked.assets?.length) {
      return { status: "cancelled" };
    }
    return { status: "picked", image: toPickedImage(picked.assets[0]) };
  } catch (error) {
    console.error("Image selection failed:", error);
    return { status: "error" };
  }
}

/** Android can close the app while the camera is open; this recovers the photo on relaunch. */
export async function recoverPendingImage(): Promise<PickedImage | null> {
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (pending && "assets" in pending && !pending.canceled && pending.assets?.length) {
      return toPickedImage(pending.assets[0]);
    }
  } catch (error) {
    console.warn("Could not recover pending image:", error);
  }
  return null;
}
