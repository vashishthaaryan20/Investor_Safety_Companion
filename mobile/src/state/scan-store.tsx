import { createContext, useContext, useState, type ReactNode } from "react";

import type { AnalysisResult, ApiError } from "@/services/api";

export type ScanMode = "image" | "text";

export interface ScanDraft {
  mode: ScanMode;
  imageUri: string | null;
  imageName: string;
  imageType: string;
  text: string;
}

export interface ScanHistoryItem {
  id: string;
  createdAt: number;
  mode: ScanMode;
  preview: string;
  result: AnalysisResult;
}

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
  history: ScanHistoryItem[];
  completeScan: (result: AnalysisResult) => void;
  failScan: (error: ApiError) => void;
  showResult: (item: ScanHistoryItem) => void;
}

const ScanContext = createContext<ScanStore | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ScanDraft>(EMPTY_DRAFT);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  const store: ScanStore = {
    draft,
    updateDraft: (changes) => setDraft((current) => ({ ...current, ...changes })),
    resetDraft: (mode = "image") => setDraft({ ...EMPTY_DRAFT, mode }),
    result,
    error,
    history,
    completeScan: (next) => {
      setResult(next);
      setError(null);
      const preview =
        draft.mode === "text"
          ? draft.text.trim().split("\n")[0]
          : next.extracted_text?.trim().split("\n")[0] || "Screenshot";
      setHistory((items) =>
        [
          {
            id: `${Date.now()}`,
            createdAt: Date.now(),
            mode: draft.mode,
            preview: preview.slice(0, 80),
            result: next,
          },
          ...items,
        ].slice(0, 10)
      );
    },
    failScan: (next) => {
      setError(next);
      setResult(null);
    },
    showResult: (item) => {
      setResult(item.result);
      setError(null);
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
