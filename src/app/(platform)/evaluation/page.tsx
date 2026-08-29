"use client";

import { useState } from "react";
import { Target, ShieldCheck, AlertTriangle, ArrowRight, Brain, CheckCircle2 } from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { NextStepCard, HelpCard, PageHeader } from "@/components/workflow";
import Link from "next/link";

interface Model {
  id: string;
  modelId: string;
  name: string;
  status: string;
  checkpointPath?: string;
  precision?: number;
  recall?: number;
  f1?: number;
  iou?: number;
  mapScore?: number;
}

interface Evaluation {
  id: string;
  modelId: string;
  evalType: string;
  precision: number;
  recall: number;
  f1: number;
  meanIou: number;
  mapScore: number | null;
  totalImages: number;
  totalGroundTruth: number;
  isTestSetUsed: boolean;
  createdAt: string;
}

export default function EvaluationPage() {
  const [runningEval, setRunningEval] = useState(false);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);
  const { state: workflow } = useWorkflowState();

  const { data: modelsData, loading: modelsLoading } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const selectedModel = models[0] ?? null;
  const hasCheckpoint = !!selectedModel?.checkpointPath;

  const { data: evalData, loading: evalLoading, refetch: refetchEval } = useApi<{ evaluations: Evaluation[]; total: number }>(
    selectedModel ? `/api/evaluation?modelId=${selectedModel.id}` : null
  );
  const evaluation = evalData?.evaluations?.[0] ?? null;

  const runEvaluation = async () => {
    if (!selectedModel) return;
    setRunningEval(true);
    setEvalMessage(null);
    try {
      const result = await apiPost<{ evaluation?: { status: string }; metrics?: Record<string, unknown>; error?: string; message?: string }>("/api/evaluate", {
        modelId: selectedModel.id,
        iouThreshold: 0.5,
        confidenceThreshold: 0.5,
      });
      if (result?.evaluation?.status === "completed") {
        setEvalMessage("Evaluation completed.");
      } else {
        setEvalMessage(result?.message || result?.error || "Evaluation completed with partial results.");
      }
      refetchEval();
    } catch (err) {
      setEvalMessage(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setRunningEval(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Model Evaluation" subtitle="Measure how well your model performs on unseen data" step={10} totalSteps={15} />
        <button onClick={runEvaluation} disabled={runningEval || !hasCheckpoint} className={`text-xs flex items-center gap-1 ${hasCheckpoint ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed"}`}>
          <Target className="w-3 h-3" /> {runningEval ? "Running..." : "Run Evaluation"}
        </button>
      </div>

      {evalMessage && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">{evalMessage}</div>
      )}

      {/* No model state */}
      {!modelsLoading && models.length === 0 && (
        <div className="glass-card-solid p-6 text-center">
          <Brain className="w-12 h-12 text-[#64748b] mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold mb-1">No Model Available</h3>
          <p className="text-xs text-[#64748b] mb-4 max-w-sm mx-auto">
            Complete annotation, then train a model before running evaluation.
          </p>
          <Link href="/training" className="btn-primary text-xs inline-flex items-center gap-1">
            Go to Training <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Model exists but no checkpoint */}
      {!modelsLoading && models.length > 0 && !hasCheckpoint && (
        <div className="glass-card-solid p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold mb-1">No Trained Checkpoint</h3>
          <p className="text-xs text-[#64748b] mb-4 max-w-sm mx-auto">
            A model is registered but has no trained checkpoint. Complete training first.
          </p>
          <div className="flex items-center gap-3 justify-center">
            <Link href="/annotation" className="btn-secondary text-xs flex items-center gap-1">Annotate Images <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/training" className="btn-primary text-xs flex items-center gap-1">Go to Training <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </div>
      )}

      {/* Evaluation results */}
      {evaluation && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Precision", value: evaluation.precision?.toFixed(3) ?? "N/A", color: "text-cyan-400" },
              { label: "Recall", value: evaluation.recall?.toFixed(3) ?? "N/A", color: "text-emerald-400" },
              { label: "F1 Score", value: evaluation.f1?.toFixed(3) ?? "N/A", color: "text-violet-400" },
              { label: "Mean IoU", value: evaluation.meanIou?.toFixed(3) ?? "N/A", color: "text-amber-400" },
              { label: "Test Images", value: String(evaluation.totalImages), color: "text-blue-400" },
              { label: "Ground Truth", value: String(evaluation.totalGroundTruth), color: "text-rose-400" },
            ].map(m => (
              <div key={m.label} className="metric-card text-center">
                <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-[#64748b]">{m.label}</p>
              </div>
            ))}
          </div>

          {evaluation.isTestSetUsed && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Test set evaluation: Results are from the held-out test split.
            </div>
          )}

          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Evaluation Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Eval Type", value: evaluation.evalType },
                { label: "Model", value: selectedModel?.name ?? "N/A" },
                { label: "Created", value: evaluation.createdAt ? new Date(evaluation.createdAt).toLocaleString() : "N/A" },
                { label: "mAP", value: evaluation.mapScore?.toFixed(3) ?? "N/A" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-[#1a2540]">
                  <span className="text-xs text-[#64748b]">{item.label}</span>
                  <span className="text-xs font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!evaluation && !evalLoading && models.length > 0 && hasCheckpoint && (
        <div className="glass-card-solid p-6 text-center">
          <Target className="w-12 h-12 text-[#64748b] mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold mb-1">Not Yet Evaluated</h3>
          <p className="text-xs text-[#64748b] mb-4 max-w-sm mx-auto">
            Run evaluation on the test set to measure model performance.
          </p>
          <button onClick={runEvaluation} disabled={runningEval} className="btn-primary text-xs inline-flex items-center gap-1">
            <Target className="w-3 h-3" /> {runningEval ? "Running..." : "Run Evaluation"}
          </button>
        </div>
      )}

      {workflow && (
        <NextStepCard
          currentStep={workflow.currentStep}
          completedSteps={workflow.completedSteps}
          totalImages={workflow.totalImages}
          annotatedImages={workflow.annotatedImages}
          unannotatedImages={workflow.unannotatedImages}
          qualityComplete={workflow.qualityComplete}
          blockers={workflow.blockers}
        />
      )}

      <HelpCard title="What is evaluation?">
        <p className="mb-2">Evaluation measures your model&apos;s performance on test images it has never seen during training.</p>
        <p className="mb-2"><strong>Key metrics:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Precision:</strong> How many detected objects are correct</li>
          <li><strong>Recall:</strong> How many real objects were found</li>
          <li><strong>IoU:</strong> How accurately the boxes overlap with real objects</li>
        </ul>
      </HelpCard>
    </div>
  );
}
