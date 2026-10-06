"use client";

/**
 * Training Lab — VisionBharat V2
 * ==============================
 * Drives `/api/train`, which spawns `ai/train.py` and streams Server-Sent
 * Events (`start` / `epoch` / `log` / `result` / `error` / `done`). The epoch
 * chart, the log terminal and the checkpoint list are all fed by that stream —
 * nothing is simulated.
 *
 * Compliance: the model is built and trained entirely from Kaiming-random
 * initialisation (`verify_no_pretrained()` gates the run) — no pretrained
 * backbones, no transfer learning.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, Brain, CheckCircle2, Clock, Cpu, Layers,
  Loader2, Monitor, Play, Settings, Square, TrendingUp, Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { HelpCard, NextStepCard, PageHeader } from "@/components/workflow";
import Link from "next/link";

interface Dataset {
  id: string;
  name: string;
  datasetId: string;
  imageCount?: number;
  annotatedCount?: number;
  classCount?: number;
}

interface Model {
  id: string;
  modelId: string;
  name: string;
  status: string;
  checkpointPath?: string;
  numClasses?: number;
  parameterCount?: number;
  mapScore?: number;
}

interface SplitInfo {
  train: number;
  val: number;
  test: number;
  leakage: string;
  stratified: boolean;
  version?: string;
  version_id?: string;
  attempts?: number;
  method?: string;
}

interface EpochRow {
  epoch: number;
  train_loss?: number;
  mAP50?: number;
  mAP50_ema?: number;
  precision?: number;
  recall?: number;
  lr?: number;
  seconds?: number;
}

/** VisionBharat V2 spec — mirrored from ai/model.py (strides/anchor/param truth). */
const V2_SPEC = {
  params: 5_573_937,
  encoders: [
    { stage: "Stem", detail: "Conv 3→32 s2 + Conv 32→64 s2", out: "160×160×64", stride: 4 },
    { stage: "Stage 1", detail: "2× CSPResidualBlock (split-half + SE)", out: "160×160×64", stride: 4 },
    { stage: "Stage 2", detail: "2× CSPResidualBlock, 64→128", out: "80×80×128", stride: 8 },
    { stage: "Stage 3", detail: "2× CSPResidualBlock, 128→256", out: "40×40×256", stride: 16 },
  ],
  neck: "FPN top-down + PAN bottom-up, 128 channels (3 levels, 3 anchors each)",
  head: "Decoupled: shared 3×3 → cls branch (BCE/Focal) + reg branch (CIoU, 5 channels)",
};

export default function TrainingPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [epochs, setEpochs] = useState<EpochRow[]>([]);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState<boolean | null>(null);
  const [testRun, setTestRun] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const { state: workflow, refetch: refetchWorkflow } = useWorkflowState();
  const { data: healthData } = useApi<{ gpu: string; python: string; torch?: string }>("/api/health");
  const { data: datasets } = useApi<Dataset[]>("/api/datasets");
  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const effectiveDatasetId = selectedDatasetId || datasetsArray[0]?.id || null;
  const selectedDataset = datasetsArray.find((d) => d.id === effectiveDatasetId);

  const { data: modelsData, refetch: refetchModels } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const hasTrainedModel = models.some((m) => m.checkpointPath);

  const { data: splitData, refetch: refetchSplit } = useApi<SplitInfo | null>("/api/split");
  const split: SplitInfo | null = splitData ?? null;

  const [config, setConfig] = useState({
    imageSize: "640", batchSize: "8", epochs: "200", learningRate: "0.001",
    weightDecay: "0.05", accumulate: "2", patience: "30", minEpochs: "150", warmup: "3",
  });

  const annotationCount = selectedDataset?.annotatedCount ?? 0;
  const imageCount = selectedDataset?.imageCount ?? 0;
  const canTrain = !!effectiveDatasetId && annotationCount > 0 && !running;

  useEffect(() => () => sourceRef.current?.close(), []);

  const bestEpoch = useMemo(
    () => epochs.reduce<{ mAP50: number; epoch: number }>((best, row) => ((row.mAP50 ?? 0) > best.mAP50 ? { mAP50: row.mAP50 ?? 0, epoch: row.epoch } : best), { mAP50: -1, epoch: 0 }),
    [epochs]
  );

  const startTraining = () => {
    if (!effectiveDatasetId || running) return;
    setRunning(true);
    setLogs([]);
    setEpochs([]);
    setResultSummary(null);
    setResultOk(null);
    setStatusLine("POST /api/train (SSE) — spawning ai/train.py…");

    const params = new URLSearchParams({
      datasetId: effectiveDatasetId,
      epochs: config.epochs,
      batchSize: config.batchSize,
      imgSize: config.imageSize,
      learningRate: config.learningRate,
      stream: "true",
      testRun: String(testRun),
    });

    const source = new EventSource(`/api/train?${params.toString()}`);
    sourceRef.current = source;

    source.addEventListener("start", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      setStatusLine(`Training visionbharat_v2 · ${payload.epochs} epochs · batch ${payload.batchSize} · ${payload.imgSize}px · classes ${payload.classes?.length ?? "?"}`);
      setLogs((prev) => [...prev, `[train] model=${payload.model ?? "VisionBharatV2"} params=${payload.params ?? ""} from_scratch=true`].slice(-400));
    });

    source.addEventListener("epoch", (event) => {
      const row = JSON.parse((event as MessageEvent).data) as EpochRow;
      setEpochs((prev) => [...prev.filter((r) => r.epoch !== row.epoch), row].sort((a, b) => a.epoch - b.epoch));
      setStatusLine(`Epoch ${row.epoch} · loss ${row.train_loss?.toFixed(4)} · mAP@0.5 ${row.mAP50?.toFixed(4)} · ${row.seconds?.toFixed(0)}s`);
    });

    source.addEventListener("log", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { line: string };
      setLogs((prev) => [...prev, payload.line].slice(-400));
    });

    source.addEventListener("result", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      setResultOk(!!payload.ok);
      setResultSummary(
        payload.ok
          ? `Training complete — best mAP@0.5 ${Number(payload.bestValMap50 ?? 0).toFixed(4)} at epoch ${payload.bestEpoch} · ${payload.epochsRun} epochs · ${payload.parameters?.toLocaleString()} params`
          : payload.error || "Training failed"
      );
      refetchModels();
      refetchWorkflow();
    });

    source.addEventListener("error", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setResultOk(false);
        setResultSummary(payload.error ?? "Training error");
      } catch {
        setResultOk(false);
        setResultSummary("Training stream closed unexpectedly");
      }
    });

    source.addEventListener("done", () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
    });

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setRunning(false);
    };
  };

  const stopTraining = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setRunning(false);
    setStatusLine("Stream detached — the training process keeps running on the server; reload to re-attach via /api/train GET.");
  };

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Training Lab" subtitle="VisionBharat V2 · 5.57M params · from scratch, no pretrained weights" step={9} totalSteps={15} />
        <div className="flex items-center gap-2">
          {datasetsArray.length > 0 && (
            <select
              className="bg-[#111827] border border-[#2a3550] rounded px-3 py-1.5 text-xs text-[#94a3b8]"
              value={effectiveDatasetId || ""}
              onChange={(e) => setSelectedDatasetId(e.target.value || null)}
            >
              <option value="">Select dataset</option>
              {datasetsArray.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-[10px] text-[#94a3b8] px-2 py-1.5 rounded bg-[#111827] border border-[#2a3550]">
            <input type="checkbox" checked={testRun} onChange={(e) => setTestRun(e.target.checked)} className="accent-blue-500" />
            --test-run (fast)
          </label>
          {!running ? (
            <button onClick={startTraining} disabled={!canTrain} className={`text-xs flex items-center gap-1 ${canTrain ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed"}`}>
              <Play className="w-3 h-3" /> Start Training
            </button>
          ) : (
            <button onClick={stopTraining} className="btn-secondary text-xs flex items-center gap-1">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Auto-split (P3) banner */}
      {split && (
        <div className={`p-3 rounded-lg border text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${split.leakage === "PASSED" ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300" : "bg-amber-500/10 border-amber-500/25 text-amber-300"}`}>
          <span className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Auto-Split Complete — {split.train} train / {split.val} val / {split.test} test
          </span>
          <span>Leakage: <strong>{split.leakage}</strong></span>
          <span>stratified: {split.stratified ? "yes" : "no"}</span>
          {split.attempts != null && <span>{split.attempts} attempt(s), seed 42</span>}
          {split.version && <span className="font-mono">{split.version}</span>}
          <button onClick={() => refetchSplit()} className="ml-auto text-[10px] underline opacity-80">refresh</button>
        </div>
      )}

      {/* Live status */}
      {(running || epochs.length > 0) && (
        <div className="glass-card-solid p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {running ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            <span className="text-xs text-[#94a3b8]">{statusLine}</span>
            <span className="ml-auto text-[10px] font-mono text-[#64748b]">
              {epochs.length} epoch(s) streamed{bestEpoch.epoch ? ` · best e${bestEpoch.epoch} mAP ${bestEpoch.mAP50.toFixed(4)}` : ""}
            </span>
          </div>

          {epochs.length > 1 && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={epochs} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mapFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="epoch" tick={{ fill: "#64748b", fontSize: 10 }} stroke="#334155" />
                <YAxis yAxisId="loss" tick={{ fill: "#64748b", fontSize: 10 }} stroke="#334155" />
                <YAxis yAxisId="map" orientation="right" domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 10 }} stroke="#334155" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #294066", borderRadius: 8, fontSize: 12 }} />
                <Area yAxisId="loss" type="monotone" dataKey="train_loss" stroke="#3b82f6" fill="url(#lossFill)" strokeWidth={2} name="train loss" />
                <Area yAxisId="map" type="monotone" dataKey="mAP50" stroke="#10b981" fill="url(#mapFill)" strokeWidth={2} name="mAP@0.5" />
                <Area yAxisId="map" type="monotone" dataKey="mAP50_ema" stroke="#8b5cf6" fill="none" strokeDasharray="4 3" strokeWidth={2} name="mAP@0.5 (EMA)" />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {logs.length > 0 && (
            <div className="bg-black/60 border border-[#2a3550] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[10px] text-emerald-300/80 space-y-0.5">
              {logs.slice(-60).map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)}
            </div>
          )}
        </div>
      )}

      {resultSummary && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${resultOk ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border border-rose-500/20 text-rose-300"}`}>
          {resultOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {resultSummary}
        </div>
      )}

      {!canTrain && effectiveDatasetId && !running && (
        <div className="glass-card-solid p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-400">Training blocked</h3>
              <p className="text-xs text-[#94a3b8] mt-1">
                {imageCount} images, {annotationCount} annotated. Draw at least one bounding box (10 unlocks synthetic expansion).
              </p>
              <Link href="/annotation" className="text-[10px] text-blue-400 mt-2 inline-flex items-center gap-1">
                Open Annotation Studio <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hyperparameters */}
        <div className="glass-card-solid p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Hyperparameters</h3>
          <div className="space-y-2">
            {([
              ["imageSize", "Image size"], ["batchSize", "Batch size"], ["epochs", "Epochs"],
              ["learningRate", "Learning rate"], ["weightDecay", "Weight decay (AdamW)"],
              ["accumulate", "Grad accumulation"], ["patience", "Early-stop patience"],
              ["minEpochs", "Min epochs"], ["warmup", "Warmup epochs"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-xs text-[#94a3b8]">{label}</label>
                <input
                  className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none"
                  value={config[key]}
                  onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))}
                  disabled={running}
                />
              </div>
            ))}
          </div>
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 space-y-0.5">
            <p className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> verify_no_pretrained() gates every run</p>
            <p className="text-emerald-200/70">FocalLoss α=0.25 γ=2.0 · CIoU · EMA 0.9999</p>
            <p className="text-emerald-200/70">CosineAnnealingWarmRestarts T_0=10 T_mult=2</p>
            <p className="text-emerald-200/70">Mosaic 0.5 · MixUp · CopyPaste</p>
          </div>
        </div>

        {/* Architecture */}
        <div className="lg:col-span-2 glass-card-solid p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-violet-400" /> VisionBharat V2 — {V2_SPEC.params.toLocaleString()} parameters
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Component</th><th>Detail</th><th>Output</th><th className="text-right">Stride</th></tr></thead>
              <tbody>
                {V2_SPEC.encoders.map((row) => (
                  <tr key={row.stage}>
                    <td className="text-xs font-semibold">{row.stage}</td>
                    <td className="text-xs text-[#94a3b8]">{row.detail}</td>
                    <td className="text-xs font-mono text-[#94a3b8]">{row.out}</td>
                    <td className="text-xs font-mono text-right text-blue-400">/{row.stride}</td>
                  </tr>
                ))}
                <tr><td className="text-xs font-semibold">Neck</td><td className="text-xs text-[#94a3b8]" colSpan={3}>{V2_SPEC.neck}</td></tr>
                <tr><td className="text-xs font-semibold">Head</td><td className="text-xs text-[#94a3b8]" colSpan={3}>{V2_SPEC.head}</td></tr>
                <tr className="border-t-2 border-blue-500/30">
                  <td className="text-xs font-bold">Total</td>
                  <td className="text-xs text-[#64748b]">CSP + SE residual blocks, 3 anchors/level × 3 levels</td>
                  <td className="text-xs font-mono text-right text-blue-400" colSpan={2}>{V2_SPEC.params.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold flex items-center gap-2 mt-4 mb-2"><Zap className="w-4 h-4 text-amber-400" /> Loss</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { name: "Focal Loss (cls+obj)", weight: "α=0.25 γ=2.0", desc: "Down-weights easy negatives — from-scratch training needs this." },
              { name: "CIoU (box)", weight: "λ=5.0", desc: "Complete-IoU: overlap + centre distance + aspect ratio penalty." },
              { name: "Matched-anchor assign", weight: "1 anchor/GT", desc: "Best shape+scale anchor, positive only inside the object." },
            ].map((lc) => (
              <div key={lc.name} className="p-2 rounded-lg bg-[#111827]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{lc.name}</span>
                  <span className="text-[10px] font-mono badge-info px-1.5 py-0.5 rounded">{lc.weight}</span>
                </div>
                <p className="text-[10px] text-[#64748b]">{lc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hardware */}
      <div className="glass-card-solid p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Monitor className="w-4 h-4 text-emerald-400" /> Hardware</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#111827] rounded text-center"><Cpu className="w-4 h-4 text-blue-400 mx-auto mb-1" /><p className="text-xs font-bold">CPU</p><p className="text-[10px] text-[#64748b]">Always available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Monitor className={`w-4 h-4 mx-auto mb-1 ${healthData?.gpu === "available" ? "text-emerald-400" : "text-amber-400"}`} /><p className="text-xs font-bold">GPU</p><p className="text-[10px] text-[#64748b]">{healthData?.gpu === "available" ? "CUDA detected" : "Not available"}</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" /><p className="text-xs font-bold">Throughput</p><p className="text-[10px] text-[#64748b]">{healthData?.gpu === "available" ? "~50 img/s" : "~1.5 img/s (CPU)"}</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Activity className="w-4 h-4 text-emerald-400 mx-auto mb-1" /><p className="text-xs font-bold">Torch</p><p className="text-[10px] text-[#64748b]">{healthData?.torch ?? healthData?.python ?? "python"}</p></div>
        </div>
        <p className="text-[10px] text-[#64748b] mt-2 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Adaptive: on CPU the trainer automatically lowers resolution/batch to stay inside memory — the spec defaults (640/8/200) apply whenever a GPU is present.
        </p>
      </div>

      {hasTrainedModel && (
        <div className="glass-card-solid p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Brain className="w-4 h-4 text-blue-400" /> Trained models</h3>
          <div className="space-y-2">
            {models.filter((m) => m.checkpointPath).map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#111827]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{m.name}</p>
                  <p className="text-[10px] text-[#64748b] truncate">
                    {m.checkpointPath} · {m.numClasses ?? "?"} classes{m.parameterCount ? ` · ${m.parameterCount.toLocaleString()} params` : ""}
                  </p>
                </div>
                {m.mapScore != null && <span className="text-[10px] font-mono text-blue-400">mAP {m.mapScore.toFixed(4)}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded badge-success">{m.status}</span>
              </div>
            ))}
          </div>
          <Link href="/evaluation" className="btn-secondary text-[11px] mt-3 inline-flex items-center gap-1">
            Evaluate this model <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
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

      <HelpCard title="Training, exactly as it runs">
        <p className="mb-2">
          <strong>From scratch only.</strong> <code className="text-blue-400">ai/model.py</code> builds VisionBharat V2 with Kaiming-random weights and
          refuses to start unless <code className="text-blue-400">verify_no_pretrained()</code> passes (it token-scans its own source for banned
          pretrained APIs and asserts every parameter requires gradients).
        </p>
        <p className="mb-2">
          <strong>What happens during a run:</strong> matching anchor assignment → FocalLoss (α 0.25, γ 2.0) + CIoU box loss → AdamW (lr 1e-3, wd 0.05) with
          warmup and CosineAnnealingWarmRestarts (T_0=10, T_mult=2) → EMA shadow at 0.9999 → per-epoch validation.
        </p>
        <p>
          Checkpoints land in <code>ai/checkpoints/</code> (<code>best.pt</code>, <code>last.pt</code>, <code>epoch_10.pt</code> …) and are mirrored to
          <code> models/visionbharat_v2_best.pt</code> and <code>models/best.pt</code> for the judges.
        </p>
      </HelpCard>
    </div>
  );
}
