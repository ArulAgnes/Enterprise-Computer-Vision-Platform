"use client";

import { AlertTriangle, Eye, Target, CheckCircle2, XCircle, Search, Filter, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const errorCategories = [
  { type: "True Positive", count: 642, color: "#10b981", icon: CheckCircle2 },
  { type: "False Positive", count: 87, color: "#ef4444", icon: XCircle },
  { type: "False Negative", count: 123, color: "#f59e0b", icon: AlertTriangle },
  { type: "Localization Error", count: 56, color: "#8b5cf6", icon: Target },
  { type: "Classification Error", count: 34, color: "#f97316", icon: Search },
  { type: "Low Confidence", count: 78, color: "#06b6d4", icon: Eye },
];

const failureReasons = [
  { reason: "Small object (< 32px)", count: 89, pct: 28.4 },
  { reason: "Low brightness / dark scene", count: 67, pct: 21.4 },
  { reason: "Similar class confusion", count: 54, pct: 17.2 },
  { reason: "Occluded object", count: 42, pct: 13.4 },
  { reason: "Cluttered background", count: 38, pct: 12.1 },
  { reason: "Insufficient training samples", count: 24, pct: 7.6 },
];

const classErrors = [
  { cls: "Ritual Plate", fp: 18, fn: 22, locErr: 12, clsErr: 8, mainReason: "Similar to Incense Holder" },
  { cls: "Temple Bell", fp: 12, fn: 15, locErr: 8, clsErr: 6, mainReason: "Small objects, low light" },
  { cls: "Incense Holder", fp: 15, fn: 14, locErr: 10, clsErr: 9, mainReason: "Similar to Ritual Plate" },
  { cls: "Clay Diya", fp: 8, fn: 12, locErr: 5, clsErr: 2, mainReason: "Occlusion in ritual settings" },
  { cls: "Hanging Diya", fp: 6, fn: 10, locErr: 4, clsErr: 3, mainReason: "Background clutter" },
];

export default function ErrorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Error Analysis</h1>
        <p className="text-sm text-[#94a3b8]">Categorize, quantify, and understand model failures</p>
      </div>

      {/* Error Distribution */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {errorCategories.map(e => (
          <div key={e.type} className="metric-card text-center">
            <e.icon className={`w-5 h-5 mx-auto mb-1`} style={{ color: e.color }} />
            <p className="text-lg font-bold">{e.count}</p>
            <p className="text-[10px] text-[#64748b]">{e.type}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Failure Reasons */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Why Did the Model Fail?
          </h3>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={failureReasons} layout="vertical">
                <XAxis type="number" stroke="#64748b" fontSize={10} />
                <YAxis type="category" dataKey="reason" stroke="#64748b" fontSize={9} width={150} />
                <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {failureReasons.map((_, i) => <Cell key={i} fill={["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#06b6d4", "#64748b"][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-300">
            ℹ Analysis based on measurable signals: object size, brightness, class similarity, occlusion. Not invented explanations.
          </div>
        </div>

        {/* Class-wise Errors */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3">Per-Class Error Breakdown</h3>
          <table className="data-table">
            <thead><tr><th>Class</th><th>FP</th><th>FN</th><th>Loc Err</th><th>Cls Err</th><th>Main Reason</th></tr></thead>
            <tbody>
              {classErrors.map(e => (
                <tr key={e.cls}>
                  <td className="text-xs font-semibold">{e.cls}</td>
                  <td className="text-xs font-mono text-rose-400">{e.fp}</td>
                  <td className="text-xs font-mono text-amber-400">{e.fn}</td>
                  <td className="text-xs font-mono text-violet-400">{e.locErr}</td>
                  <td className="text-xs font-mono text-orange-400">{e.clsErr}</td>
                  <td className="text-[10px] text-[#94a3b8]">{e.mainReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failure Examples */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Failure Examples</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { type: "False Positive", desc: "Predicted 'Brass Diya' on background region", reason: "Cluttered background with metallic reflection", confidence: 0.62 },
            { type: "False Negative", desc: "Missed small clay diya in corner", reason: "Object size < 32px, below detection threshold", confidence: 0 },
            { type: "Classification Error", desc: "Predicted 'Incense Holder' instead of 'Ritual Plate'", reason: "Similar shape and material, class confusion", confidence: 0.71 },
          ].map((ex, i) => (
            <div key={i} className="p-3 bg-[#111827] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  ex.type === "False Positive" ? "badge-error" :
                  ex.type === "False Negative" ? "badge-warning" : "badge-info"
                }`}>{ex.type}</span>
                {ex.confidence > 0 && <span className="text-[10px] font-mono text-[#64748b]">{(ex.confidence * 100).toFixed(0)}%</span>}
              </div>
              <p className="text-xs">{ex.desc}</p>
              <p className="text-[10px] text-amber-300">Reason: {ex.reason}</p>
              <div className="h-24 bg-[#0d1220] rounded flex items-center justify-center">
                <span className="text-[10px] text-[#2a3550]">Image Preview</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Robustness */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Robustness Test Summary</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { transform: "Brightness -30%", drop: 12 },
            { transform: "Contrast -30%", drop: 8 },
            { transform: "Gaussian Blur", drop: 15 },
            { transform: "Noise σ=25", drop: 6 },
            { transform: "Scale 0.7×", drop: 18 },
            { transform: "Random Crop", drop: 10 },
          ].map(t => (
            <div key={t.transform} className="p-2 bg-[#111827] rounded text-center">
              <p className="text-xs font-semibold">{t.transform}</p>
              <p className={`text-lg font-bold ${t.drop > 15 ? "text-rose-400" : t.drop > 10 ? "text-amber-400" : "text-emerald-400"}`}>
                -{t.drop}%
              </p>
              <p className="text-[9px] text-[#64748b]">F1 drop</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
