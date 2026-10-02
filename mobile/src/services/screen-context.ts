import { Directory, File, Paths } from "expo-file-system";
import { Linking, Platform } from "react-native";

/**
 * Content handed over by the Android "Analyze screen" tile or the share sheet.
 * Native code writes it to cache/screen-context/<id>.jpg|.txt and opens
 * sangyanshield://screen-context with only the random id, never the content itself.
 */

export type ContextSource = "tile" | "share";

export type ContextErrorKind =
  | "denied"
  | "blank"
  | "timeout"
  | "stopped"
  | "failed"
  | "unsupported"
  | "unreadable"
  | "empty"
  | "missing";

export type LoadedContext =
  | { kind: "image"; uri: string }
  | { kind: "text"; text: string };

const DIR_NAME = "screen-context";
const CAPTURE_ID = /^[a-f0-9]{32}$/;
// Matches the native size limit; anything that slipped past it is cut here too.
const MAX_TEXT_LENGTH = 8000;
const STALE_AFTER_MS = 30 * 60 * 1000;

const ERROR_KINDS: ContextErrorKind[] = [
  "denied",
  "blank",
  "timeout",
  "stopped",
  "failed",
  "unsupported",
  "unreadable",
  "empty",
  "missing",
];

export function parseErrorKind(value: unknown): ContextErrorKind {
  return ERROR_KINDS.includes(value as ContextErrorKind) ? (value as ContextErrorKind) : "failed";
}

function captureDir() {
  return new Directory(Paths.cache, DIR_NAME);
}

/** Reads a capture by id. Text is loaded into memory and its file removed straight away. */
export async function loadCapture(
  id: string | undefined,
  kind: string | undefined
): Promise<LoadedContext | null> {
  if (!id || !CAPTURE_ID.test(id)) return null;
  try {
    if (kind === "text") {
      const file = new File(Paths.cache, DIR_NAME, `${id}.txt`);
      if (!file.exists) return null;
      const text = (await file.text()).slice(0, MAX_TEXT_LENGTH).trim();
      file.delete();
      return text ? { kind: "text", text } : null;
    }
    const file = new File(Paths.cache, DIR_NAME, `${id}.jpg`);
    return file.exists ? { kind: "image", uri: file.uri } : null;
  } catch {
    return null;
  }
}

/** True for files this feature created, so other images (gallery picks) are never deleted. */
export function isCaptureUri(uri: string | null | undefined): uri is string {
  return !!uri && uri.startsWith(captureDir().uri);
}

export function deleteCapture(uri: string | null | undefined) {
  if (!isCaptureUri(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the cache was cleared by the system.
  }
}

/** Removes captures left behind by checks that were abandoned (for example, the app was closed). */
export function purgeStaleCaptures() {
  if (Platform.OS !== "android") return;
  try {
    const dir = captureDir();
    if (!dir.exists) return;
    const now = Date.now();
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const modified = entry.lastModified ?? 0;
      if (now - modified > STALE_AFTER_MS) entry.delete();
    }
  } catch {
    // Best effort; Android also clears the cache when storage runs low.
  }
}

/** Opens Android's "Add tile" prompt (Android 13+). Returns false when it isn't available. */
export async function requestAddScreenTile(packageName: string): Promise<boolean> {
  if (Platform.OS !== "android" || (Platform.Version as number) < 33) return false;
  try {
    await Linking.sendIntent(`${packageName}.action.ADD_SCREEN_TILE`);
    return true;
  } catch {
    return false;
  }
}
