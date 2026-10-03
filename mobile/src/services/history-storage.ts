import AsyncStorage from "@react-native-async-storage/async-storage";

import { devWarn } from "@/utils/dev-log";

import type { AnalysisResult } from "./api";
import { redactResult, redactText } from "./redact";

const HISTORY_KEY = "sangyan.history.v1";
const SETTINGS_KEY = "sangyan.settings.v1";

export const MAX_HISTORY = 50;

export type ScanMode = "image" | "text";

// Screenshots are never stored: only the result and the text, with personal numbers masked.
export interface ScanRecord {
  id: string;
  createdAt: number;
  mode: ScanMode;
  preview: string;
  result: AnalysisResult;
}

export interface HistorySettings {
  saveHistory: boolean;
}

export const DEFAULT_SETTINGS: HistorySettings = {
  saveHistory: true,
};

function isScanRecord(value: unknown): value is ScanRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ScanRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "number" &&
    (record.mode === "image" || record.mode === "text") &&
    typeof record.result === "object" &&
    record.result !== null &&
    typeof record.result.risk === "object" &&
    Array.isArray(record.result.signals) &&
    Array.isArray(record.result.verification)
  );
}

export async function loadHistory(): Promise<ScanRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Entries saved before masking existed are masked on load and re-saved that way.
    return parsed
      .filter(isScanRecord)
      .map((record) => ({
        ...record,
        preview: redactText(record.preview ?? ""),
        result: redactResult(record.result),
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_HISTORY);
  } catch (error) {
    devWarn("Could not read saved history:", error);
    return [];
  }
}

export async function saveHistory(records: ScanRecord[]): Promise<void> {
  try {
    if (records.length === 0) {
      await AsyncStorage.removeItem(HISTORY_KEY);
      return;
    }
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch (error) {
    devWarn("Could not save history:", error);
  }
}

export async function loadSettings(): Promise<HistorySettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HistorySettings>;
    return {
      saveHistory:
        typeof parsed.saveHistory === "boolean" ? parsed.saveHistory : DEFAULT_SETTINGS.saveHistory,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: HistorySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    devWarn("Could not save settings:", error);
  }
}
