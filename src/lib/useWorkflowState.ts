"use client";

import { useState, useEffect, useCallback } from "react";

export interface WorkflowState {
  currentStep: number;
  completedSteps: number[];
  totalImages: number;
  totalClasses: number;
  totalAnnotations: number;
  annotatedImages: number;
  unannotatedImages: number;
  hasQualityReports: boolean;
  qualityReportCount: number;
  qualityComplete: boolean;
  allQualityGreen: boolean;
  hasSplits: boolean;
  hasVersions: boolean;
  hasExperiments: boolean;
  hasTrainedModel: boolean;
  hasEvaluations: boolean;
  hasKagglePublication: boolean;
  hasNotebook: boolean;
  annotationComplete: boolean;
  blockers: string[];
  datasetId: string | null;
  datasetPublicId: string | null;
}

export function useWorkflowState(datasetId?: string) {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchState() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (datasetId) params.set("datasetId", datasetId);
        const qs = params.toString();
        const res = await fetch(`/api/workflow-state${qs ? `?${qs}` : ""}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchState();
    return () => { cancelled = true; controller.abort(); };
  }, [trigger, datasetId]);

  return { state, loading, error, refetch };
}
