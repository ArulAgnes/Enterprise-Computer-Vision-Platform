"use client";

import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Eye, Copy, Search, Filter, Image, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const qualityMetrics = [
  { name: "Brightness", good: 680, review: 55, bad: 28 },
  { name: "Contrast", good: 710, review: 40, bad: 13 },
  { name: "Blur", good: 650, review: 78, bad: 35 },
  { name: "Noise", good: 720, review: 30, bad: 13 },
  { name: "Entropy", good: 695, review: 48, bad: 20 },
  { name: "Exposure", good: 700, review: 45, bad: 18 },
];

const duplicateGroups = [
  { id: 1, type: "Exact", images: ["DIYA_0042.jpg", "DIYA_0043.jpg"], similarity: 1.0 },
  { id: 2, type: "Near", images: ["DIYA_0156.jpg", "DIYA_0157.jpg"], similarity: 0.97 },
  { id: 3, type: "Near", images: ["DIYA_0321.jpg", "DIYA_0322.jpg", "DIYA_0323.jpg"], similarity: 0.94 },
];

const flaggedImages = [
  { filename: "DIYA_0028.jpg", reason: "Extremely blurry", blurScore: 12.3, flag: "red" },
  { filename: "DIYA_0147.jpg", reason: "Very dark", brightness: 18, flag: "red" },
  { filename: "DIYA_0291.jpg", reason: "Overexposed", exposure: 245, flag: "yellow" },
  { filename: "DIYA_0384.jpg", reason: "Tiny image (320×240)", resolution: "320×240", flag: "yellow" },
];

export default function QualityPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Quality Control</h1>
          <p className="text-sm text-[#94a3b8]">Image quality analysis, duplicate detection, and validation</p>
        </div>
        <button className="btn-primary text-xs flex items-center gap-1"><Search className="w-3 h-3" /> Run Analysis</button>
      </div>

      {/* Health Score */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: CheckCircle2, label: "Acceptable", value: 643, color: "text-emerald-400" },
          { icon: AlertTriangle, label: "Review", value: 87, color: "text-amber-400" },
          { icon: XCircle, label: "Reject", value: 33, color: "text-rose-400" },
          { icon: Copy, label: "Duplicates", value: 12, color: "text-violet-400" },
          { icon: ShieldCheck, label: "Health Score", value: "94.8%", color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="metric-card text-center">
            <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-[10px] text-[#64748b]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quality Distribution Chart */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Quality Distribution by Metric</h3>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={qualityMetrics}>
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="good" stackId="a" fill="#10b981" name="Good" radius={[0, 0, 0, 0]} />
              <Bar dataKey="review" stackId="a" fill="#f59e0b" name="Review" />
              <Bar dataKey="bad" stackId="a" fill="#ef4444" name="Bad" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flagged Images */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Flagged Images
          </h3>
          <div className="space-y-2">
            {flaggedImages.map(img => (
              <div key={img.filename} className="flex items-center justify-between p-2 rounded-lg bg-[#111827]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${img.flag === "red" ? "bg-rose-500" : "bg-amber-500"}`} />
                  <div>
                    <p className="text-xs font-mono">{img.filename}</p>
                    <p className="text-[10px] text-[#64748b]">{img.reason}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="text-[10px] px-2 py-0.5 rounded badge-success">Keep</button>
                  <button className="text-[10px] px-2 py-0.5 rounded badge-error">Reject</button>
                  <button className="text-[10px] px-2 py-0.5 rounded badge-info">Review</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Duplicate Groups */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Copy className="w-4 h-4 text-violet-400" /> Duplicate Detection
          </h3>
          <div className="space-y-3">
            {duplicateGroups.map(group => (
              <div key={group.id} className="p-3 rounded-lg bg-[#111827] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Duplicate Group #{group.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${group.type === "Exact" ? "badge-error" : "badge-warning"}`}>
                    {group.type} — Similarity: {(group.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                {group.images.map(img => (
                  <p key={img} className="text-[10px] font-mono text-[#94a3b8] pl-3">• {img}</p>
                ))}
                <div className="flex gap-1 pt-1">
                  <button className="text-[10px] px-2 py-0.5 rounded badge-success">Keep First</button>
                  <button className="text-[10px] px-2 py-0.5 rounded badge-info">Keep Both</button>
                  <button className="text-[10px] px-2 py-0.5 rounded badge-warning">Manual Review</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300">
            ✅ SHA-256 for exact duplicates • Perceptual hashing for near-duplicates
          </div>
        </div>
      </div>

      {/* Annotation Validation */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" /> Annotation Health
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <div className="text-center"><p className="text-2xl font-bold">4,218</p><p className="text-[10px] text-[#64748b]">Total Annotations</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-emerald-400">4,199</p><p className="text-[10px] text-[#64748b]">Valid</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-rose-400">7</p><p className="text-[10px] text-[#64748b]">Invalid</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-amber-400">12</p><p className="text-[10px] text-[#64748b]">Duplicates</p></div>
          <div className="text-center"><p className="text-2xl font-bold gradient-text">94.8%</p><p className="text-[10px] text-[#64748b]">Health Score</p></div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-[10px]">
          <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-rose-400">0</p><p className="text-[#64748b]">Outside Image</p></div>
          <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-rose-400">0</p><p className="text-[#64748b]">Zero Width</p></div>
          <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-amber-400">3</p><p className="text-[#64748b]">Extremely Small</p></div>
          <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-amber-400">4</p><p className="text-[#64748b]">Overlapping</p></div>
        </div>
      </div>
    </div>
  );
}
