"use client";

import { useState } from "react";
import { Brain, Play, Settings, Cpu, Clock, Activity, Layers, Zap, CheckCircle2, AlertCircle, Monitor, Loader2, AlertTriangle, ArrowRight, X } from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { NextStepCard, HelpCard, PageHeader, InfoBar } from "@/components/workflow";
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
}

const archLayers = [
  { name: "Input", shape: "640x640x3", params: 0 },
  { name: "Stem Conv 3->32", shape: "320x320x32", params: 864 },
  { name: "Conv Block 32->64", shape: "160x160x64", params: 18496 },
  { name: "Res Block 64->64", shape: "160x160x64", params: 36928 },
  { name: "Conv Block 64->128", shape: "80x80x128", params: 73856 },
  { name: "Res Block 128->128", shape: "80x80x128", params: 147584 },
  { name: "Conv Block 128->256", shape: "40x40x256", params: 295168 },
  { name: "Res Block 256->256", shape: "40x40x256", params: 590080 },
  { name: "Feature Fusion", shape: "40x40x384", params: 295168 },
  { name: "Detection Head", shape: "40x40x(5+8)", params: 26624 },
];

const lossComponents = [
  { name: "Box Loss", weight: 5.0, desc: "GIoU-based bounding box regression" },
  { name: "Objectness Loss", weight: 1.0, desc: "Binary cross-entropy for object presence" },
  { name: "Classification Loss", weight: 1.0, desc: "Cross-entropy for class prediction" },
];

export default function TrainingPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [trainResult, setTrainResult] = useState<string | null>(null);
  const { state: workflow, refetch: refetchWorkflow } = useWorkflowState();
  const { data: healthData } = useApi<{ gpu: string; python: string }>("/api/health");

  const { data: datasets } = useApi<Dataset[]>("/api/datasets");
  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const effectiveDatasetId = selectedDatasetId || datasetsArray[0]?.id || null;
  const selectedDataset = datasetsArray.find(d => d.id === effectiveDatasetId);

  const { data: modelsData, refetch: refetchModels } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const hasTrainedModel = models.some(m => m.checkpointPath);

  const [config, setConfig] = useState({
    imageSize: "640", batchSize: "16", epochs: "100", learningRate: "0.001",
    optimizer: "adam", weightDecay: "0.0005", randomSeed: "42",
  });

  const canTrain = effectiveDatasetId && (selectedDataset?.annotatedCount ?? 0) > 0;
  const annotationCount = selectedDataset?.annotatedCount ?? 0;
  const imageCount = selectedDataset?.imageCount ?? 0;

  const handleStartTraining = async () => {
    if (!effectiveDatasetId) return;
    setStarting(true);
    setTrainResult(null);
    try {
      const result = await apiPost<{
        training?: { success: boolean; trainLoss?: number; errorMessage?: string };
        error?: string;
        message?: string;
      }>("/api/train", {
        datasetId: effectiveDatasetId,
        epochs: parseInt(config.epochs),
        batchSize: parseInt(config.batchSize),
        learningRate: parseFloat(config.learningRate),
        optimizer: config.optimizer,
        imageSize: parseInt(config.imageSize),
        seed: parseInt(config.randomSeed),
      });
      if (result?.training?.success) {
        setTrainResult(`Training completed! Final loss: ${result.training.trainLoss?.toFixed(4) ?? "N/A"}`);
      } else {
        setTrainResult(result?.message || result?.training?.errorMessage || result?.error || "Training failed");
      }
      refetchModels();
    } catch (err) {
      setTrainResult(err instanceof Error ? err.message : "Training failed");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Training Lab" subtitle="Train your model from scratch — no pretrained weights" step={9} totalSteps={15} />
        <div className="flex items-center gap-2">
          {datasetsArray.length > 0 && (
            <select className="bg-[#111827] border border-[#2a3550] rounded px-3 py-1.5 text-xs text-[#94a3b8]" value={effectiveDatasetId || ""} onChange={(e) => setSelectedDatasetId(e.target.value || null)}>
              <option value="">Select dataset</option>
              {datasetsArray.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <button onClick={handleStartTraining} disabled={!canTrain || starting} className={`text-xs flex items-center gap-1 ${canTrain ? "btn-primary" : "btn-secondary opacity-50 cursor-not-allowed"}`}>
            {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {starting ? "Training..." : "Start Training"}
          </button>
        </div>
      </div>

      {/* Training blocked banner */}
      {!canTrain && effectiveDatasetId && (
        <div className="glass-card-solid p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-400">Training Blocked</h3>
              <p className="text-xs text-[#94a3b8] mt-1">
                Your dataset has {imageCount} images but {annotationCount} annotations.
                Bounding-box annotations are required before training.
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className={`status-dot ${annotationCount > 0 ? "green" : "red"}`} />
                  <span className="text-[10px] text-[#64748b]">Annotations: {annotationCount} / {imageCount}</span>
                </div>
                <Link href="/annotation" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  Open Annotation Studio <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training result */}
      {trainResult && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${trainResult.includes("completed") || trainResult.includes("success") ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border border-rose-500/20 text-rose-300"}`}>
          {trainResult.includes("completed") ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {trainResult}
          <button onClick={() => setTrainResult(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Prerequisites */}
      <div className="glass-card-solid p-4">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Training Readiness</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { label: "Dataset selected", done: !!effectiveDatasetId, detail: selectedDataset?.name ?? "None selected" },
            { label: "Images loaded", done: imageCount > 0, detail: `${imageCount} images`, blocked: imageCount === 0 && !!effectiveDatasetId },
            { label: "Classes defined", done: (selectedDataset?.classCount ?? 0) > 0, detail: `${selectedDataset?.classCount ?? 0} class(es)`, blocked: (selectedDataset?.classCount ?? 0) === 0 && imageCount > 0 },
            { label: "Annotations complete", done: workflow?.annotationComplete, detail: `${annotationCount} / ${imageCount} images annotated`, blocked: !workflow?.annotationComplete && annotationCount > 0 },
            { label: "Quality analyzed", done: workflow?.qualityComplete, detail: workflow?.qualityReportCount ? `${workflow.qualityReportCount} / ${imageCount} analyzed` : "Not started", blocked: !workflow?.qualityComplete && workflow?.hasQualityReports },
            { label: "Dataset split", done: workflow?.hasSplits, detail: workflow?.hasSplits ? "Created" : "Not created", blocked: !workflow?.hasSplits && workflow?.annotationComplete },
            { label: "Dataset versioned", done: workflow?.hasVersions, detail: workflow?.hasVersions ? "Created" : "Not created", blocked: !workflow?.hasVersions && workflow?.hasSplits },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-[#111827]">
              {item.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : item.blocked ? <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-[#2a3550] flex-shrink-0" />}
              <div className="min-w-0">
                <span className={`text-xs font-semibold ${item.done ? "text-emerald-400" : item.blocked ? "text-amber-400" : "text-[#64748b]"}`}>{item.label}</span>
                <p className="text-[10px] text-[#64748b] truncate">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        {workflow?.blockers && workflow.blockers.length > 0 && (
          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">
            {workflow.blockers.map((b, i) => <div key={i}>• {b}</div>)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Configuration */}
        <div className="glass-card-solid p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Configuration</h3>
          <div className="space-y-2">
            {[
              { label: "Image Size", key: "imageSize" }, { label: "Batch Size", key: "batchSize" }, { label: "Epochs", key: "epochs" },
              { label: "Learning Rate", key: "learningRate" }, { label: "Optimizer", key: "optimizer" }, { label: "Weight Decay", key: "weightDecay" },
              { label: "Random Seed", key: "randomSeed" },
            ].map(cfg => (
              <div key={cfg.key} className="flex items-center justify-between">
                <label className="text-xs text-[#94a3b8]">{cfg.label}</label>
                {cfg.key === "optimizer" ? (
                  <select className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none" value={config[cfg.key as keyof typeof config]} onChange={(e) => setConfig(p => ({ ...p, [cfg.key]: e.target.value }))}>
                    <option value="adam">Adam</option><option value="sgd">SGD</option><option value="rmsprop">RMSprop</option>
                  </select>
                ) : (
                  <input className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none" value={config[cfg.key as keyof typeof config]} onChange={(e) => setConfig(p => ({ ...p, [cfg.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> All weights initialized randomly — no pretrained weights
          </div>
        </div>

        {/* Architecture */}
        <div className="lg:col-span-2 glass-card-solid p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-violet-400" /> VisionBharatDetector Architecture</h3>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Layer</th><th>Output Shape</th><th className="text-right">Params</th></tr></thead>
              <tbody>
                {archLayers.map(layer => (
                  <tr key={layer.name}>
                    <td className="text-xs">{layer.name}</td>
                    <td className="text-xs font-mono text-[#94a3b8]">{layer.shape}</td>
                    <td className="text-xs font-mono text-right">{layer.params.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-blue-500/30">
                  <td className="text-xs font-bold">Total</td><td />
                  <td className="text-xs font-mono font-bold text-right text-blue-400">{archLayers.reduce((s, l) => s + l.params, 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold flex items-center gap-2 mt-4 mb-2"><Zap className="w-4 h-4 text-amber-400" /> Loss Function</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {lossComponents.map(lc => (
              <div key={lc.name} className="p-2 rounded-lg bg-[#111827]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{lc.name}</span>
                  <span className="text-[10px] font-mono badge-info px-1.5 py-0.5 rounded">lambda={lc.weight}</span>
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
          <div className="p-3 bg-[#111827] rounded text-center"><Cpu className="w-4 h-4 text-blue-400 mx-auto mb-1" /><p className="text-xs font-bold">CPU</p><p className="text-[10px] text-[#64748b]">Available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Monitor className={`w-4 h-4 mx-auto mb-1 ${healthData?.gpu === "available" ? "text-emerald-400" : "text-amber-400"}`} /><p className="text-xs font-bold">GPU</p><p className="text-[10px] text-[#64748b]">{healthData?.gpu === "available" ? "Available" : "Not Available"}</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" /><p className="text-xs font-bold">Est. Time</p><p className="text-[10px] text-[#64748b]">{healthData?.gpu === "available" ? "~20 min (GPU)" : "~2-3 hrs (CPU)"}</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Activity className="w-4 h-4 text-emerald-400 mx-auto mb-1" /><p className="text-xs font-bold">Speed</p><p className="text-[10px] text-[#64748b]">{healthData?.gpu === "available" ? "~50 img/sec" : "~10 img/sec"}</p></div>
        </div>
      </div>

      {hasTrainedModel && (
        <div className="glass-card-solid p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Brain className="w-4 h-4 text-blue-400" /> Trained Models</h3>
          <div className="space-y-2">
            {models.filter(m => m.checkpointPath).map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#111827]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{m.name}</p>
                  <p className="text-[10px] text-[#64748b] truncate">{m.modelId}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded badge-success">{m.status}</span>
              </div>
            ))}
          </div>
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

      <HelpCard title="How training works">
        <p className="mb-2">Training adjusts the model so it learns patterns from your annotated images.</p>
        <p className="mb-2"><strong>DataGenesis 2026 compliance:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>No pretrained weights used</li>
          <li>No transfer learning</li>
          <li>All weights initialized randomly</li>
          <li>Model trained exclusively on your team&apos;s dataset</li>
        </ul>
      </HelpCard>
    </div>
  );
}
