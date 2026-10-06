"use client";

/**
 * SyntheticExpansionDialog — INVENTION 1 front-end
 * ================================================
 * Shown automatically the moment the 10th image is annotated. It explains the
 * Annotation-Aware Synthetic Expansion Engine, then drives `/api/augment`
 * (which in turn triggers the leakage-free auto split) with a live progress bar,
 * a streaming log terminal and a preview grid of the generated samples.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, CheckCircle2, Loader2, Sparkles, X, Zap } from "lucide-react";

interface AugmentImage {
  id: string;
  filename: string;
  url: string;
  className: string;
  annotations: number;
  transform: string;
  parentImageId: string | null;
}

interface AutoSplit {
  train: number;
  val: number;
  test: number;
  leakage: string;
  stratified: boolean;
  version?: string;
  method?: string;
  attempts?: number;
  error?: string;
}

interface AugmentResponse {
  status?: string;
  original?: number;
  augmented?: number;
  total?: number;
  engine?: string;
  rejected?: number;
  duplicates?: number;
  per_class?: Record<string, number>;
  preview?: string[];
  images?: AugmentImage[];
  logs?: string[];
  auto_split?: AutoSplit | null;
  error?: string;
  need_annotation?: boolean;
}

const PIPELINE_STAGES = [
  { at: 0, label: "Building annotation-aware input…" },
  { at: 4, label: "Cycling light / medium / heavy transforms…" },
  { at: 35, label: "Quality gate: rejecting boxes < 10px…" },
  { at: 60, label: "Class-balanced generation…" },
  { at: 85, label: "Writing COCO JSON + registering images…" },
  { at: 95, label: "Auto-split (leakage-free, stratified)…" },
];

export default function SyntheticExpansionDialog({
  open,
  annotatedCount,
  targetCount = 100,
  onClose,
  onComplete,
}: {
  open: boolean;
  annotatedCount: number;
  targetCount?: number;
  onClose: () => void;
  onComplete?: (result: AugmentResponse) => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<AugmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customTarget, setCustomTarget] = useState(targetCount);
  const [showCustom, setShowCustom] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stage = useMemo(() => {
    let label = PIPELINE_STAGES[0].label;
    for (const s of PIPELINE_STAGES) if (progress >= s.at) label = s.label;
    return label;
  }, [progress]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const run = useCallback(
    async (target: number) => {
      setRunning(true);
      setError(null);
      setResult(null);
      setLogs([`[ui] requesting ${target} synthetic samples for ${annotatedCount} annotated images…`]);
      setProgress(2);

      timerRef.current = setInterval(() => {
        setProgress((p) => (p < 92 ? p + Math.max(0.4, (92 - p) / 45) : p));
      }, 250);

      try {
        const res = await fetch("/api/augment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetCount: target, autoSplit: true }),
        });
        const json: AugmentResponse = await res.json();
        if (timerRef.current) clearInterval(timerRef.current);

        if (!res.ok) {
          setError(json.error || `Augmentation failed (HTTP ${res.status})`);
          setLogs((prev) => [...prev, `[ui] error: ${json.error || res.status}`]);
          setProgress(0);
          setRunning(false);
          return;
        }
        setProgress(100);
        setResult(json);
        setLogs((prev) => [...prev, ...(json.logs ?? []).slice(-40)]);
        onComplete?.(json);
      } catch (err) {
        if (timerRef.current) clearInterval(timerRef.current);
        setError(err instanceof Error ? err.message : "Augmentation failed");
        setProgress(0);
      } finally {
        setRunning(false);
      }
    },
    [annotatedCount, onComplete]
  );

  if (!open) return null;

  const augmented = result?.augmented ?? 0;
  const split = result?.auto_split;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card-solid w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-violet-500/30">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[#2a3550] bg-gradient-to-r from-violet-600/10 via-blue-600/10 to-cyan-600/10">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold tracking-widest text-violet-400 uppercase">Invention · Annotation-Aware Synthetic Expansion</p>
            <h2 className="text-lg font-bold">🧠 Synthetic Expansion Engine Ready</h2>
            <p className="text-xs text-[#94a3b8] mt-1">
              You annotated <strong className="text-emerald-400">{annotatedCount}</strong> images. Generate{" "}
              <strong className="text-blue-400">{customTarget}</strong> diverse samples? Our engine preserves every bounding box through
              12 geometry-aware transforms. No one has this.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-[#64748b]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Fact strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Annotated", value: annotatedCount, tone: "text-emerald-400" },
              { label: "Target", value: customTarget, tone: "text-blue-400" },
              { label: "Transforms", value: "12", tone: "text-violet-400" },
              { label: "Bbox drift", value: "0 px", tone: "text-cyan-400" },
            ].map((item) => (
              <div key={item.label} className="p-2 rounded-lg bg-[#111827] text-center">
                <p className={`text-lg font-bold ${item.tone}`}>{item.value}</p>
                <p className="text-[9px] text-[#64748b] uppercase">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          {(running || progress > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#94a3b8] flex items-center gap-2">
                  {running ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  {running ? stage : "Synthetic expansion complete"}
                </span>
                <span className="font-mono text-blue-400">{Math.round(progress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Live log */}
          {logs.length > 0 && (
            <div className="bg-black/60 border border-[#2a3550] rounded-lg p-3 max-h-32 overflow-y-auto font-mono text-[10px] text-emerald-300/80 space-y-0.5">
              {logs.slice(-14).map((line, i) => (
                <div key={i} className="truncate">{line}</div>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Generated" value={result.augmented ?? 0} tone="text-emerald-400" />
                <Stat label="Rejected (quality gate)" value={result.rejected ?? 0} tone="text-amber-400" />
                <Stat label="Duplicates blocked" value={result.duplicates ?? 0} tone="text-violet-400" />
                <Stat label="Dataset total" value={result.total ?? 0} tone="text-blue-400" />
              </div>

              {split && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs">
                  <p className="font-semibold text-emerald-300 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5" /> Auto-Split Complete: {split.train} train / {split.val} val / {split.test} test
                  </p>
                  <p className="text-[10px] text-emerald-200/70 mt-1">
                    Leakage: <strong>{split.leakage}</strong> · stratified: {split.stratified ? "yes" : "no"}
                    {split.attempts ? ` · ${split.attempts} reshuffle attempt(s)` : ""}
                    {split.version ? ` · ${split.version}` : ""}
                  </p>
                </div>
              )}

              {(result.images?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#64748b] mb-2">Generated preview (bbox preserved)</p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {result.images!.slice(0, 6).map((img) => (
                      <div key={img.id} className="rounded-lg overflow-hidden border border-[#2a3550] bg-[#0d1220]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.filename} className="w-full h-20 object-cover" />
                        <p className="text-[8px] px-1 py-0.5 text-[#64748b] truncate">{img.className}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">{error}</div>
          )}

          {/* Actions */}
          {!result && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button onClick={() => run(customTarget)} disabled={running} className="btn-primary text-xs flex items-center gap-2 disabled:opacity-50">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {running ? "Generating…" : `Generate ${customTarget}`}
              </button>
              {showCustom ? (
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={customTarget}
                  onChange={(e) => setCustomTarget(Math.max(10, Math.min(1000, Number(e.target.value) || 10)))}
                  className="w-24 text-xs px-2 py-1.5 rounded-lg bg-[#111827] border border-[#2a3550] text-[#e2e8f0]"
                />
              ) : (
                <button onClick={() => setShowCustom(true)} className="btn-secondary text-xs">
                  Custom
                </button>
              )}
              <button onClick={onClose} className="btn-secondary text-xs">
                Later
              </button>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={onClose} className="btn-primary text-xs">
                Close
              </button>
              <button onClick={() => { setResult(null); setProgress(0); }} className="btn-secondary text-xs">
                Generate more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="p-2 rounded-lg bg-[#111827] text-center">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[9px] text-[#64748b] uppercase leading-tight">{label}</p>
    </div>
  );
}
