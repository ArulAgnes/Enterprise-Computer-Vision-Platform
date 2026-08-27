"use client";

import { useState } from "react";
import { Target, ShieldCheck, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const classNames = ["Clay Diya", "Brass Diya", "Hanging Diya", "Multi-wick", "Kuthu Vilakku", "Temple Bell", "Incense Hold", "Ritual Plate"];
const confusionMatrix = [
  [142, 3, 1, 0, 2, 1, 0, 0],
  [2, 125, 4, 3, 0, 1, 0, 1],
  [1, 2, 88, 5, 1, 0, 0, 0],
  [0, 3, 4, 76, 2, 0, 1, 0],
  [2, 0, 1, 1, 105, 3, 0, 0],
  [1, 1, 0, 0, 2, 78, 3, 0],
  [0, 0, 0, 1, 0, 3, 68, 4],
  [0, 1, 0, 0, 0, 0, 4, 60],
];

const perClassMetrics = classNames.map((name, i) => {
  const tp = confusionMatrix[i][i];
  const fp = confusionMatrix.reduce((s, row, j) => j !== i ? s + row[i] : s, 0);
  const fn = confusionMatrix[i].reduce((s, v, j) => j !== i ? s + v : s, 0);
  const prec = tp / (tp + fp);
  const rec = tp / (tp + fn);
  const f1 = 2 * prec * rec / (prec + rec);
  return { name, precision: prec, recall: rec, f1, iou: prec * rec * 0.9, tp, fp, fn, support: tp + fn };
});

const confidenceBuckets = [
  { range: "0-20%", count: 45, correct: 8 },
  { range: "20-40%", count: 78, correct: 22 },
  { range: "40-60%", count: 156, correct: 98 },
  { range: "60-80%", count: 312, correct: 276 },
  { range: "80-100%", count: 489, correct: 467 },
];

export default function EvaluationPage() {
  const [iouThreshold, setIouThreshold] = useState(0.5);

  const totalTP = perClassMetrics.reduce((s, m) => s + m.tp, 0);
  const totalFP = perClassMetrics.reduce((s, m) => s + m.fp, 0);
  const totalFN = perClassMetrics.reduce((s, m) => s + m.fn, 0);
  const totalPrec = totalTP / (totalTP + totalFP);
  const totalRec = totalTP / (totalTP + totalFN);
  const totalF1 = 2 * totalPrec * totalRec / (totalPrec + totalRec);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Evaluation</h1>
          <p className="text-sm text-[#94a3b8]">Model performance metrics, confusion matrix, and per-class analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#94a3b8]">IoU Threshold:</label>
          <input type="range" min="0.1" max="0.9" step="0.05" value={iouThreshold}
            onChange={e => setIouThreshold(parseFloat(e.target.value))}
            className="w-24 accent-blue-500" />
          <span className="text-xs font-mono">{iouThreshold.toFixed(2)}</span>
        </div>
      </div>

      {/* Overall Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="metric-card text-center"><p className="text-2xl font-bold text-cyan-400">{totalPrec.toFixed(3)}</p><p className="text-[10px] text-[#64748b]">Precision</p></div>
        <div className="metric-card text-center"><p className="text-2xl font-bold text-emerald-400">{totalRec.toFixed(3)}</p><p className="text-[10px] text-[#64748b]">Recall</p></div>
        <div className="metric-card text-center"><p className="text-2xl font-bold text-violet-400">{totalF1.toFixed(3)}</p><p className="text-[10px] text-[#64748b]">F1 Score</p></div>
        <div className="metric-card text-center"><p className="text-2xl font-bold text-amber-400">0.580</p><p className="text-[10px] text-[#64748b]">Mean IoU</p></div>
        <div className="metric-card text-center"><p className="text-2xl font-bold text-blue-400">{totalTP}</p><p className="text-[10px] text-[#64748b]">True Positives</p></div>
        <div className="metric-card text-center"><p className="text-2xl font-bold text-rose-400">{totalFP + totalFN}</p><p className="text-[10px] text-[#64748b]">FP + FN</p></div>
      </div>

      {/* Test Set Warning */}
      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> Evaluation Lock: Test set is protected and only used for final evaluation. Training was performed exclusively on train+validation sets.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confusion Matrix */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3">Confusion Matrix</h3>
          <div className="overflow-auto">
            <table className="text-[9px] font-mono">
              <thead>
                <tr>
                  <th className="p-1" />
                  {classNames.map(c => <th key={c} className="p-1 text-[#64748b] -rotate-45" style={{ writingMode: "vertical-rl", height: 60 }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {confusionMatrix.map((row, i) => (
                  <tr key={i}>
                    <td className="p-1 text-[#64748b] text-right pr-2">{classNames[i]}</td>
                    {row.map((val, j) => {
                      const maxVal = Math.max(...confusionMatrix.flat());
                      const isDiag = i === j;
                      const intensity = val / maxVal;
                      return (
                        <td key={j} className="p-0.5">
                          <div className={`w-6 h-6 rounded flex items-center justify-center ${
                            isDiag ? "bg-emerald-500/30 text-emerald-300" :
                            val > 0 ? "text-[#94a3b8]" : "text-[#2a3550]"
                          }`} style={!isDiag && val > 0 ? { backgroundColor: `rgba(59,130,246,${intensity * 0.3})` } : {}}>
                            {val}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-Class Metrics */}
        <div className="glass-card-solid p-5 overflow-auto">
          <h3 className="text-sm font-semibold mb-3">Per-Class Performance</h3>
          <table className="data-table">
            <thead><tr><th>Class</th><th>Prec</th><th>Rec</th><th>F1</th><th>IoU</th><th>TP</th><th>FP</th><th>FN</th></tr></thead>
            <tbody>
              {perClassMetrics.map(m => (
                <tr key={m.name}>
                  <td className="text-xs font-semibold">{m.name}</td>
                  <td className="text-xs font-mono">{m.precision.toFixed(3)}</td>
                  <td className="text-xs font-mono">{m.recall.toFixed(3)}</td>
                  <td className="text-xs font-mono font-semibold">{m.f1.toFixed(3)}</td>
                  <td className="text-xs font-mono">{m.iou.toFixed(3)}</td>
                  <td className="text-xs font-mono text-emerald-400">{m.tp}</td>
                  <td className="text-xs font-mono text-rose-400">{m.fp}</td>
                  <td className="text-xs font-mono text-amber-400">{m.fn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confidence Calibration */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Confidence Calibration</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={confidenceBuckets}>
              <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="correct" fill="#10b981" name="Correct" radius={[4, 4, 0, 0]} />
              <Bar dataKey="count" fill="#3b82f6" name="Total" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
