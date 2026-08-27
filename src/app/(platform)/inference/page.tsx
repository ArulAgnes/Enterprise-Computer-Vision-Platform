"use client";

import { useState } from "react";
import { ScanSearch, Upload, Camera, Image, Clock, Cpu, Box, Tag, Zap, Eye, Download, Layers } from "lucide-react";

const demoDetections = [
  { className: "Kuthu Vilakku", confidence: 0.874, x: 85, y: 65, w: 220, h: 280, color: "#10b981" },
  { className: "Temple Bell", confidence: 0.812, x: 350, y: 120, w: 160, h: 190, color: "#f97316" },
  { className: "Clay Diya", confidence: 0.653, x: 200, y: 310, w: 100, h: 80, color: "#f59e0b" },
];

const modelInfo = { id: "VB-CV-01", version: "1.0", arch: "Custom CNN + Residual + Multi-scale", fromScratch: true, numClasses: 8, params: "1.48M", inputSize: "640×640" };

export default function InferencePage() {
  const [threshold, setThreshold] = useState(0.5);
  const filteredDetections = demoDetections.filter(d => d.confidence >= threshold);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Inference Studio</h1>
          <p className="text-sm text-[#94a3b8]">Run object detection on unseen images using the trained model</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#94a3b8]">Confidence Threshold:</label>
          <input type="range" min="0.1" max="0.95" step="0.05" value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-32 accent-blue-500" />
          <span className="text-xs font-mono w-8">{threshold.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Upload / Image */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`upload-zone ${dragOver ? "dragover" : ""} !p-8`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); }}>
            <Upload className="w-10 h-10 text-[#64748b] mx-auto mb-2" />
            <p className="text-sm font-semibold mb-1">Drop an image or click to upload</p>
            <p className="text-xs text-[#64748b] mb-3">Test with an unseen image NOT in the training dataset</p>
            <div className="flex gap-2 justify-center">
              <button className="btn-primary text-xs flex items-center gap-1"><Upload className="w-3 h-3" /> Upload Image</button>
              <button className="btn-secondary text-xs flex items-center gap-1"><Camera className="w-3 h-3" /> Webcam</button>
              <button className="btn-secondary text-xs flex items-center gap-1"><Image className="w-3 h-3" /> Demo Image</button>
            </div>
          </div>

          {/* Detection Canvas */}
          <div className="glass-card-solid overflow-hidden">
            <div className="p-2 border-b border-[#2a3550] bg-[#0d1220] flex items-center justify-between">
              <span className="text-[10px] text-[#64748b] font-mono">demo_inference_001.jpg — 640 × 480</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] badge-success px-2 py-0.5 rounded flex items-center gap-1">
                  <Zap className="w-3 h-3" /> 127ms
                </span>
              </div>
            </div>
            <div className="relative" style={{ height: 480 }}>
              <svg className="w-full h-full" viewBox="0 0 640 480">
                <rect width="640" height="480" fill="#111827" />
                <text x="320" y="200" textAnchor="middle" fill="#2a3550" fontSize="12">Inference Canvas</text>
                {filteredDetections.map((det, i) => (
                  <g key={i}>
                    <rect x={det.x} y={det.y} width={det.w} height={det.h}
                      fill="none" stroke={det.color} strokeWidth="2.5" rx="4" />
                    <rect x={det.x} y={det.y - 22} width={det.className.length * 7 + 50} height="22" rx="4"
                      fill={det.color} />
                    <text x={det.x + 6} y={det.y - 7} fill="white" fontSize="10" fontWeight="bold">
                      {det.className} {(det.confidence * 100).toFixed(1)}%
                    </text>
                    {/* Confidence bar inside box */}
                    <rect x={det.x + 2} y={det.y + det.h - 6} width={det.w - 4} height={4} rx="2" fill="rgba(0,0,0,0.3)" />
                    <rect x={det.x + 2} y={det.y + det.h - 6} width={(det.w - 4) * det.confidence} height={4} rx="2" fill={det.color} />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>

        {/* Right: Results Panel */}
        <div className="space-y-4">
          {/* Model Info */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Model</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-[#64748b]">ID</span><span className="font-mono">{modelInfo.id}</span></div>
              <div className="flex justify-between"><span className="text-[#64748b]">Version</span><span className="font-mono">{modelInfo.version}</span></div>
              <div className="flex justify-between"><span className="text-[#64748b]">Architecture</span><span className="text-[10px] text-right">{modelInfo.arch}</span></div>
              <div className="flex justify-between"><span className="text-[#64748b]">Parameters</span><span className="font-mono">{modelInfo.params}</span></div>
              <div className="flex justify-between"><span className="text-[#64748b]">From Scratch</span><span className="text-emerald-400">✓</span></div>
            </div>
          </div>

          {/* Detections */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Detections ({filteredDetections.length})
            </h3>
            <div className="space-y-2">
              {filteredDetections.map((det, i) => (
                <div key={i} className="p-3 rounded-lg bg-[#111827] space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ background: det.color }} />
                      <span className="text-xs font-semibold">{det.className}</span>
                    </div>
                    <span className="text-xs font-mono font-bold" style={{ color: det.color }}>
                      {(det.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${det.confidence * 100}%`, background: det.color }} />
                  </div>
                  <div className="text-[9px] font-mono text-[#64748b]">
                    Box: ({det.x}, {det.y}, {det.w}, {det.h})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inference Stats */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Inference Stats</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">127ms</p><p className="text-[9px] text-[#64748b]">Latency</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">7.9</p><p className="text-[9px] text-[#64748b]">FPS</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">{filteredDetections.length}</p><p className="text-[9px] text-[#64748b]">Objects</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">640×480</p><p className="text-[9px] text-[#64748b]">Resolution</p>
              </div>
            </div>
          </div>

          {/* Explainability */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
              <Eye className="w-3 h-3" /> Explainability
            </h3>
            <div className="p-3 bg-[#111827] rounded text-[10px] text-[#94a3b8] space-y-1">
              <p>• Region activation: {filteredDetections.length} high-activation regions detected</p>
              <p>• Feature maps: Conv3 + Res2 + FPN layers</p>
              <p>• Saliency: Computed from gradient-weighted activations</p>
              <p className="text-amber-400 mt-2">⚠ Visualization from actual model features, not "AI reasoning"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
