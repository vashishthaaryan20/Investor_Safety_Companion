import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

export type ImageSource = "library" | "camera";

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export type PickResult =
  | { status: "picked"; image: PickedImage }
  | { status: "cancelled" }
  | { status: "denied" }
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

async function ensureCameraPermission(): Promise<boolean> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.granted) {
    return true;
  }
  Alert.alert(
    "Camera permission needed",
    permission.canAskAgain
      ? "Allow camera access to take a photo, or choose a screenshot from your gallery instead."
      : "Camera access is turned off for SANGYAN Shield. Turn it on in Settings, or choose a screenshot from your gallery instead.",
    permission.canAskAgain
      ? [{ text: "OK" }]
      : [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
  );
  return false;
}

/** The gallery uses the system photo picker, which needs no storage permission. */
export async function pickImage(source: ImageSource): Promise<PickResult> {
  try {
    if (source === "camera" && !(await ensureCameraPermission())) {
      return { status: "denied" };
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
    Alert.alert("Couldn't open image", "Please try again or choose a different screenshot.");
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
