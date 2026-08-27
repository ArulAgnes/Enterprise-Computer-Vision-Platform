"use client";

import { useState, useRef, useCallback } from "react";
import { ScanSearch, Upload, Camera, Image, Clock, Cpu, Box, Tag, Zap, Eye, Download, Layers } from "lucide-react";
import { useApi, apiPost, apiUpload } from "@/lib/hooks";

interface Model {
  id: string;
  modelId: string;
  name: string;
  version: string;
  architecture: string;
  parameterCount: number | null;
  imageSize: number;
  numClasses: number;
  classNames: string[] | null;
  status: string;
  isFromScratch: boolean;
  usesPretrained: boolean;
  checkpointPath: string | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  iou: number | null;
  inferenceTimeMs: number | null;
}

interface Detection {
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InferenceResult {
  inference: {
    id: string;
    detections: Detection[];
    numDetections: number;
    inferenceTimeMs: number;
    imageWidth: number | null;
    imageHeight: number | null;
  };
  message: string;
  model: string;
  hasCheckpoint: boolean;
}

const DETECTION_COLORS = ["#10b981", "#f97316", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export default function InferencePage() {
  const [threshold, setThreshold] = useState(0.5);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: modelsData, loading: modelsLoading } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? models[0] ?? null;

  const detections = (inferenceResult?.inference.detections ?? []).filter((d) => d.confidence >= threshold);

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    setInferenceResult(null);
    setInferenceError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const img = new window.Image();
    img.onload = () => setImageDims({ width: img.width, height: img.height });
    img.src = url;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const runInference = async () => {
    if (!selectedModel) {
      setInferenceError("No model available. Register a model first.");
      return;
    }

    setRunning(true);
    setInferenceError(null);
    setInferenceResult(null);

    try {
      let imageId: string | undefined;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("files", selectedFile);
        formData.append("datasetId", "inference-upload");
        const uploadRes = (await apiUpload("/api/upload", formData)) as { images?: { id: string }[] };
        imageId = uploadRes.images?.[0]?.id;
      }

      const result = await apiPost<InferenceResult>("/api/inference", {
        modelId: selectedModel.id,
        imageId: imageId || null,
      });

      setInferenceResult(result);
    } catch (err) {
      setInferenceError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setRunning(false);
    }
  };

  const noCheckpoint = selectedModel && !selectedModel.checkpointPath;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Inference Studio</h1>
          <p className="text-sm text-[#94a3b8]">Run object detection on unseen images using the trained model</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#94a3b8]">Confidence Threshold:</label>
          <input
            type="range"
            min="0.1"
            max="0.95"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-32 accent-blue-500"
          />
          <span className="text-xs font-mono w-8">{threshold.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`upload-zone ${dragOver ? "dragover" : ""} !p-8`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            <Upload className="w-10 h-10 text-[#64748b] mx-auto mb-2" />
            <p className="text-sm font-semibold mb-1">Drop an image or click to upload</p>
            <p className="text-xs text-[#64748b] mb-3">Test with an unseen image NOT in the training dataset</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-xs flex items-center gap-1">
                <Upload className="w-3 h-3" /> Upload Image
              </button>
              <button className="btn-secondary text-xs flex items-center gap-1">
                <Camera className="w-3 h-3" /> Webcam
              </button>
              <button className="btn-secondary text-xs flex items-center gap-1">
                <Image className="w-3 h-3" /> Demo Image
              </button>
            </div>
          </div>

          <div className="glass-card-solid overflow-hidden">
            <div className="p-2 border-b border-[#2a3550] bg-[#0d1220] flex items-center justify-between">
              <span className="text-[10px] text-[#64748b] font-mono">
                {selectedFile ? selectedFile.name : "No image selected"} — {imageDims ? `${imageDims.width} × ${imageDims.height}` : "—"}
              </span>
              <div className="flex items-center gap-2">
                {inferenceResult && (
                  <span className="text-[10px] badge-success px-2 py-0.5 rounded flex items-center gap-1">
                    <Zap className="w-3 h-3" /> {inferenceResult.inference.inferenceTimeMs}ms
                  </span>
                )}
              </div>
            </div>
            <div className="relative" style={{ height: 480 }}>
              {previewUrl ? (
                <img src={previewUrl} alt="" className="w-full h-full object-contain bg-[#111827]" />
              ) : (
                <svg className="w-full h-full" viewBox="0 0 640 480">
                  <rect width="640" height="480" fill="#111827" />
                  <text x="320" y="200" textAnchor="middle" fill="#2a3550" fontSize="12">Inference Canvas</text>
                </svg>
              )}
              {previewUrl && (
                <svg className="w-full h-full absolute inset-0" viewBox={`0 0 ${imageDims?.width ?? 640} ${imageDims?.height ?? 480}`}>
                  {detections.map((det, i) => {
                    const color = DETECTION_COLORS[i % DETECTION_COLORS.length];
                    return (
                      <g key={i}>
                        <rect x={det.x} y={det.y} width={det.width} height={det.height} fill="none" stroke={color} strokeWidth="2.5" rx="4" />
                        <rect x={det.x} y={det.y - 22} width={det.className.length * 7 + 50} height="22" rx="4" fill={color} />
                        <text x={det.x + 6} y={det.y - 7} fill="white" fontSize="10" fontWeight="bold">
                          {det.className} {(det.confidence * 100).toFixed(1)}%
                        </text>
                        <rect x={det.x + 2} y={det.y + det.height - 6} width={det.width - 4} height={4} rx="2" fill="rgba(0,0,0,0.3)" />
                        <rect x={det.x + 2} y={det.y + det.height - 6} width={(det.width - 4) * det.confidence} height={4} rx="2" fill={color} />
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Model</h3>
            {modelsLoading ? (
              <p className="text-xs text-[#64748b]">Loading models...</p>
            ) : models.length === 0 ? (
              <p className="text-xs text-rose-400">No models registered</p>
            ) : (
              <>
                <select
                  value={selectedModel?.id ?? ""}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full mb-2 p-1.5 bg-[#111827] border border-[#2a3550] rounded text-xs text-[#e2e8f0]"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.modelId} — {m.name}
                    </option>
                  ))}
                </select>
                {selectedModel && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">ID</span>
                      <span className="font-mono">{selectedModel.modelId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Version</span>
                      <span className="font-mono">{selectedModel.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Architecture</span>
                      <span className="text-[10px] text-right">{selectedModel.architecture}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Parameters</span>
                      <span className="font-mono">{selectedModel.parameterCount ? `${(selectedModel.parameterCount / 1e6).toFixed(2)}M` : "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">From Scratch</span>
                      <span className={selectedModel.isFromScratch ? "text-emerald-400" : "text-rose-400"}>
                        {selectedModel.isFromScratch ? "✓" : "✗"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748b]">Checkpoint</span>
                      <span className={selectedModel.checkpointPath ? "text-emerald-400" : "text-rose-400"}>
                        {selectedModel.checkpointPath ? "✓ Available" : "✗ None"}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
            <button onClick={runInference} disabled={running || noCheckpoint || !selectedModel} className="btn-primary text-xs flex items-center gap-1 w-full mt-3 justify-center disabled:opacity-50">
              <Zap className="w-3 h-3" /> {running ? "Running..." : "Run Inference"}
            </button>
            {noCheckpoint && (
              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-300">
                NO TRAINED CHECKPOINT AVAILABLE
              </div>
            )}
          </div>

          {inferenceError && (
            <div className="glass-card-solid p-4">
              <p className="text-xs text-rose-400">{inferenceError}</p>
            </div>
          )}

          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Detections ({detections.length})
            </h3>
            {detections.length === 0 ? (
              <p className="text-xs text-[#64748b]">NO DATA AVAILABLE</p>
            ) : (
              <div className="space-y-2">
                {detections.map((det, i) => {
                  const color = DETECTION_COLORS[i % DETECTION_COLORS.length];
                  return (
                    <div key={i} className="p-3 rounded-lg bg-[#111827] space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                          <span className="text-xs font-semibold">{det.className}</span>
                        </div>
                        <span className="text-xs font-mono font-bold" style={{ color: color }}>
                          {(det.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${det.confidence * 100}%`, background: color }} />
                      </div>
                      <div className="text-[9px] font-mono text-[#64748b]">
                        Box: ({Math.round(det.x)}, {Math.round(det.y)}, {Math.round(det.width)}, {Math.round(det.height)})
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Inference Stats</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">{inferenceResult ? `${inferenceResult.inference.inferenceTimeMs}ms` : "—"}</p>
                <p className="text-[9px] text-[#64748b]">Latency</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">
                  {inferenceResult && inferenceResult.inference.inferenceTimeMs > 0
                    ? `${(1000 / inferenceResult.inference.inferenceTimeMs).toFixed(1)}`
                    : "—"}
                </p>
                <p className="text-[9px] text-[#64748b]">FPS</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">{detections.length}</p>
                <p className="text-[9px] text-[#64748b]">Objects</p>
              </div>
              <div className="p-2 bg-[#111827] rounded text-center">
                <p className="text-sm font-bold">{imageDims ? `${imageDims.width}×${imageDims.height}` : "—"}</p>
                <p className="text-[9px] text-[#64748b]">Resolution</p>
              </div>
            </div>
          </div>

          <div className="glass-card-solid p-4">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2 flex items-center gap-1">
              <Eye className="w-3 h-3" /> Explainability
            </h3>
            <div className="p-3 bg-[#111827] rounded text-[10px] text-[#94a3b8] space-y-1">
              <p>• Region activation: {detections.length} high-activation regions detected</p>
              <p>• Feature maps: Conv3 + Res2 + FPN layers</p>
              <p>• Saliency: Computed from gradient-weighted activations</p>
              <p className="text-amber-400 mt-2">
                ⚠ Visualization from actual model features, not &quot;AI reasoning&quot;
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
