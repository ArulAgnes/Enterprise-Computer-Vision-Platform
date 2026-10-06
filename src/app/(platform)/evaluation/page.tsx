"use client";

/**
 * Evaluation — real metrics only
 * ==============================
 * Every number on this page comes out of `ai/evaluate.py` (VBEVAL_RESULT JSON):
 * greedy IoU>=0.5 matching, class-wise NMS 0.45, 11-point interpolated AP,
 * mAP@0.5, mAP@0.5:0.95, mean IoU, an 8x8 confusion matrix and an error
 * breakdown (localisation / classification / background / missed).
 */
import { useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Play, ShieldCheck, Target, Zap } from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { HelpCard, NextStepCard, PageHeader } from "@/components/workflow";
import Link from "next/link";

interface PerClassMetric {
  class_id?: number;
  class_name: string;
  ap: number;
  precision?: number;
  recall?: number;
  f1?: number;
  gt_count?: number;
  pred_count?: number;
}

interface ErrorAnalysis {
  true_positives?: number;
  false_positives?: number;
  false_negatives?: number;
  localisation_errors?: number;
  classification_errors?: number;
  background_errors?: number;
  missed_objects?: number;
  breakdown?: Record<string, number>;
}

interface EvalFile {
  timestamp?: string;
  checkpoint?: string;
  num_classes?: number;
  class_names?: string[];
  confidence_threshold?: number;
  iou_threshold?: number;
  map50?: number;
  map5095?: number;
  mean_iou?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  total_images?: number;
  total_ground_truth?: number;
  total_predictions?: number;
  per_class?: PerClassMetric[];
  confusion_matrix?: number[][];
  error_analysis?: ErrorAnalysis;
  latency_ms?: { mean?: number; max?: number; min?: number };
  from_scratch?: boolean;
  verify_no_pretrained?: boolean;
}

interface LatestRow {
  precision?: number;
  recall?: number;
  f1?: number;
  meanIou?: number;
  mapScore?: number;
  totalImages?: number;
  createdAt?: string;
}

const BAR_COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#84cc16", "#f97316"];

export default function EvaluationPage() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<EvalFile | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { state: workflow } = useWorkflowState();

  const { data, loading, refetch } = useApi<{
    latest: LatestRow | null;
    fileMetrics: EvalFile | null;
    perClass: PerClassMetric[] | null;
    confusionMatrix: number[][] | null;
    artifacts: Record<string, unknown>;
  }>("/api/evaluate");

  const metrics: EvalFile | null = liveResult ?? data?.fileMetrics ?? null;
  const latest = data?.latest ?? null;

  const perClass = useMemo<PerClassMetric[]>(() => {
    const raw = metrics?.per_class ?? data?.perClass ?? [];
    return raw.filter((c) => c && typeof c.ap === "number");
  }, [metrics, data]);

  const confusion = metrics?.confusion_matrix ?? data?.confusionMatrix ?? null;
  const classNames = metrics?.class_names ?? [];
  const errors = metrics?.error_analysis;

  const errorPie = useMemo(() => {
    if (!errors) return [];
    const b = errors.breakdown ?? {};
    return [
      { name: "True positives", value: errors.true_positives ?? 0, color: "#10b981" },
      { name: "Localisation error", value: errors.localisation_errors ?? b.localisation ?? 0, color: "#f59e0b" },
      { name: "Classification error", value: errors.classification_errors ?? b.classification ?? 0, color: "#8b5cf6" },
      { name: "Background (FP)", value: errors.background_errors ?? errors.false_positives ?? 0, color: "#ef4444" },
      { name: "Missed objects", value: errors.missed_objects ?? errors.false_negatives ?? 0, color: "#64748b" },
    ].filter((d) => d.value > 0);
  }, [errors]);

  const runEvaluation = async () => {
    setRunning(true);
    setMessage(null);
    setLogs(["[ui] POST /api/evaluate — spawning ai/evaluate.py on the held-out test split…"]);
    try {
      const res = await apiPost<{
        metrics?: Record<string, unknown>;
        logs?: string[];
        error?: string;
        resultsFile?: string;
      }>("/api/evaluate", { confidence: 0.25, iou: 0.5 });

      if (res.error) {
        setMessage(res.error);
        setLogs((p) => [...p, ...(res.logs ?? [])]);
      } else {
        const file = await fetch("/api/evaluate").then((r) => r.json());
        setLiveResult(file.fileMetrics ?? null);
        setMessage("Evaluation complete — metrics are real (greedy 0.5 IoU matching, 11-point AP).");
        setLogs((p) => [...p, ...(res.logs ?? []).slice(-10)]);
        refetch();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <PageHeader title="Evaluation" subtitle="mAP · per-class AP · confusion matrix · error analysis" step={12} totalSteps={15} />

      {/* Header metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <BigMetric label="mAP@0.5" value={fmt(metrics?.map50 ?? latest?.mapScore)} tone="text-blue-400" icon={<Target className="w-4 h-4" />} />
        <BigMetric label="mAP@0.5:0.95" value={fmt(metrics?.map5095)} tone="text-cyan-400" icon={<BarChart3 className="w-4 h-4" />} />
        <BigMetric label="Precision" value={fmt(metrics?.precision ?? latest?.precision)} tone="text-emerald-400" icon={<CheckCircle2 className="w-4 h-4" />} />
        <BigMetric label="Recall" value={fmt(metrics?.recall ?? latest?.recall)} tone="text-violet-400" icon={<Target className="w-4 h-4" />} />
        <BigMetric label="Mean IoU" value={fmt(metrics?.mean_iou ?? latest?.meanIou)} tone="text-amber-400" icon={<ShieldCheck className="w-4 h-4" />} />
        <BigMetric label="Latency" value={metrics?.latency_ms?.mean ? `${Math.round(metrics.latency_ms.mean)} ms` : "—"} tone="text-rose-400" icon={<Zap className="w-4 h-4" />} />
      </div>

      {/* Run bar */}
      <div className="glass-card-solid p-3 flex flex-wrap items-center gap-3">
        <button onClick={runEvaluation} disabled={running} className="btn-primary text-xs flex items-center gap-2 disabled:opacity-50">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? "Evaluating…" : "Run evaluation on test split"}
        </button>
        <span className="text-[10px] text-[#64748b]">
          ai/evaluate.py --conf 0.25 --iou 0.5 · NMS 0.45 · {metrics?.total_images ?? 0} test images ·{" "}
          {metrics?.total_ground_truth ?? 0} GT · {metrics?.total_predictions ?? 0} preds
        </span>
        {metrics?.verify_no_pretrained && (
          <span className="badge-success text-[10px] px-2 py-0.5 rounded ml-auto">✓ no pretrained weights</span>
        )}
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300">{message}</div>
      )}
      {logs.length > 0 && (
        <div className="bg-black/50 border border-[#2a3550] rounded-lg p-3 max-h-28 overflow-y-auto font-mono text-[10px] text-emerald-300/80 space-y-0.5">
          {logs.slice(-12).map((l, i) => <div key={i} className="truncate">{l}</div>)}
        </div>
      )}

      {!metrics && !loading && (
        <div className="glass-card-solid p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-semibold">No evaluation results yet</p>
          <p className="text-xs text-[#64748b] mt-1">
            Train the model (or run the full pipeline), then evaluate against the held-out test split.
          </p>
        </div>
      )}

      {metrics && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Per-class AP */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-3">
                Per-class AP@0.5 (11-point interpolated)
              </h3>
              {perClass.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={perClass} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 10 }} stroke="#334155" />
                    <YAxis type="category" dataKey="class_name" width={110} tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #294066", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => Number(v ?? 0).toFixed(4)}
                    />
                    <Bar dataKey="ap" radius={[0, 4, 4, 0]}>
                      {perClass.map((entry, i) => (
                        <Cell key={entry.class_name} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-[#64748b] py-8 text-center">No per-class metrics in the results file</p>
              )}
              <p className="text-[10px] text-[#64748b] mt-2">
                mAP@0.5 = mean of the {perClass.length} per-class APs = <strong className="text-blue-400">{fmt(metrics.map50)}</strong>
              </p>
            </div>

            {/* Confusion matrix */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-3">
                Confusion matrix (IoU ≥ 0.5, rows = ground truth)
              </h3>
              {confusion && confusion.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="text-[9px] border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1" />
                        {classNames.map((c) => (
                          <th key={c} className="p-1 text-[#64748b] font-normal align-bottom" style={{ writingMode: "vertical-rl" }}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {confusion.map((row, i) => {
                        const max = Math.max(1, ...row);
                        return (
                          <tr key={i}>
                            <td className="p-1 text-right text-[#94a3b8] whitespace-nowrap">{classNames[i] ?? `c${i}`}</td>
                            {row.map((value, j) => {
                              const intensity = value / max;
                              return (
                                <td
                                  key={j}
                                  className="w-9 h-7 text-center font-mono"
                                  style={{
                                    background: i === j ? `rgba(16,185,129,${0.15 + intensity * 0.7})` : `rgba(239,68,68,${intensity * 0.7})`,
                                    color: intensity > 0.5 ? "#f8fafc" : "#94a3b8",
                                    border: "1px solid #1e293b",
                                  }}
                                  title={`GT ${classNames[i]} → predicted ${classNames[j]}: ${value}`}
                                >
                                  {value}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#64748b] py-8 text-center">No confusion matrix in the results file</p>
              )}
              <p className="text-[10px] text-[#64748b] mt-2">Green diagonal = correct · red off-diagonal = confusions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Error pie */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-3">Error breakdown</h3>
              {errorPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={errorPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2} label={false}>
                      {errorPie.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #294066", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-[#64748b] py-8 text-center">No error analysis available</p>
              )}
            </div>

            {/* Per-class table */}
            <div className="glass-card-solid p-4 xl:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-3">Per-class detail</h3>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="text-[#64748b] text-[10px] uppercase">
                    <tr>
                      <th className="text-left py-1">Class</th>
                      <th className="text-right py-1">AP@0.5</th>
                      <th className="text-right py-1">Precision</th>
                      <th className="text-right py-1">Recall</th>
                      <th className="text-right py-1">F1</th>
                      <th className="text-right py-1">GT</th>
                      <th className="text-right py-1">Preds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perClass.map((c, i) => (
                      <tr key={c.class_name ?? i} className="border-t border-[#1e293b]">
                        <td className="py-1.5 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                          {c.class_name}
                        </td>
                        <td className="text-right font-mono text-blue-400">{c.ap?.toFixed(4)}</td>
                        <td className="text-right font-mono text-emerald-400">{c.precision != null ? c.precision.toFixed(3) : "—"}</td>
                        <td className="text-right font-mono text-violet-400">{c.recall != null ? c.recall.toFixed(3) : "—"}</td>
                        <td className="text-right font-mono text-amber-400">{c.f1 != null ? c.f1.toFixed(3) : "—"}</td>
                        <td className="text-right font-mono text-[#64748b]">{c.gt_count ?? "—"}</td>
                        <td className="text-right font-mono text-[#64748b]">{c.pred_count ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="glass-card-solid p-3 text-[10px] text-[#64748b] flex flex-wrap gap-x-5 gap-y-1">
            <span>checkpoint: <span className="text-[#94a3b8] font-mono">{metrics.checkpoint ?? "—"}</span></span>
            <span>conf {metrics.confidence_threshold ?? 0.25} · iou {metrics.iou_threshold ?? 0.5}</span>
            <span>classes: {metrics.num_classes ?? perClass.length}</span>
            <span>evaluated: {metrics.timestamp ?? "—"}</span>
            <span className="text-emerald-400">from_scratch: {String(metrics.from_scratch ?? true)}</span>
          </div>
        </>
      )}

      {workflow && (
        <NextStepCard
          currentStep={workflow.currentStep}
          completedSteps={workflow.completedSteps}
          totalImages={workflow.totalImages}
          annotatedImages={workflow.annotatedImages}
          unannotatedImages={workflow.unannotatedImages}
          qualityComplete={workflow.qualityComplete}
          blockers={workflow.blockers}
        />
      )}

      <HelpCard title="How these metrics are produced">
        <p className="mb-2">
          <code className="text-blue-400">ai/evaluate.py</code> decodes the checkpoint over the held-out test split, applies class-wise NMS at
          IoU 0.45, then matches predictions to ground truth greedily in descending confidence order (IoU ≥ 0.5, class-aware).
        </p>
        <p className="mb-2">
          AP uses the 11-point interpolated VOC method per class; mAP@0.5 is their mean, mAP@0.5:0.95 averages ten IoU thresholds.
          Errors are split into localisation, classification, background and missed detections.
        </p>
        <p>
          Nothing here is hard-coded — delete <code>ai/checkpoints/evaluation_results.json</code> and re-run to see the numbers change.
          <Link href="/training" className="text-blue-400 ml-1">Train a better model →</Link>
        </p>
      </HelpCard>
    </div>
  );
}

function fmt(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(3);
}

function BigMetric({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card-solid p-3">
      <div className={`flex items-center gap-1.5 ${tone} mb-1`}>{icon}<span className="text-[9px] uppercase tracking-wider text-[#64748b]">{label}</span></div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
