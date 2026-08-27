"use client";

import { useState } from "react";
import { Brain, Play, Square, Settings, Cpu, Clock, Activity, TrendingUp, Layers, Zap, CheckCircle2, AlertTriangle, Monitor } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar } from "recharts";

const trainingData = Array.from({ length: 50 }, (_, i) => ({
  epoch: i + 1,
  trainLoss: 4.8 * Math.exp(-0.06 * i) + 0.3 + Math.random() * 0.1,
  valLoss: 4.8 * Math.exp(-0.05 * i) + 0.5 + Math.random() * 0.15,
  boxLoss: 2.1 * Math.exp(-0.05 * i) + 0.2,
  objLoss: 1.8 * Math.exp(-0.06 * i) + 0.15,
  clsLoss: 0.9 * Math.exp(-0.04 * i) + 0.1,
  precision: Math.min(0.75, 0.75 * (1 - Math.exp(-0.06 * i))),
  recall: Math.min(0.68, 0.68 * (1 - Math.exp(-0.05 * i))),
  f1: Math.min(0.71, 0.71 * (1 - Math.exp(-0.055 * i))),
  iou: Math.min(0.62, 0.62 * (1 - Math.exp(-0.05 * i))),
  lr: 0.001 * Math.pow(0.95, Math.floor(i / 10)),
}));

const lossComponents = [
  { name: "Box Loss", weight: 5.0, desc: "GIoU-based bounding box regression" },
  { name: "Objectness Loss", weight: 1.0, desc: "Binary cross-entropy for object presence" },
  { name: "Classification Loss", weight: 1.0, desc: "Cross-entropy for class prediction" },
];

const archLayers = [
  { name: "Input", shape: "640×640×3", params: 0 },
  { name: "Stem Conv 3→32", shape: "320×320×32", params: 864 },
  { name: "Conv Block 32→64", shape: "160×160×64", params: 18496 },
  { name: "Res Block 64→64", shape: "160×160×64", params: 36928 },
  { name: "Conv Block 64→128", shape: "80×80×128", params: 73856 },
  { name: "Res Block 128→128", shape: "80×80×128", params: 147584 },
  { name: "Conv Block 128→256", shape: "40×40×256", params: 295168 },
  { name: "Res Block 256→256", shape: "40×40×256", params: 590080 },
  { name: "Multi-scale Feature Fusion", shape: "40×40×384", params: 295168 },
  { name: "Detection Head", shape: "40×40×(5+8)", params: 26624 },
  { name: "Output", shape: "N×(5+8)", params: 0 },
];

export default function TrainingPage() {
  const [isTraining, setIsTraining] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState(50);
  const lastData = trainingData[trainingData.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Training Lab</h1>
          <p className="text-sm text-[#94a3b8]">Configure, launch, and monitor model training from scratch</p>
        </div>
        <div className="flex gap-2">
          {!isTraining ? (
            <button className="btn-primary text-xs flex items-center gap-1" onClick={() => setIsTraining(true)}>
              <Play className="w-3 h-3" /> Start Training
            </button>
          ) : (
            <button className="btn-danger text-xs flex items-center gap-1" onClick={() => setIsTraining(false)}>
              <Square className="w-3 h-3" /> Stop Training
            </button>
          )}
        </div>
      </div>

      {/* Training Status */}
      {isTraining && (
        <div className="glass-card p-4 flex items-center gap-4 animate-pulse-glow">
          <Activity className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-400">Training in Progress — Epoch {currentEpoch}/100</p>
            <div className="progress-bar mt-2"><div className="progress-fill" style={{ width: `${currentEpoch}%` }} /></div>
          </div>
          <span className="text-[10px] font-mono text-[#64748b]">ETA: ~45 min</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="glass-card-solid p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Training Configuration</h3>
          <div className="space-y-2">
            {[
              { label: "Image Size", value: "640", type: "number" },
              { label: "Batch Size", value: "16", type: "number" },
              { label: "Epochs", value: "100", type: "number" },
              { label: "Learning Rate", value: "0.001", type: "text" },
              { label: "Optimizer", value: "Adam", type: "select" },
              { label: "Weight Decay", value: "0.0005", type: "text" },
              { label: "IoU Threshold", value: "0.5", type: "text" },
              { label: "Conf Threshold", value: "0.5", type: "text" },
              { label: "Random Seed", value: "42", type: "number" },
            ].map(cfg => (
              <div key={cfg.label} className="flex items-center justify-between">
                <label className="text-xs text-[#94a3b8]">{cfg.label}</label>
                <input className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none" defaultValue={cfg.value} />
              </div>
            ))}
          </div>
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> All weights initialized randomly — No pretrained weights
          </div>
          <button className="btn-secondary text-xs w-full">Load Recommended Config</button>
        </div>

        {/* Live Metrics */}
        <div className="lg:col-span-2 space-y-4">
          {/* Current Metrics */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Train Loss", value: lastData.trainLoss.toFixed(3), color: "text-blue-400" },
              { label: "Val Loss", value: lastData.valLoss.toFixed(3), color: "text-amber-400" },
              { label: "Precision", value: lastData.precision.toFixed(3), color: "text-cyan-400" },
              { label: "Recall", value: lastData.recall.toFixed(3), color: "text-emerald-400" },
              { label: "F1", value: lastData.f1.toFixed(3), color: "text-violet-400" },
              { label: "IoU", value: lastData.iou.toFixed(3), color: "text-pink-400" },
              { label: "Box Loss", value: lastData.boxLoss.toFixed(3), color: "text-orange-400" },
              { label: "LR", value: lastData.lr.toExponential(2), color: "text-teal-400" },
            ].map(m => (
              <div key={m.label} className="metric-card text-center">
                <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-[#64748b]">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Loss Curves */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Training & Validation Loss</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trainingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                  <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="trainLoss" stroke="#3b82f6" strokeWidth={2} dot={false} name="Train Loss" />
                  <Line type="monotone" dataKey="valLoss" stroke="#f59e0b" strokeWidth={2} dot={false} name="Val Loss" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Precision/Recall/IoU */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Precision / Recall / F1 / IoU</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trainingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                  <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                  <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="precision" stroke="#06b6d4" strokeWidth={2} dot={false} name="Precision" />
                  <Line type="monotone" dataKey="recall" stroke="#10b981" strokeWidth={2} dot={false} name="Recall" />
                  <Line type="monotone" dataKey="f1" stroke="#8b5cf6" strokeWidth={2} dot={false} name="F1" />
                  <Line type="monotone" dataKey="iou" stroke="#f97316" strokeWidth={2} dot={false} name="IoU" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Architecture */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-violet-400" /> Custom CNN Architecture</h3>
          <table className="data-table">
            <thead><tr><th>Layer</th><th>Output Shape</th><th>Params</th></tr></thead>
            <tbody>
              {archLayers.map(layer => (
                <tr key={layer.name}>
                  <td className="text-xs">{layer.name}</td>
                  <td className="text-xs font-mono text-[#94a3b8]">{layer.shape}</td>
                  <td className="text-xs font-mono text-right">{layer.params.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-blue-500/30">
                <td className="text-xs font-bold">Total</td>
                <td />
                <td className="text-xs font-mono font-bold text-right text-blue-400">{archLayers.reduce((s, l) => s + l.params, 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Loss Function */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-amber-400" /> Loss Function</h3>
          <div className="p-3 bg-[#111827] rounded-lg font-mono text-xs text-[#94a3b8] mb-4">
            L_total = λ_box · L_box + λ_obj · L_obj + λ_cls · L_cls<br />
            L_box = 1 - GIoU (Generalized IoU)<br />
            L_obj = BCE(p_obj, t_obj)<br />
            L_cls = CE(p_cls, t_cls)
          </div>
          <div className="space-y-3">
            {lossComponents.map(lc => (
              <div key={lc.name} className="p-3 rounded-lg bg-[#111827]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{lc.name}</span>
                  <span className="text-[10px] font-mono badge-info px-2 py-0.5 rounded">λ = {lc.weight}</span>
                </div>
                <p className="text-[10px] text-[#64748b]">{lc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hardware */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Monitor className="w-4 h-4 text-emerald-400" /> Hardware</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-[#111827] rounded text-center"><Cpu className="w-4 h-4 text-blue-400 mx-auto mb-1" /><p className="text-xs font-bold">CPU</p><p className="text-[10px] text-[#64748b]">Available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Monitor className="w-4 h-4 text-amber-400 mx-auto mb-1" /><p className="text-xs font-bold">GPU</p><p className="text-[10px] text-[#64748b]">Not Available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" /><p className="text-xs font-bold">Duration</p><p className="text-[10px] text-[#64748b]">~2.5 hrs (est)</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Activity className="w-4 h-4 text-emerald-400 mx-auto mb-1" /><p className="text-xs font-bold">Speed</p><p className="text-[10px] text-[#64748b]">~12 img/sec</p></div>
        </div>
      </div>
    </div>
  );
}
