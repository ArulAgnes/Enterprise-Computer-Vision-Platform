"use client";

import { useState } from "react";
import { Brain, Play, Square, Settings, Cpu, Clock, Activity, TrendingUp, Layers, Zap, CheckCircle2, AlertTriangle, Monitor, Database, AlertCircle, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { useApi, apiPost } from "@/lib/hooks";

interface Dataset {
  id: string;
  name: string;
  datasetId: string;
}

interface TrainingExperiment {
  id: string;
  experimentId: string;
  name: string;
  description?: string;
  datasetId: string;
  datasetVersion?: string;
  imageSize: number;
  batchSize: number;
  epochs: number;
  learningRate: number;
  optimizer: string;
  weightDecay: number;
  iouThreshold: number;
  confidenceThreshold: number;
  randomSeed: number;
  status: string;
  currentEpoch: number;
  trainLoss?: number;
  valLoss?: number;
  boxLoss?: number;
  objectnessLoss?: number;
  classLoss?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  iou?: number;
  trainingDuration?: number;
  hardware?: string;
  createdAt?: string;
}

interface TrainingMetrics {
  epoch: number;
  trainLoss?: number;
  valLoss?: number;
  boxLoss?: number;
  objectnessLoss?: number;
  classLoss?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  iou?: number;
  learningRate?: number;
}

interface TrainingResponse {
  experiment?: TrainingExperiment;
  metrics?: TrainingMetrics[];
  experiments?: TrainingExperiment[];
  total?: number;
}

const archLayers = [
  { name: "Input", shape: "640×640×3", params: 0 },
  { name: "Stem Conv 3→32", shape: "320×320×32", params: 864 },
  { name: "Conv Block 32→64", shape: "160×160×64", params: 18496 },
  { name: "Res Block 64→64", shape: "160×160×64", params: 36928 },
  { name: "Conv Block 64→128", shape: "80×80×128", params: 73856 },
  { name: "Res Block 128→128", shape: "80×80×128", params: 147584 },
  { name: "Conv Block 128→256", shape: "40×40×256", params: 295168 },
  { name: "Res Block 256→256", shape: "40×40×256", params: 590080 },
  { name: "Multi-scale Feature Fusion", shape: "40×40×384", params: 295168 },
  { name: "Detection Head", shape: "40×40×(5+8)", params: 26624 },
  { name: "Output", shape: "N×(5+8)", params: 0 },
];

const lossComponents = [
  { name: "Box Loss", weight: 5.0, desc: "GIoU-based bounding box regression" },
  { name: "Objectness Loss", weight: 1.0, desc: "Binary cross-entropy for object presence" },
  { name: "Classification Loss", weight: 1.0, desc: "Cross-entropy for class prediction" },
];

function NoDataCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
      <Database className="w-8 h-8 mb-2 opacity-50" />
      <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-[10px] mt-1">NO DATA AVAILABLE</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-rose-400">
      <AlertCircle className="w-6 h-6 mb-2" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

export default function TrainingPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const { data: datasets, loading: datasetsLoading } = useApi<Dataset[]>("/api/datasets");
  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const effectiveDatasetId = selectedDatasetId || datasetsArray[0]?.id || null;

  const { data: trainingData, loading: trainingLoading, error: trainingError, refetch: refetchTraining } = useApi<TrainingResponse>("/api/training");

  const experiments = trainingData?.experiments || [];
  const activeExperiment = experiments.find(e => e.status === "training" || e.status === "running");
  const currentExperiment = selectedExperimentId
    ? experiments.find(e => e.id === selectedExperimentId) || activeExperiment
    : activeExperiment;

  const { data: metricsData, loading: metricsLoading, error: metricsError } = useApi<{ experiment: TrainingExperiment; metrics: TrainingMetrics[] }>(
    currentExperiment ? `/api/training?experimentId=${currentExperiment.id}` : null
  );

  const metrics = metricsData?.metrics || [];
  const isTraining = currentExperiment?.status === "training" || currentExperiment?.status === "running";
  const lastMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  const [config, setConfig] = useState({
    imageSize: "640",
    batchSize: "16",
    epochs: "100",
    learningRate: "0.001",
    optimizer: "adam",
    weightDecay: "0.0005",
    iouThreshold: "0.5",
    confidenceThreshold: "0.5",
    randomSeed: "42",
  });

  const handleStartTraining = async () => {
    if (!effectiveDatasetId) return;
    setStarting(true);
    try {
      const result = await apiPost<{ data: TrainingExperiment }>("/api/training", {
        datasetId: effectiveDatasetId,
        name: `Training ${Date.now()}`,
        epochs: parseInt(config.epochs),
        batchSize: parseInt(config.batchSize),
        learningRate: parseFloat(config.learningRate),
        optimizer: config.optimizer,
        weightDecay: parseFloat(config.weightDecay),
        imageSize: parseInt(config.imageSize),
        confidenceThreshold: parseFloat(config.confidenceThreshold),
        iouThreshold: parseFloat(config.iouThreshold),
        seed: parseInt(config.randomSeed),
      });
      if (result?.data?.id) {
        setSelectedExperimentId(result.data.id);
      }
      await refetchTraining();
    } catch (err) {
      console.error("Failed to start training:", err);
    } finally {
      setStarting(false);
    }
  };

  const handleStopTraining = async () => {
    if (!currentExperiment) return;
    setStopping(true);
    try {
      await apiPost("/api/training", { experimentId: currentExperiment.id, action: "stop" });
      await refetchTraining();
    } catch (err) {
      console.error("Failed to stop training:", err);
    } finally {
      setStopping(false);
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Training Lab</h1>
          <p className="text-sm text-[#94a3b8]">Configure, launch, and monitor model training from scratch</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-[#111827] border border-[#2a3550] rounded px-3 py-1.5 text-xs text-[#94a3b8]"
            value={effectiveDatasetId || ""}
            onChange={(e) => setSelectedDatasetId(e.target.value || null)}
          >
            <option value="">Select dataset</option>
            {datasetsArray.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {!isTraining ? (
            <button
              className="btn-primary text-xs flex items-center gap-1"
              onClick={handleStartTraining}
              disabled={!effectiveDatasetId || starting}
            >
              {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {starting ? "Starting..." : "Start Training"}
            </button>
          ) : (
            <button
              className="btn-danger text-xs flex items-center gap-1"
              onClick={handleStopTraining}
              disabled={stopping}
            >
              {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              {stopping ? "Stopping..." : "Stop Training"}
            </button>
          )}
        </div>
      </div>

      {/* Training Status */}
      {isTraining && currentExperiment && (
        <div className="glass-card p-4 flex items-center gap-4 animate-pulse-glow">
          <Activity className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-400">
              Training in Progress — Epoch {currentExperiment.currentEpoch}/{currentExperiment.epochs}
            </p>
            <div className="progress-bar mt-2"><div className="progress-fill" style={{ width: `${(currentExperiment.currentEpoch / currentExperiment.epochs) * 100}%` }} /></div>
          </div>
          <span className="text-[10px] font-mono text-[#64748b]">
            {currentExperiment.trainingDuration ? `Duration: ${Math.round(currentExperiment.trainingDuration / 60)} min` : "ETA: calculating..."}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="glass-card-solid p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Training Configuration</h3>
          <div className="space-y-2">
            {[
              { label: "Image Size", key: "imageSize", type: "number" },
              { label: "Batch Size", key: "batchSize", type: "number" },
              { label: "Epochs", key: "epochs", type: "number" },
              { label: "Learning Rate", key: "learningRate", type: "text" },
              { label: "Optimizer", key: "optimizer", type: "select" },
              { label: "Weight Decay", key: "weightDecay", type: "text" },
              { label: "IoU Threshold", key: "iouThreshold", type: "text" },
              { label: "Conf Threshold", key: "confidenceThreshold", type: "text" },
              { label: "Random Seed", key: "randomSeed", type: "number" },
            ].map(cfg => (
              <div key={cfg.label} className="flex items-center justify-between">
                <label className="text-xs text-[#94a3b8]">{cfg.label}</label>
                {cfg.type === "select" ? (
                  <select
                    className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none"
                    value={config[cfg.key as keyof typeof config]}
                    onChange={(e) => handleConfigChange(cfg.key, e.target.value)}
                  >
                    <option value="adam">Adam</option>
                    <option value="sgd">SGD</option>
                    <option value="rmsprop">RMSprop</option>
                  </select>
                ) : (
                  <input
                    className="w-24 bg-[#111827] border border-[#2a3550] rounded px-2 py-1 text-xs text-right font-mono focus:border-blue-500 outline-none"
                    type={cfg.type}
                    value={config[cfg.key as keyof typeof config]}
                    onChange={(e) => handleConfigChange(cfg.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> All weights initialized randomly — No pretrained weights
          </div>
          <button className="btn-secondary text-xs w-full">Load Recommended Config</button>
        </div>

        {/* Live Metrics */}
        <div className="lg:col-span-2 space-y-4">
          {/* Current Metrics */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Train Loss", value: lastMetric?.trainLoss?.toFixed(3) || "N/A", color: "text-blue-400" },
              { label: "Val Loss", value: lastMetric?.valLoss?.toFixed(3) || "N/A", color: "text-amber-400" },
              { label: "Precision", value: lastMetric?.precision?.toFixed(3) || "N/A", color: "text-cyan-400" },
              { label: "Recall", value: lastMetric?.recall?.toFixed(3) || "N/A", color: "text-emerald-400" },
              { label: "F1", value: lastMetric?.f1?.toFixed(3) || "N/A", color: "text-violet-400" },
              { label: "IoU", value: lastMetric?.iou?.toFixed(3) || "N/A", color: "text-pink-400" },
              { label: "Box Loss", value: lastMetric?.boxLoss?.toFixed(3) || "N/A", color: "text-orange-400" },
              { label: "LR", value: lastMetric?.learningRate?.toExponential(2) || "N/A", color: "text-teal-400" },
            ].map(m => (
              <div key={m.label} className="metric-card text-center">
                <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-[#64748b]">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Loss Curves */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Training & Validation Loss</h3>
            <div style={{ height: 200 }}>
              {metrics.length === 0 ? (
                <NoDataCard label="NOT TRAINING" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                    <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="trainLoss" stroke="#3b82f6" strokeWidth={2} dot={false} name="Train Loss" />
                    <Line type="monotone" dataKey="valLoss" stroke="#f59e0b" strokeWidth={2} dot={false} name="Val Loss" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Precision/Recall/IoU */}
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Precision / Recall / F1 / IoU</h3>
            <div style={{ height: 200 }}>
              {metrics.length === 0 ? (
                <NoDataCard label="NOT TRAINING" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                    <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                    <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="precision" stroke="#06b6d4" strokeWidth={2} dot={false} name="Precision" />
                    <Line type="monotone" dataKey="recall" stroke="#10b981" strokeWidth={2} dot={false} name="Recall" />
                    <Line type="monotone" dataKey="f1" stroke="#8b5cf6" strokeWidth={2} dot={false} name="F1" />
                    <Line type="monotone" dataKey="iou" stroke="#f97316" strokeWidth={2} dot={false} name="IoU" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Architecture */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-violet-400" /> Custom CNN Architecture</h3>
          <table className="data-table">
            <thead><tr><th>Layer</th><th>Output Shape</th><th>Params</th></tr></thead>
            <tbody>
              {archLayers.map(layer => (
                <tr key={layer.name}>
                  <td className="text-xs">{layer.name}</td>
                  <td className="text-xs font-mono text-[#94a3b8]">{layer.shape}</td>
                  <td className="text-xs font-mono text-right">{layer.params.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-blue-500/30">
                <td className="text-xs font-bold">Total</td>
                <td />
                <td className="text-xs font-mono font-bold text-right text-blue-400">{archLayers.reduce((s, l) => s + l.params, 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Loss Function */}
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-amber-400" /> Loss Function</h3>
          <div className="p-3 bg-[#111827] rounded-lg font-mono text-xs text-[#94a3b8] mb-4">
            L_total = λ_box · L_box + λ_obj · L_obj + λ_cls · L_cls<br />
            L_box = 1 - GIoU (Generalized IoU)<br />
            L_obj = BCE(p_obj, t_obj)<br />
            L_cls = CE(p_cls, t_cls)
          </div>
          <div className="space-y-3">
            {lossComponents.map(lc => (
              <div key={lc.name} className="p-3 rounded-lg bg-[#111827]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{lc.name}</span>
                  <span className="text-[10px] font-mono badge-info px-2 py-0.5 rounded">λ = {lc.weight}</span>
                </div>
                <p className="text-[10px] text-[#64748b]">{lc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hardware */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Monitor className="w-4 h-4 text-emerald-400" /> Hardware</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-[#111827] rounded text-center"><Cpu className="w-4 h-4 text-blue-400 mx-auto mb-1" /><p className="text-xs font-bold">CPU</p><p className="text-[10px] text-[#64748b]">Available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Monitor className="w-4 h-4 text-amber-400 mx-auto mb-1" /><p className="text-xs font-bold">GPU</p><p className="text-[10px] text-[#64748b]">Not Available</p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" /><p className="text-xs font-bold">Duration</p><p className="text-[10px] text-[#64748b]">
            {currentExperiment?.trainingDuration ? `${Math.round(currentExperiment.trainingDuration / 60)} min` : "~2.5 hrs (est)"}
          </p></div>
          <div className="p-3 bg-[#111827] rounded text-center"><Activity className="w-4 h-4 text-emerald-400 mx-auto mb-1" /><p className="text-xs font-bold">Speed</p><p className="text-[10px] text-[#64748b]">
            {metrics.length > 0 ? `Epoch ${metrics.length}/${currentExperiment?.epochs || "?"}` : "~12 img/sec"}
          </p></div>
        </div>
      </div>
    </div>
  );
}
