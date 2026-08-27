"use client";

import { useState, useCallback } from "react";
import { FlaskConical, GitCompare, Clock, CheckCircle2, TrendingUp, Filter, Search, Database, AlertCircle, Loader2 } from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";

interface Experiment {
  id: string;
  experimentId: string;
  name: string;
  description?: string;
  datasetId?: string;
  datasetVersion?: string;
  imageSize: number;
  batchSize: number;
  epochs: number;
  learningRate: number;
  optimizer: string;
  weightDecay: number;
  iouThreshold: number;
  confidenceThreshold: number;
  randomSeed: number;
  status: string;
  currentEpoch: number;
  trainLoss?: number;
  valLoss?: number;
  boxLoss?: number;
  objectnessLoss?: number;
  classLoss?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  iou?: number;
  trainingDuration?: number;
  hardware?: string;
  createdAt?: string;
}

interface ExperimentsResponse {
  success: boolean;
  data: Experiment[];
}

function NoDataCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
      <Database className="w-8 h-8 mb-2 opacity-50" />
      <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-[10px] mt-1">NO DATA AVAILABLE</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-rose-400">
      <AlertCircle className="w-6 h-6 mb-2" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

export default function ExperimentsPage() {
  const [reproducing, setReproducing] = useState<string | null>(null);

  const { data: experimentsData, loading, error, refetch } = useApi<ExperimentsResponse>("/api/experiments");

  const experiments = experimentsData?.data || [];

  const handleReproduce = useCallback(async (exp: Experiment) => {
    setReproducing(exp.id);
    try {
      await apiPost("/api/experiments", {
        experimentId: `EXP-REPRO-${Date.now()}`,
        name: `Reproduce: ${exp.name}`,
        description: `Reproduction of ${exp.experimentId}`,
        datasetId: exp.datasetId,
        datasetVersion: exp.datasetVersion,
        imageSize: exp.imageSize,
        batchSize: exp.batchSize,
        epochs: exp.epochs,
        learningRate: exp.learningRate,
        optimizer: exp.optimizer,
        weightDecay: exp.weightDecay,
        iouThreshold: exp.iouThreshold,
        confidenceThreshold: exp.confidenceThreshold,
        randomSeed: exp.randomSeed,
        hardware: exp.hardware,
      });
      await refetch();
    } catch (err) {
      console.error("Failed to reproduce experiment:", err);
    } finally {
      setReproducing(null);
    }
  }, [refetch]);

  const bestF1 = experiments.length > 0 ? Math.max(...experiments.map(e => e.f1 || 0)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Experiments</h1>
          <p className="text-sm text-[#94a3b8]">Track, compare, and reproduce training experiments</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs flex items-center gap-1" disabled={experiments.length < 2}>
            <GitCompare className="w-3 h-3" /> Compare
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : experiments.length === 0 ? (
        <NoDataCard label="No experiments yet" />
      ) : (
        <>
          {/* Experiment Table */}
          <div className="glass-card-solid overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Experiment</th><th>Architecture</th><th>Epochs</th><th>Dataset</th>
                  <th>Precision</th><th>Recall</th><th>F1</th><th>IoU</th>
                  <th>Duration</th><th>Seed</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map(exp => (
                  <tr key={exp.id}>
                    <td>
                      <div><p className="text-xs font-semibold font-mono">{exp.experimentId}</p><p className="text-[10px] text-[#64748b]">{exp.name}</p></div>
                    </td>
                    <td className="text-xs text-[#94a3b8]">{exp.description || "Custom CNN"}</td>
                    <td className="text-xs font-mono">{exp.epochs}</td>
                    <td className="text-xs font-mono">{exp.datasetVersion || "—"}</td>
                    <td className="text-xs font-mono">{exp.precision != null ? exp.precision.toFixed(3) : "—"}</td>
                    <td className="text-xs font-mono">{exp.recall != null ? exp.recall.toFixed(3) : "—"}</td>
                    <td className="text-xs font-mono font-semibold">{exp.f1 != null ? exp.f1.toFixed(3) : "—"}</td>
                    <td className="text-xs font-mono">{exp.iou != null ? exp.iou.toFixed(3) : "—"}</td>
                    <td className="text-xs">{exp.trainingDuration ? `${Math.round(exp.trainingDuration / 60)} min` : "—"}</td>
                    <td className="text-xs font-mono">{exp.randomSeed}</td>
                    <td>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        exp.f1 === bestF1 && exp.f1 != null ? "badge-success" :
                        exp.status === "created" ? "badge-info" :
                        exp.status === "training" || exp.status === "running" ? "badge-warning" :
                        "badge-neutral"
                      }`}>
                        {exp.f1 === bestF1 && exp.f1 != null ? "Best" : exp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparison */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">Ablation Study Comparison</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {experiments.map(exp => (
                <div key={exp.id} className={`p-4 rounded-lg border ${exp.f1 === bestF1 && exp.f1 != null ? "border-emerald-500/30 bg-emerald-500/5" : "border-[#2a3550] bg-[#111827]"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold font-mono">{exp.experimentId}</span>
                    {exp.f1 === bestF1 && exp.f1 != null && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <p className="text-sm font-semibold mb-2">{exp.name}</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Precision", value: exp.precision || 0, color: "bg-cyan-500" },
                      { label: "Recall", value: exp.recall || 0, color: "bg-emerald-500" },
                      { label: "F1", value: exp.f1 || 0, color: "bg-violet-500" },
                      { label: "IoU", value: exp.iou || 0, color: "bg-amber-500" },
                    ].map(m => (
                      <div key={m.label}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-[#94a3b8]">{m.label}</span>
                          <span className="font-mono">{m.value.toFixed(3)}</span>
                        </div>
                        <div className="h-1 bg-[#1a2540] rounded-full overflow-hidden">
                          <div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.value * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reproduce */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">Reproducibility</h3>
            <div className="grid grid-cols-3 gap-3">
              {experiments.map(exp => (
                <div key={exp.id} className="p-3 bg-[#111827] rounded flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono font-semibold">{exp.experimentId}</p>
                    <p className="text-[10px] text-[#64748b]">Seed: {exp.randomSeed} • Dataset: {exp.datasetVersion || "—"}</p>
                  </div>
                  <button
                    className="btn-secondary text-[10px] px-3 py-1"
                    onClick={() => handleReproduce(exp)}
                    disabled={reproducing === exp.id}
                  >
                    {reproducing === exp.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Reproduce"
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
