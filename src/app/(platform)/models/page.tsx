"use client";

import { useState } from "react";
import { Box, CheckCircle2, Star, Archive, Clock, Cpu, GitCompare, Download, Trash2, ShieldCheck } from "lucide-react";

const modelVersions = [
  {
    id: "VB-CV-001", name: "VisionBharat Detector v1", version: "1.0",
    arch: "3 Conv + 2 Res + FPN + Detection Head", dataset: "DIYA-2026 v0.2",
    experiment: "EXP-2026-001", params: 980000, imageSize: 640, numClasses: 8,
    status: "Archived" as const, precision: 0.55, recall: 0.47, f1: 0.51, iou: 0.42,
    inferenceMs: 98, duration: "1.8 hrs", fromScratch: true, date: "2026-01-18"
  },
  {
    id: "VB-CV-002", name: "VisionBharat Detector v2", version: "2.0",
    arch: "3 Conv + 3 Res + FPN + Detection Head", dataset: "DIYA-2026 v0.3",
    experiment: "EXP-2026-003", params: 1480000, imageSize: 640, numClasses: 8,
    status: "Champion" as const, precision: 0.71, recall: 0.63, f1: 0.67, iou: 0.58,
    inferenceMs: 127, duration: "3.1 hrs", fromScratch: true, date: "2026-01-22"
  },
];

const statusColors: Record<string, string> = {
  Training: "badge-info", Candidate: "badge-warning", Validated: "badge-success", Champion: "badge-success", Archived: "badge-neutral",
};

export default function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState(modelVersions[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Model Registry</h1>
          <p className="text-sm text-[#94a3b8]">Version, compare, and manage trained models</p>
        </div>
        <button className="btn-secondary text-xs flex items-center gap-1"><GitCompare className="w-3 h-3" /> Compare Models</button>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {modelVersions.map(model => (
          <div key={model.id} onClick={() => setSelectedModel(model)}
            className={`glass-card-solid p-5 cursor-pointer transition-all ${
              selectedModel.id === model.id ? "border-blue-500/40 neon-blue" : "hover:border-blue-500/20"
            }`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold font-mono">{model.id}</h3>
                <p className="text-xs text-[#94a3b8]">{model.name}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded ${statusColors[model.status]}`}>
                {model.status === "Champion" && "⭐ "}{model.status}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="text-center"><p className="text-sm font-bold text-cyan-400">{model.precision.toFixed(3)}</p><p className="text-[9px] text-[#64748b]">Precision</p></div>
              <div className="text-center"><p className="text-sm font-bold text-emerald-400">{model.recall.toFixed(3)}</p><p className="text-[9px] text-[#64748b]">Recall</p></div>
              <div className="text-center"><p className="text-sm font-bold text-violet-400">{model.f1.toFixed(3)}</p><p className="text-[9px] text-[#64748b]">F1</p></div>
              <div className="text-center"><p className="text-sm font-bold text-amber-400">{model.iou.toFixed(3)}</p><p className="text-[9px] text-[#64748b]">IoU</p></div>
            </div>
            <div className="space-y-1 text-[10px] text-[#64748b]">
              <p>Architecture: {model.arch}</p>
              <p>Parameters: {(model.params / 1e6).toFixed(2)}M • Inference: {model.inferenceMs}ms</p>
              <p>Dataset: {model.dataset} • Experiment: {model.experiment}</p>
              <p className="text-emerald-400">✓ Trained from scratch (random initialization) — No pretrained weights</p>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Download className="w-3 h-3" /> Export</button>
              {model.status !== "Champion" && <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Star className="w-3 h-3" /> Promote</button>}
              {model.status !== "Archived" && <button className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1"><Archive className="w-3 h-3" /> Archive</button>}
            </div>
          </div>
        ))}
      </div>

      {/* Model Comparison */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Model Comparison</h3>
        <table className="data-table">
          <thead>
            <tr><th>Model</th><th>Params</th><th>Precision</th><th>Recall</th><th>F1</th><th>IoU</th><th>Inference</th><th>From Scratch</th><th>Pretrained</th></tr>
          </thead>
          <tbody>
            {modelVersions.map(m => (
              <tr key={m.id}>
                <td className="text-xs font-mono font-semibold">{m.id}</td>
                <td className="text-xs font-mono">{(m.params / 1e6).toFixed(2)}M</td>
                <td className="text-xs font-mono">{m.precision.toFixed(3)}</td>
                <td className="text-xs font-mono">{m.recall.toFixed(3)}</td>
                <td className="text-xs font-mono font-bold">{m.f1.toFixed(3)}</td>
                <td className="text-xs font-mono">{m.iou.toFixed(3)}</td>
                <td className="text-xs font-mono">{m.inferenceMs}ms</td>
                <td className="text-xs text-emerald-400">✓</td>
                <td className="text-xs text-rose-400">✗</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model Card */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" /> Model Card — {selectedModel.id}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <p><span className="text-[#64748b]">Model Name:</span> {selectedModel.name}</p>
            <p><span className="text-[#64748b]">Version:</span> {selectedModel.version}</p>
            <p><span className="text-[#64748b]">Architecture:</span> {selectedModel.arch}</p>
            <p><span className="text-[#64748b]">Parameters:</span> {(selectedModel.params / 1e6).toFixed(2)}M</p>
            <p><span className="text-[#64748b]">Dataset:</span> {selectedModel.dataset}</p>
            <p><span className="text-[#64748b]">Experiment:</span> {selectedModel.experiment}</p>
          </div>
          <div className="space-y-2">
            <p><span className="text-[#64748b]">Intended Use:</span> Detection of Indian ritual objects</p>
            <p><span className="text-[#64748b]">Training:</span> <span className="text-emerald-400 font-semibold">From randomly initialized weights</span></p>
            <p><span className="text-[#64748b]">Pretrained Weights:</span> <span className="text-rose-400 font-semibold">NONE</span></p>
            <p><span className="text-[#64748b]">Limitations:</span> Limited to 8 Indian ritual object classes</p>
            <p><span className="text-[#64748b]">Known Failures:</span> Small objects, low light, class confusion</p>
            <p><span className="text-[#64748b]">Hardware:</span> CPU-trained, {selectedModel.duration}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
