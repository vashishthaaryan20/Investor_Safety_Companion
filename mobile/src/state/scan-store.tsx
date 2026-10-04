import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import type { AnalysisFocus } from "@/constants/analysis-focus";
import type { AnalysisResult, ApiError } from "@/services/api";
import { redactResult, redactText } from "@/services/redact";
import { deleteTempFile, purgeTempFiles } from "@/services/screen-context";
import {
  DEFAULT_SETTINGS,
  MAX_HISTORY,
  loadHistory,
  loadSettings,
  saveHistory,
  saveSettings,
  type HistorySettings,
  type ScanMode,
  type ScanRecord,
} from "@/services/history-storage";

export type { ScanMode, ScanRecord };

export interface ScanDraft {
  mode: ScanMode;
  imageUri: string | null;
  imageName: string;
  imageType: string;
  text: string;
  /** Where the content came from: scan, screen-context-tile, screen-context-share. */
  captureSource?: string;
  /** Question picked on the screen-context screen; the backend answers it alongside the usual check. */
  analysisFocus?: AnalysisFocus;
}

export type ResultSource = "scan" | "history";

const EMPTY_DRAFT: ScanDraft = {
  mode: "image",
  imageUri: null,
  imageName: "screenshot.jpg",
  imageType: "image/jpeg",
  text: "",
};

interface ScanStore {
  draft: ScanDraft;
  updateDraft: (changes: Partial<ScanDraft>) => void;
  resetDraft: (mode?: ScanMode) => void;
  result: AnalysisResult | null;
  error: ApiError | null;
  activeRecord: ScanRecord | null;
  resultSource: ResultSource;
  history: ScanRecord[];
  historyLoaded: boolean;
  settings: HistorySettings;
  completeScan: (result: AnalysisResult) => void;
  failScan: (error: ApiError) => void;
  showResult: (record: ScanRecord) => void;
  deleteScan: (id: string) => void;
  clearHistory: () => void;
  setSaveHistory: (enabled: boolean) => void;
}

const ScanContext = createContext<ScanStore | null>(null);

function makeLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPreview(draft: ScanDraft, result: AnalysisResult) {
  const source = draft.mode === "text" ? draft.text : result.extracted_text ?? "";
  const firstLine = redactText(source.trim().split("\n")[0]?.trim() ?? "");
  return (firstLine || (draft.mode === "image" ? "Screenshot" : "Message")).slice(0, 120);
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ScanDraft>(EMPTY_DRAFT);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>("scan");
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [settings, setSettings] = useState<HistorySettings>(DEFAULT_SETTINGS);
  // Every draft change goes through the store below, which keeps this in step with `draft`.
  const draftRef = useRef(draft);

  // Temporary copies from abandoned checks are removed at launch and whenever the app returns.
  useEffect(() => {
    purgeTempFiles({ keep: draftRef.current.imageUri });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") purgeTempFiles({ keep: draftRef.current.imageUri });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadHistory(), loadSettings()]).then(([stored, storedSettings]) => {
      if (!mounted) return;
      setHistory((current) => {
        const ids = new Set(current.map((record) => record.id));
        return [...current, ...stored.filter((record) => !ids.has(record.id))].slice(0, MAX_HISTORY);
      });
      setSettings(storedSettings);
      setHistoryLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (historyLoaded) {
      saveHistory(history);
    }
  }, [history, historyLoaded]);

  const activeRecord = activeRecordId
    ? history.find((record) => record.id === activeRecordId) ?? null
    : null;

  const store: ScanStore = {
    draft,
    updateDraft: (changes) => {
      // A replaced or removed screenshot is no longer needed on the phone.
      const previous = draftRef.current.imageUri;
      if ("imageUri" in changes && changes.imageUri !== previous) {
        deleteTempFile(previous);
      }
      draftRef.current = { ...draftRef.current, ...changes };
      setDraft((current) => ({ ...current, ...changes }));
    },
    resetDraft: (mode = "image") => {
      deleteTempFile(draftRef.current.imageUri);
      draftRef.current = { ...EMPTY_DRAFT, mode };
      setDraft({ ...EMPTY_DRAFT, mode });
    },
    result,
    error,
    activeRecord,
    resultSource,
    history,
    historyLoaded,
    settings,
    completeScan: (next) => {
      // A failed check keeps the screenshot so "Try again" can resend it; a finished one doesn't.
      const finished = draftRef.current;
      deleteTempFile(finished.imageUri);
      draftRef.current = { ...finished, imageUri: null, text: "" };
      setDraft((current) => ({ ...current, imageUri: null, text: "" }));
      setResult(next);
      setError(null);
      setResultSource("scan");

      if (!settings.saveHistory) {
        setActiveRecordId(null);
        return;
      }

      const record: ScanRecord = {
        id: next.analysis_id ?? makeLocalId(),
        createdAt: Date.now(),
        mode: finished.mode,
        preview: buildPreview(finished, next),
        result: redactResult(next),
      };
      setActiveRecordId(record.id);
      setHistory((records) =>
        [record, ...records.filter((item) => item.id !== record.id)].slice(0, MAX_HISTORY)
      );
    },
    failScan: (next) => {
      setError(next);
      setResult(null);
    },
    showResult: (record) => {
      setResult(record.result);
      setError(null);
      setActiveRecordId(record.id);
      setResultSource("history");
    },
    deleteScan: (id) => {
      setHistory((records) => records.filter((record) => record.id !== id));
      if (id === activeRecordId) {
        setActiveRecordId(null);
      }
    },
    clearHistory: () => {
      setHistory([]);
      setActiveRecordId(null);
      // Also drop any temporary copies still on the phone, except one waiting to be sent.
      purgeTempFiles({ keep: draftRef.current.imageUri, olderThanMs: 0 });
    },
    setSaveHistory: (enabled) => {
      const next = { ...settings, saveHistory: enabled };
      setSettings(next);
      saveSettings(next);
    },
  };

  return <ScanContext.Provider value={store}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanStore {
  const store = useContext(ScanContext);
  if (!store) {
    throw new Error("useScan must be used inside ScanProvider");
  }
  return store;
}
