"use client";

import { useState } from "react";
import { Box, CheckCircle2, Star, Archive, Clock, Cpu, GitCompare, Download, Trash2, ShieldCheck } from "lucide-react";
import { useApi } from "@/lib/hooks";

interface Model {
  id: string;
  modelId: string;
  name: string;
  version: string | null;
  architecture: string | null;
  datasetId: string | null;
  experimentId: string | null;
  parameterCount: number | null;
  imageSize: number | null;
  numClasses: number | null;
  classNames: string[] | null;
  status: string | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  iou: number | null;
  mapScore: number | null;
  inferenceTimeMs: number | null;
  checkpointPath: string | null;
  bestCheckpointPath: string | null;
  isFromScratch: boolean | null;
  usesPretrained: boolean | null;
  trainingDuration: number | null;
  hardware: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  registered: "badge-neutral",
  training: "badge-info",
  trained: "badge-success",
  evaluated: "badge-success",
  champion: "badge-success",
  archived: "badge-neutral",
};

export default function ModelsPage() {
  const { data, loading, error } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = data?.models ?? [];
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  const activeModel = selectedModel ?? models[0] ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Model Registry</h1>
          <p className="text-sm text-[#94a3b8]">Loading models...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Model Registry</h1>
          <p className="text-sm text-rose-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Model Registry</h1>
            <p className="text-sm text-[#94a3b8]">Version, compare, and manage trained models</p>
          </div>
          <button className="btn-secondary text-xs flex items-center gap-1"><GitCompare className="w-3 h-3" /> Compare Models</button>
        </div>
        <div className="p-6 glass-card-solid text-center">
          <p className="text-sm text-[#64748b] font-semibold">NO MODELS REGISTERED</p>
          <p className="text-xs text-[#64748b] mt-1">Register a model to see it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Model Registry</h1>
          <p className="text-sm text-[#94a3b8]">Version, compare, and manage trained models</p>
        </div>
        <button className="btn-secondary text-xs flex items-center gap-1"><GitCompare className="w-3 h-3" /> Compare Models</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {models.map((model) => (
          <div
            key={model.id}
            onClick={() => setSelectedModel(model)}
            className={`glass-card-solid p-5 cursor-pointer transition-all ${
              activeModel?.id === model.id ? "border-blue-500/40 neon-blue" : "hover:border-blue-500/20"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold font-mono">{model.modelId}</h3>
                <p className="text-xs text-[#94a3b8]">{model.name}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded ${statusColors[model.status ?? "registered"] ?? "badge-neutral"}`}>
                {model.status === "champion" && "⭐ "}{model.status}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="text-center">
                <p className="text-sm font-bold text-cyan-400">{model.precision != null ? model.precision.toFixed(3) : "N/A"}</p>
                <p className="text-[9px] text-[#64748b]">Precision</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-emerald-400">{model.recall != null ? model.recall.toFixed(3) : "N/A"}</p>
                <p className="text-[9px] text-[#64748b]">Recall</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-violet-400">{model.f1 != null ? model.f1.toFixed(3) : "N/A"}</p>
                <p className="text-[9px] text-[#64748b]">F1</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-amber-400">{model.iou != null ? model.iou.toFixed(3) : "N/A"}</p>
                <p className="text-[9px] text-[#64748b]">IoU</p>
              </div>
            </div>
            <div className="space-y-1 text-[10px] text-[#64748b]">
              <p>Architecture: {model.architecture ?? "N/A"}</p>
              <p>Parameters: {model.parameterCount != null ? `${(model.parameterCount / 1e6).toFixed(2)}M` : "N/A"} • Inference: {model.inferenceTimeMs != null ? `${model.inferenceTimeMs}ms` : "N/A"}</p>
              <p className="text-emerald-400">
                {model.isFromScratch ? "✓ Trained from scratch (random initialization) — No pretrained weights" : "Pretrained weights used"}
              </p>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Download className="w-3 h-3" /> Export</button>
              {model.status !== "champion" && <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Star className="w-3 h-3" /> Promote</button>}
              {model.status !== "archived" && <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Archive className="w-3 h-3" /> Archive</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Model Comparison</h3>
        <table className="data-table">
          <thead>
            <tr><th>Model</th><th>Params</th><th>Precision</th><th>Recall</th><th>F1</th><th>IoU</th><th>Inference</th><th>From Scratch</th><th>Pretrained</th></tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td className="text-xs font-mono font-semibold">{m.modelId}</td>
                <td className="text-xs font-mono">{m.parameterCount != null ? `${(m.parameterCount / 1e6).toFixed(2)}M` : "N/A"}</td>
                <td className="text-xs font-mono">{m.precision != null ? m.precision.toFixed(3) : "N/A"}</td>
                <td className="text-xs font-mono">{m.recall != null ? m.recall.toFixed(3) : "N/A"}</td>
                <td className="text-xs font-mono font-bold">{m.f1 != null ? m.f1.toFixed(3) : "N/A"}</td>
                <td className="text-xs font-mono">{m.iou != null ? m.iou.toFixed(3) : "N/A"}</td>
                <td className="text-xs font-mono">{m.inferenceTimeMs != null ? `${m.inferenceTimeMs}ms` : "N/A"}</td>
                <td className="text-xs text-emerald-400">{m.isFromScratch ? "✓" : "✗"}</td>
                <td className="text-xs text-rose-400">{m.usesPretrained ? "✗" : "✓"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeModel && (
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" /> Model Card — {activeModel.modelId}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <p><span className="text-[#64748b]">Model Name:</span> {activeModel.name}</p>
              <p><span className="text-[#64748b]">Version:</span> {activeModel.version ?? "N/A"}</p>
              <p><span className="text-[#64748b]">Architecture:</span> {activeModel.architecture ?? "N/A"}</p>
              <p><span className="text-[#64748b]">Parameters:</span> {activeModel.parameterCount != null ? `${(activeModel.parameterCount / 1e6).toFixed(2)}M` : "N/A"}</p>
              <p><span className="text-[#64748b]">Status:</span> {activeModel.status ?? "N/A"}</p>
            </div>
            <div className="space-y-2">
              <p><span className="text-[#64748b]">Intended Use:</span> Detection of Indian ritual objects</p>
              <p><span className="text-[#64748b]">Training:</span> <span className={activeModel.isFromScratch ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>{activeModel.isFromScratch ? "From randomly initialized weights" : "Pretrained weights"}</span></p>
              <p><span className="text-[#64748b]">Pretrained Weights:</span> <span className="text-rose-400 font-semibold">{activeModel.usesPretrained ? "YES (NOT ALLOWED)" : "NONE"}</span></p>
              <p><span className="text-[#64748b]">Limitations:</span> Limited to {activeModel.numClasses ?? 8} Indian ritual object classes</p>
              <p><span className="text-[#64748b]">Hardware:</span> {activeModel.hardware ?? "CPU"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
