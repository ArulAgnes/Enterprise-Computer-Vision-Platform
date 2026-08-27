"use client";

import { FlaskConical, GitCompare, Clock, CheckCircle2, TrendingUp, Filter, Search } from "lucide-react";

const experiments = [
  { id: "EXP-2026-001", name: "Basic CNN", arch: "3 Conv + Detection Head", epochs: 50, lr: 0.001, dataset: "v0.2", precision: 0.55, recall: 0.47, f1: 0.51, iou: 0.42, status: "Archived", duration: "1.8 hrs", seed: 42 },
  { id: "EXP-2026-002", name: "CNN + Residual", arch: "3 Conv + 2 Res + Head", epochs: 50, lr: 0.001, dataset: "v0.2", precision: 0.64, recall: 0.56, f1: 0.60, iou: 0.51, status: "Archived", duration: "2.4 hrs", seed: 42 },
  { id: "EXP-2026-003", name: "Residual + Multi-scale", arch: "3 Conv + 3 Res + FPN + Head", epochs: 50, lr: 0.001, dataset: "v0.3", precision: 0.71, recall: 0.63, f1: 0.67, iou: 0.58, status: "Best", duration: "3.1 hrs", seed: 42 },
];

export default function ExperimentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Experiments</h1>
          <p className="text-sm text-[#94a3b8]">Track, compare, and reproduce training experiments</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs flex items-center gap-1"><GitCompare className="w-3 h-3" /> Compare</button>
        </div>
      </div>

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
                  <div><p className="text-xs font-semibold font-mono">{exp.id}</p><p className="text-[10px] text-[#64748b]">{exp.name}</p></div>
                </td>
                <td className="text-xs text-[#94a3b8]">{exp.arch}</td>
                <td className="text-xs font-mono">{exp.epochs}</td>
                <td className="text-xs font-mono">{exp.dataset}</td>
                <td className="text-xs font-mono">{exp.precision.toFixed(3)}</td>
                <td className="text-xs font-mono">{exp.recall.toFixed(3)}</td>
                <td className="text-xs font-mono font-semibold">{exp.f1.toFixed(3)}</td>
                <td className="text-xs font-mono">{exp.iou.toFixed(3)}</td>
                <td className="text-xs">{exp.duration}</td>
                <td className="text-xs font-mono">{exp.seed}</td>
                <td>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    exp.status === "Best" ? "badge-success" : exp.status === "Archived" ? "badge-neutral" : "badge-info"
                  }`}>{exp.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Ablation Study Comparison</h3>
        <div className="grid grid-cols-3 gap-4">
          {experiments.map(exp => (
            <div key={exp.id} className={`p-4 rounded-lg border ${exp.status === "Best" ? "border-emerald-500/30 bg-emerald-500/5" : "border-[#2a3550] bg-[#111827]"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold font-mono">{exp.id}</span>
                {exp.status === "Best" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              <p className="text-sm font-semibold mb-2">{exp.name}</p>
              <div className="space-y-1.5">
                {[
                  { label: "Precision", value: exp.precision, color: "bg-cyan-500" },
                  { label: "Recall", value: exp.recall, color: "bg-emerald-500" },
                  { label: "F1", value: exp.f1, color: "bg-violet-500" },
                  { label: "IoU", value: exp.iou, color: "bg-amber-500" },
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
                <p className="text-xs font-mono font-semibold">{exp.id}</p>
                <p className="text-[10px] text-[#64748b]">Seed: {exp.seed} • Dataset: {exp.dataset}</p>
              </div>
              <button className="btn-secondary text-[10px] px-3 py-1">Reproduce</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
