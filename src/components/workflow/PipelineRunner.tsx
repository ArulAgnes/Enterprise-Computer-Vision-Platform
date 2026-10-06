"use client";

/**
 * PipelineRunner — the hero button: 🚀 RUN FULL AUTONOMOUS PIPELINE
 * =================================================================
 * One click drives POST /api/pipeline/run (SSE) and renders the seven real
 * stages the server reports, with a live log terminal and a results panel.
 *
 *   1. scan        captured photos discovered
 *   2. annotations annotated-image gate (auto-annotation CV accelerator)
 *   3. augment     annotation-aware synthetic expansion (10 → 100+)
 *   4. split       stratified, leakage-free auto split
 *   5. train       VisionBharat V2 from scratch (FocalLoss + CIoU + EMA)
 *   6. evaluate    real mAP / precision / recall / confusion matrix
 *   7. artifacts   best.pt mirrored to ai/checkpoints + models/
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, CheckCircle2, ChevronDown, ChevronUp, Loader2, Rocket, Sparkles, XCircle, Zap } from "lucide-react";

type StepStatus = "pending" | "running" | "done" | "waiting" | "error" | "need_annotation";

interface StepUpdate {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  data?: Record<string, unknown>;
}

interface PipelineResult {
  status?: string;
  error?: string;
  steps?: StepUpdate[];
  invention?: string[];
  artifacts?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  split?: { train?: number; val?: number; test?: number; leakage?: string; version?: string };
  augmented?: { generated?: number; total?: number };
  training?: { best_val_mAP50?: number; epochs_run?: number; parameters?: number };
  evaluation?: { map50?: number; precision?: number; recall?: number };
}

const STAGE_META: Record<string, { label: string; icon: string }> = {
  scan: { label: "Scan Captured Photos", icon: "📸" },
  annotations: { label: "Annotation Gate / CV Accelerator", icon: "🏷️" },
  augment: { label: "Synthetic Expansion (10 → 100)", icon: "🧠" },
  split: { label: "Leakage-Free Auto Split", icon: "🔀" },
  train: { label: "Train VisionBharat V2", icon: "🎯" },
  evaluate: { label: "Evaluate (real metrics)", icon: "📊" },
  artifacts: { label: "Export best.pt", icon: "💾" },
};

const ORDER = ["scan", "annotations", "augment", "split", "train", "evaluate", "artifacts"];

export default function PipelineRunner({ onFinished }: { onFinished?: () => void }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [options, setOptions] = useState({ targetAugment: 100, epochs: 200, batchSize: 8, imgSize: 640, testRun: false });
  const sourceRef = useRef<EventSource | null>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [logs]);

  useEffect(() => () => sourceRef.current?.close(), []);

  const run = useCallback(() => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setLogs(["[ui] opening SSE stream → /api/pipeline/run"]);
    setSteps(ORDER.map((id) => ({ id, label: STAGE_META[id].label, status: "pending" as StepStatus })));

    const params = new URLSearchParams({
      stream: "true",
      targetAugment: String(options.targetAugment),
      epochs: String(options.epochs),
      batchSize: String(options.batchSize),
      imgSize: String(options.imgSize),
      testRun: String(options.testRun),
    });

    const source = new EventSource(`/api/pipeline/run?${params.toString()}`);
    sourceRef.current = source;

    source.addEventListener("start", () => {
      setLogs((p) => [...p, "[pipeline] started"]);
    });

    source.addEventListener("step", (event) => {
      const update = JSON.parse((event as MessageEvent).data) as StepUpdate;
      setSteps((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.id === update.id);
        if (idx >= 0) next[idx] = update;
        else next.push(update);
        return next.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
      });
      if (update.detail) setLogs((p) => [...p, `[${update.id}] ${update.detail}`].slice(-300));
    });

    source.addEventListener("result", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as PipelineResult;
      setResult(payload);
      if (payload.status && payload.status !== "completed") setError(payload.error ?? `pipeline finished with status "${payload.status}"`);
      if (payload.steps) {
        setSteps(payload.steps.slice().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)));
      }
      setLogs((p) => [...p, `[pipeline] finished: ${payload.status}`].slice(-300));
      onFinished?.();
    });

    source.addEventListener("error", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setError(payload.error ?? "Pipeline error");
      } catch {
        setError("Pipeline stream closed unexpectedly");
      }
    });

    source.addEventListener("done", () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
    });

    source.onerror = () => {
      if (sourceRef.current === source) {
        source.close();
        sourceRef.current = null;
        setRunning(false);
      }
    };
  }, [options, running, onFinished]);

  const completed = steps.filter((s) => s.status === "done").length;
  const progressPct = Math.round((completed / ORDER.length) * 100);

  return (
    <div className="glass-card overflow-hidden border-violet-500/30">
      {/* Hero bar */}
      <div className="relative p-5 bg-gradient-to-r from-violet-600/15 via-blue-600/10 to-cyan-600/15">
        <div className="flex flex-wrap items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <h2 className="text-lg font-bold">🚀 RUN FULL AUTONOMOUS PIPELINE</h2>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              Scan → auto-annotate → expand 10→{options.targetAugment} → leakage-free split → train VisionBharat V2 → evaluate → export{" "}
              <code className="text-blue-400">best.pt</code>. One click, seven real stages, CPU or GPU.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!running ? (
              <button
                onClick={() => {
                  setOpen(true);
                  run();
                }}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Zap className="w-4 h-4" /> Launch Pipeline
              </button>
            ) : (
              <button
                onClick={() => {
                  sourceRef.current?.close();
                  sourceRef.current = null;
                  setRunning(false);
                  setLogs((p) => [...p, "[ui] stream detached — the pipeline keeps running server-side"]);
                }}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" /> Detach
              </button>
            )}
            <button onClick={() => setOpen((v) => !v)} className="btn-secondary text-xs flex items-center gap-1">
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} {open ? "Hide" : "Options"}
            </button>
          </div>
        </div>

        {/* options */}
        {open && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
            {([
              ["targetAugment", "Target images"],
              ["epochs", "Epochs"],
              ["batchSize", "Batch"],
              ["imgSize", "Image size"],
            ] as const).map(([key, label]) => (
              <div key={key} className="p-2 rounded-lg bg-black/20">
                <label className="text-[9px] uppercase text-[#64748b]">{label}</label>
                <input
                  type="number"
                  value={options[key]}
                  onChange={(e) => setOptions((p) => ({ ...p, [key]: Number(e.target.value) || p[key] }))}
                  disabled={running}
                  className="w-full bg-transparent text-sm font-mono text-[#e2e8f0] outline-none"
                />
              </div>
            ))}
            <label className="p-2 rounded-lg bg-black/20 flex items-center gap-2 text-[10px] text-[#94a3b8]">
              <input
                type="checkbox"
                checked={options.testRun}
                onChange={(e) => setOptions((p) => ({ ...p, testRun: e.target.checked }))}
                disabled={running}
                className="accent-blue-500"
              />
              --test-run (2 epochs, fast)
            </label>
          </div>
        )}
      </div>

      {/* Stepper */}
      {(running || steps.length > 0) && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#94a3b8] flex items-center gap-2">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {running ? "Pipeline running…" : `Pipeline ${result?.status ?? "idle"}`}
            </span>
            <span className="font-mono text-blue-400">{completed}/{ORDER.length} stages · {progressPct}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {ORDER.map((id, i) => {
              const step = steps.find((s) => s.id === id);
              const status: StepStatus = step?.status ?? "pending";
              const tone =
                status === "done" ? "border-emerald-500/40 bg-emerald-500/5"
                : status === "running" ? "border-blue-500/50 bg-blue-500/10"
                : status === "error" ? "border-rose-500/40 bg-rose-500/5"
                : status === "waiting" || status === "need_annotation" ? "border-amber-500/40 bg-amber-500/5"
                : "border-[#2a3550] bg-[#0d1220]";
              return (
                <div key={id} className={`p-2.5 rounded-lg border ${tone}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{STAGE_META[id].icon}</span>
                    <span className="text-[10px] font-mono text-[#64748b]">{i + 1}</span>
                    <span className="text-[11px] font-semibold flex-1 truncate">{STAGE_META[id].label}</span>
                    {status === "running" && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                    {status === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    {status === "error" && <XCircle className="w-3 h-3 text-rose-400" />}
                  </div>
                  {step?.detail && <p className="text-[9px] text-[#64748b] mt-1 line-clamp-2">{step.detail}</p>}
                </div>
              );
            })}
          </div>

          {/* Log terminal */}
          <div>
            <button onClick={() => setShowLogs((v) => !v)} className="text-[10px] text-[#64748b] flex items-center gap-1 mb-1">
              {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} live log ({logs.length})
            </button>
            {showLogs && (
              <div ref={logBoxRef} className="bg-black/70 border border-[#2a3550] rounded-lg p-3 h-40 overflow-y-auto font-mono text-[10px] text-emerald-300/80 space-y-0.5">
                {logs.map((line, i) => <div key={i} className="truncate">{line}</div>)}
              </div>
            )}
          </div>

          {/* Result panel */}
          {result && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <ResultTile label="Split" value={result.split ? `${result.split.train}/${result.split.val}/${result.split.test}` : "—"} sub={result.split?.leakage ? `leakage ${result.split.leakage}` : undefined} tone="text-cyan-400" />
              <ResultTile label="Dataset" value={String(result.augmented?.total ?? "—")} sub={`+${result.augmented?.generated ?? 0} synthetic`} tone="text-violet-400" />
              <ResultTile label="Best mAP@0.5" value={fmt(result.training?.best_val_mAP50 ?? result.evaluation?.map50)} sub={`${result.training?.epochs_run ?? 0} epochs`} tone="text-emerald-400" />
              <ResultTile label="Precision" value={fmt(result.evaluation?.precision)} sub={`recall ${fmt(result.evaluation?.recall)}`} tone="text-blue-400" />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {error.toLowerCase().includes("annotation") && <p className="text-[10px] mt-1 opacity-80">Open the Annotation Studio to draw a few boxes — or let the CV accelerator propose them automatically.</p>}
              </div>
            </div>
          )}

          {result?.invention && (
            <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/25">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3" /> Inventions exercised by this run
              </p>
              <ul className="text-[10px] text-violet-200/80 space-y-0.5">
                {result.invention.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n.toFixed(4) : "—";
}

function ResultTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="p-3 rounded-lg bg-[#111827]">
      <p className="text-[9px] uppercase tracking-wider text-[#64748b]">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-[9px] text-[#64748b]">{sub}</p>}
    </div>
  );
}
