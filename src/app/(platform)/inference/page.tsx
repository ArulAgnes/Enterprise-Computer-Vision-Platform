"use client";

import { useState, useRef, useCallback } from "react";
import { ScanSearch, Upload, Image, Clock, Cpu, Zap, Eye, Brain, ArrowRight, AlertTriangle, X } from "lucide-react";
import { useApi, apiPost, apiUpload } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { NextStepCard, HelpCard, PageHeader } from "@/components/workflow";
import Link from "next/link";

interface Model {
  id: string;
  modelId: string;
  name: string;
  checkpointPath: string | null;
  parameterCount: number | null;
  architecture: string;
  isFromScratch: boolean;
}

interface Detection {
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLORS = ["#10b981", "#f97316", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export default function InferencePage() {
  const [threshold, setThreshold] = useState(0.5);
  const { state: workflow } = useWorkflowState();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [inferenceResult, setInferenceResult] = useState<{
    detections: Detection[];
    numDetections: number;
    inferenceTimeMs: number;
  } | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: modelsData, loading: modelsLoading } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const selectedModel = models.find(m => m.checkpointPath) ?? models[0] ?? null;
  const hasCheckpoint = !!selectedModel?.checkpointPath;

  const detections = (inferenceResult?.detections ?? []).filter(d => d.confidence >= threshold);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }, [handleFile]);

  const runInference = async () => {
    if (!selectedModel || !selectedFile) return;
    setRunning(true);
    setInferenceError(null);
    setInferenceResult(null);
    try {
      const formData = new FormData();
      formData.append("files", selectedFile);
      formData.append("datasetId", "inference-upload");
      const uploadRes = (await apiUpload("/api/upload", formData)) as { images?: { id: string }[] };
      const imageId = uploadRes.images?.[0]?.id;

      const result = await apiPost<{
        inference?: { detections: Detection[]; numDetections: number; inferenceTimeMs: number };
        error?: string;
        success: boolean;
      }>("/api/infer", { modelId: selectedModel.id, imageId: imageId || null, confidenceThreshold: threshold });

      if (result?.inference) {
        setInferenceResult(result.inference);
      } else {
        setInferenceError(result?.error || "Inference failed");
      }
    } catch (err) {
      setInferenceError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <PageHeader title="Inference Studio" subtitle="Test your trained model on new images" step={11} totalSteps={15} />

      {/* No model state */}
      {!modelsLoading && models.length === 0 && (
        <div className="glass-card-solid p-6 text-center">
          <Brain className="w-12 h-12 text-[#64748b] mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold mb-1">No Model Available</h3>
          <p className="text-xs text-[#64748b] mb-4 max-w-sm mx-auto">Train a model before running inference.</p>
          <Link href="/training" className="btn-primary text-xs inline-flex items-center gap-1">Go to Training <ArrowRight className="w-3 h-3" /></Link>
        </div>
      )}

      {/* No checkpoint state */}
      {!modelsLoading && models.length > 0 && !hasCheckpoint && (
        <div className="glass-card-solid p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold mb-1">No Trained Checkpoint</h3>
          <p className="text-xs text-[#64748b] mb-4 max-w-sm mx-auto">Complete training to generate a model checkpoint for inference.</p>
          <Link href="/training" className="btn-primary text-xs inline-flex items-center gap-1">Go to Training <ArrowRight className="w-3 h-3" /></Link>
        </div>
      )}

      {/* Inference workspace — only show if model with checkpoint exists */}
      {hasCheckpoint && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Upload zone */}
            <div
              className={`upload-zone ${dragOver ? "dragover" : ""} !p-6`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <Upload className="w-8 h-8 text-[#64748b] mx-auto mb-2" />
              <p className="text-sm font-semibold mb-1">Drop an image or click to upload</p>
              <p className="text-xs text-[#64748b] mb-3">Test with an unseen image</p>
              <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-xs">Upload Image</button>
            </div>

            {/* Image canvas with detections */}
            <div className="glass-card-solid overflow-hidden">
              <div className="p-2 border-b border-[#2a3550] bg-[#0d1220] flex items-center justify-between">
                <span className="text-[10px] text-[#64748b] font-mono truncate">
                  {selectedFile ? selectedFile.name : "No image selected"} {imageDims ? `— ${imageDims.width}x${imageDims.height}` : ""}
                </span>
                {inferenceResult && (
                  <span className="text-[10px] badge-success px-2 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                    <Zap className="w-3 h-3" /> {inferenceResult.inferenceTimeMs}ms
                  </span>
                )}
              </div>
              <div className="relative bg-[#111827]" style={{ minHeight: 400 }}>
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="" className="w-full h-full object-contain" style={{ maxHeight: 500 }} />
                    <svg className="w-full h-full absolute inset-0" viewBox={`0 0 ${imageDims?.width ?? 640} ${imageDims?.height ?? 480}`} style={{ pointerEvents: "none" }}>
                      {detections.map((det, i) => {
                        const color = COLORS[i % COLORS.length];
                        return (
                          <g key={i}>
                            <rect x={det.x} y={det.y} width={det.width} height={det.height} fill="none" stroke={color} strokeWidth="2.5" rx="4" />
                            <rect x={det.x} y={det.y - 20} width={det.className.length * 7 + 50} height="20" rx="4" fill={color} />
                            <text x={det.x + 6} y={det.y - 6} fill="white" fontSize="10" fontWeight="bold">
                              {det.className} {(det.confidence * 100).toFixed(1)}%
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-[#64748b]">
                    <div className="text-center">
                      <Image className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Upload an image to run inference</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Model info */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Model</h3>
              {selectedModel && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-[#64748b]">Name</span><span className="font-medium">{selectedModel.name}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748b]">Architecture</span><span className="text-right text-[10px]">{selectedModel.architecture}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748b]">Parameters</span><span className="font-mono">{selectedModel.parameterCount ? `${(selectedModel.parameterCount / 1e6).toFixed(2)}M` : "N/A"}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748b]">From Scratch</span><span className={selectedModel.isFromScratch ? "text-emerald-400" : "text-rose-400"}>{selectedModel.isFromScratch ? "Yes" : "No"}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748b]">Checkpoint</span><span className="text-emerald-400">Available</span></div>
                </div>
              )}
              <button onClick={runInference} disabled={running || !selectedFile} className="btn-primary text-xs flex items-center gap-1 w-full mt-3 justify-center disabled:opacity-50">
                <Zap className="w-3 h-3" /> {running ? "Running..." : "Run Inference"}
              </button>
            </div>

            {/* Confidence threshold */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Confidence Threshold</h3>
              <div className="flex items-center gap-3">
                <input type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                <span className="text-xs font-mono w-10 text-right">{threshold.toFixed(2)}</span>
              </div>
            </div>

            {/* Error */}
            {inferenceError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <X className="w-4 h-4 flex-shrink-0" /> {inferenceError}
              </div>
            )}

            {/* Detections */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
                Detections ({detections.length})
              </h3>
              {detections.length === 0 ? (
                <p className="text-xs text-[#64748b] py-4 text-center">No detections{inferenceResult ? " above threshold" : " yet"}</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detections.map((det, i) => {
                    const color = COLORS[i % COLORS.length];
                    return (
                      <div key={i} className="p-2 rounded-lg bg-[#111827] space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                            <span className="text-xs font-semibold">{det.className}</span>
                          </div>
                          <span className="text-xs font-mono font-bold" style={{ color }}>{(det.confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${det.confidence * 100}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="glass-card-solid p-4">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-[#111827] rounded text-center">
                  <p className="text-sm font-bold">{inferenceResult ? `${inferenceResult.inferenceTimeMs}ms` : "—"}</p>
                  <p className="text-[9px] text-[#64748b]">Latency</p>
                </div>
                <div className="p-2 bg-[#111827] rounded text-center">
                  <p className="text-sm font-bold">{inferenceResult && inferenceResult.inferenceTimeMs > 0 ? `${(1000 / inferenceResult.inferenceTimeMs).toFixed(1)}` : "—"}</p>
                  <p className="text-[9px] text-[#64748b]">FPS</p>
                </div>
                <div className="p-2 bg-[#111827] rounded text-center">
                  <p className="text-sm font-bold">{detections.length}</p>
                  <p className="text-[9px] text-[#64748b]">Objects</p>
                </div>
                <div className="p-2 bg-[#111827] rounded text-center">
                  <p className="text-sm font-bold">{imageDims ? `${imageDims.width}x${imageDims.height}` : "—"}</p>
                  <p className="text-[9px] text-[#64748b]">Resolution</p>
                </div>
              </div>
            </div>
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

      <HelpCard title="What is inference?">
        <p className="mb-2">Inference is when you use your trained model to detect objects in new images.</p>
        <p>Upload an image and the model will draw bounding boxes around detected objects with confidence scores.</p>
      </HelpCard>
    </div>
  );
}
