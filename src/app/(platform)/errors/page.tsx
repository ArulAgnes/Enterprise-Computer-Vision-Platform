"use client";

import React, { useState } from "react";
import { AlertTriangle, Eye, Target, CheckCircle2, XCircle, Search, Filter, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { useApi } from "@/lib/hooks";

interface EvaluationData {
  id: string;
  modelId: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  meanIou: number;
  perClassMetrics: Array<{
    name: string;
    precision: number;
    recall: number;
    f1: number;
    tp: number;
    fp: number;
    fn: number;
  }> | null;
  confusionMatrix: number[][] | null;
  errorAnalysis: {
    categories?: Array<{ type: string; count: number; color: string }>;
    failureReasons?: Array<{ reason: string; count: number; pct: number }>;
    classErrors?: Array<{
      cls: string;
      fp: number;
      fn: number;
      locErr: number;
      clsErr: number;
      mainReason: string;
    }>;
    failureExamples?: Array<{
      type: string;
      desc: string;
      reason: string;
      confidence: number;
    }>;
    robustness?: Array<{
      transform: string;
      drop: number;
    }>;
  } | null;
  totalImages: number;
  createdAt: string;
}

interface Model {
  id: string;
  modelId: string;
  name: string;
}

export default function ErrorsPage() {
  const { data: modelsData, loading: modelsLoading } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  const effectiveModelId = selectedModelId || models[0]?.id || "";
  const { data: evalData, loading: evalLoading } = useApi<{ evaluations: EvaluationData[]; total: number }>(
    effectiveModelId ? `/api/evaluation?modelId=${effectiveModelId}` : null,
  );

  const evaluation = evalData?.evaluations?.[0] ?? null;
  const hasData = evaluation && evaluation.totalImages > 0;

  const errorCategories = hasData
    ? [
        { type: "True Positive", count: evaluation.truePositives ?? 0, color: "#10b981", icon: CheckCircle2 },
        { type: "False Positive", count: evaluation.falsePositives ?? 0, color: "#ef4444", icon: XCircle },
        { type: "False Negative", count: evaluation.falseNegatives ?? 0, color: "#f59e0b", icon: AlertTriangle },
      ]
    : [];

  const failureReasons = evaluation?.errorAnalysis?.failureReasons ?? [];
  const classErrors = evaluation?.errorAnalysis?.classErrors ?? [];
  const failureExamples = evaluation?.errorAnalysis?.failureExamples ?? [];
  const robustness = evaluation?.errorAnalysis?.robustness ?? [];

  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const activeModel = selectedModel ?? models[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Error Analysis</h1>
          <p className="text-sm text-[#94a3b8]">Categorize, quantify, and understand model failures</p>
        </div>
        {!modelsLoading && models.length > 0 && (
          <select
            value={selectedModelId || models[0]?.id}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="p-1.5 bg-[#111827] border border-[#2a3550] rounded text-xs text-[#e2e8f0]"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.modelId} — {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!hasData && !evalLoading && (
        <div className="p-6 glass-card-solid text-center">
          <p className="text-sm text-[#64748b] font-semibold">NO EVALUATION DATA</p>
          <p className="text-xs text-[#64748b] mt-1">Run an evaluation on the Evaluation page to see error analysis.</p>
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {errorCategories.map((e) => (
              <div key={e.type} className="metric-card text-center">
                <e.icon className="w-5 h-5 mx-auto mb-1" style={{ color: e.color }} />
                <p className="text-lg font-bold">{e.count}</p>
                <p className="text-[10px] text-[#64748b]">{e.type}</p>
              </div>
            ))}
            <div className="metric-card text-center">
              <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-violet-400" />
              <p className="text-lg font-bold">{evaluation.confusionMatrix ? evaluation.confusionMatrix.length : 0}</p>
              <p className="text-[10px] text-[#64748b]">Classes</p>
            </div>
            <div className="metric-card text-center">
              <Eye className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
              <p className="text-lg font-bold">{evaluation.totalImages}</p>
              <p className="text-[10px] text-[#64748b]">Eval Images</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card-solid p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Why Did the Model Fail?
              </h3>
              {failureReasons.length > 0 ? (
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={failureReasons} layout="vertical">
                      <XAxis type="number" stroke="#64748b" fontSize={10} />
                      <YAxis type="category" dataKey="reason" stroke="#64748b" fontSize={9} width={150} />
                      <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {failureReasons.map((_: unknown, i: number) => (
                          <Cell key={i} fill={["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#06b6d4", "#64748b"][i % 6]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-[#64748b]">NO DATA AVAILABLE</p>
              )}
              <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-300">
                ℹ Analysis based on measurable signals: object size, brightness, class similarity, occlusion. Not invented explanations.
              </div>
            </div>

            <div className="glass-card-solid p-5">
              <h3 className="text-sm font-semibold mb-3">Per-Class Error Breakdown</h3>
              {classErrors.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>FP</th>
                      <th>FN</th>
                      <th>Loc Err</th>
                      <th>Cls Err</th>
                      <th>Main Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classErrors.map((e) => (
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
              ) : (
                <p className="text-xs text-[#64748b]">NO DATA AVAILABLE</p>
              )}
            </div>
          </div>

          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">Failure Examples</h3>
            {failureExamples.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {failureExamples.map((ex, i) => (
                  <div key={i} className="p-3 bg-[#111827] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          ex.type === "False Positive"
                            ? "badge-error"
                            : ex.type === "False Negative"
                              ? "badge-warning"
                              : "badge-info"
                        }`}
                      >
                        {ex.type}
                      </span>
                      {ex.confidence > 0 && (
                        <span className="text-[10px] font-mono text-[#64748b]">{(ex.confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                    <p className="text-xs">{ex.desc}</p>
                    <p className="text-[10px] text-amber-300">Reason: {ex.reason}</p>
                    <div className="h-24 bg-[#0d1220] rounded flex items-center justify-center">
                      <span className="text-[10px] text-[#2a3550]">Image Preview</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#64748b]">NO DATA AVAILABLE</p>
            )}
          </div>

          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">Robustness Test Summary</h3>
            {robustness.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {robustness.map((t) => (
                  <div key={t.transform} className="p-2 bg-[#111827] rounded text-center">
                    <p className="text-xs font-semibold">{t.transform}</p>
                    <p className={`text-lg font-bold ${t.drop > 15 ? "text-rose-400" : t.drop > 10 ? "text-amber-400" : "text-emerald-400"}`}>
                      -{t.drop}%
                    </p>
                    <p className="text-[9px] text-[#64748b]">F1 drop</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#64748b]">NO DATA AVAILABLE</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
