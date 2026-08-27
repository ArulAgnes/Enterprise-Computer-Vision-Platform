"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera, Upload, Image, CheckCircle2, AlertTriangle, XCircle, Loader2,
  X, Database, ArrowRight, Video, VideoOff, SwitchCamera
} from "lucide-react";
import { useApi, apiUpload, apiDelete } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { NextStepCard, HelpCard, EmptyState, PageHeader, InfoBar } from "@/components/workflow";

interface ImageRecord {
  id: string;
  datasetId: string;
  filename: string;
  originalFilename?: string;
  filepath?: string;
  resolution?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  imageHash?: string;
  annotationStatus?: string;
  qualityStatus?: string;
  splitType?: string;
  createdAt?: string;
}

interface UploadResult {
  uploaded: number;
  errors: number;
  images: ImageRecord[];
  errorDetails: Array<{ filename: string; error: string }>;
}

interface PendingFile {
  file: File;
  preview: string;
  uploading: boolean;
  progress: number;
  error?: string;
  done?: boolean;
}

type CameraState = "idle" | "requesting" | "active" | "captured" | "error";

export default function CapturePage() {
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string>("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Dataset selection
  const { data: datasets } = useApi<Array<{ id: string; name: string; datasetId: string }>>("/api/datasets");
  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const imagesUrl = selectedDatasetId ? `/api/images?datasetId=${selectedDatasetId}&limit=200` : null;
  const { data: imagesData, loading: imagesLoading, refetch } = useApi<{ success: boolean; data: ImageRecord[] }>(imagesUrl);

  const images: ImageRecord[] = imagesData?.data ?? [];
  const totalSize = images.reduce((sum, img) => sum + (img.fileSize ?? 0), 0);
  const annotatedCount = images.filter(i => i.annotationStatus === "annotated").length;
  const unannotatedCount = images.length - annotatedCount;

  const { state: workflow, refetch: refetchWorkflow } = useWorkflowState();

  // Auto-select first dataset
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && datasetsArray.length > 0 && !selectedDatasetId) {
      initRef.current = true;
      setSelectedDatasetId(datasetsArray[0].id);
    }
  }, [datasetsArray, selectedDatasetId]);

  // Camera functions
  const startCamera = useCallback(async () => {
    setCameraState("requesting");
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch (err) {
      setCameraState("error");
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setCameraError("Camera access was blocked by your browser. Allow camera permission in your browser settings and try again.");
        } else if (err.name === "NotFoundError") {
          setCameraError("No camera found on this device.");
        } else if (err.name === "NotReadableError") {
          setCameraError("Camera is already in use by another application.");
        } else {
          setCameraError(`Camera error: ${err.message}`);
        }
      } else {
        setCameraError("Failed to access camera. Please check your device settings.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState("idle");
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    canvas.toBlob((blob) => {
      setCapturedBlob(blob);
    }, "image/jpeg", 0.92);
    setCameraState("captured");
    stopCamera();
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  }, [startCamera]);

  const usePhoto = useCallback(async () => {
    if (!capturedBlob || !selectedDatasetId) return;
    const formData = new FormData();
    formData.append("datasetId", selectedDatasetId);
    const file = new File([capturedBlob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    formData.append("files", file);

    try {
      await apiUpload("/api/upload", formData);
      setCapturedImage(null);
      setCapturedBlob(null);
      setCameraState("idle");
      refetch();
      refetchWorkflow();
    } catch (err) {
      setCameraError("Failed to upload captured photo. Please try again.");
      console.error("Upload failed:", err);
    }
  }, [capturedBlob, selectedDatasetId, refetch, refetchWorkflow]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // File upload functions
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const newPending: PendingFile[] = arr.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: false,
      progress: 0,
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const uploadAll = useCallback(async () => {
    if (!selectedDatasetId) return;
    const toUpload = pendingFiles.filter(p => !p.uploading && !p.done && !p.error);
    if (toUpload.length === 0) return;

    const formData = new FormData();
    formData.append("datasetId", selectedDatasetId);
    toUpload.forEach(p => formData.append("files", p.file));

    setPendingFiles(prev =>
      prev.map(p => (toUpload.includes(p) ? { ...p, uploading: true, progress: 50 } : p))
    );

    try {
      const raw = await apiUpload("/api/upload", formData);
      const result = raw as UploadResult;
      setPendingFiles(prev =>
        prev.map(p => {
          if (toUpload.includes(p)) {
            const wasUploaded = result.images?.some(img => img.originalFilename === p.file.name) ?? false;
            return { ...p, uploading: false, progress: 100, done: wasUploaded, error: wasUploaded ? undefined : "Upload failed" };
          }
          return p;
        })
      );
      refetch();
      refetchWorkflow();
    } catch (err) {
      setPendingFiles(prev =>
        prev.map(p => (toUpload.includes(p) ? { ...p, uploading: false, error: String(err) } : p))
      );
    }
  }, [selectedDatasetId, pendingFiles, refetch, refetchWorkflow]);

  const removePending = useCallback((index: number) => {
    setPendingFiles(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setPendingFiles(prev => prev.filter(p => !p.done));
  }, []);

  useEffect(() => {
    return () => {
      pendingFiles.forEach(p => URL.revokeObjectURL(p.preview));
    };
  }, [pendingFiles]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isUploading = pendingFiles.some(p => p.uploading);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capture & Upload"
        subtitle="Collect images with your camera or upload existing team photos"
        step={1}
        totalSteps={15}
      />

      {/* Workflow Next Step */}
      {workflow && <NextStepCard currentStep={workflow.currentStep} completedSteps={workflow.completedSteps} />}

      {/* Help */}
      <HelpCard title="How image collection works">
        <p className="mb-2">This is <strong>Step 1</strong> of building your dataset. You need real photographs captured by your team — no internet images allowed.</p>
        <p className="mb-2"><strong>Two ways to add images:</strong></p>
        <ul className="list-disc list-inside space-y-1 mb-2">
          <li><strong>Camera:</strong> Use your device camera to photograph objects directly</li>
          <li><strong>Upload:</strong> Select existing photos from your device</li>
        </ul>
        <p>All images enter the same pipeline and are stored in your dataset. Supported formats: JPG, JPEG, PNG, WebP.</p>
      </HelpCard>

      {/* Dataset Selection */}
      <div className="glass-card-solid p-4">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-[#94a3b8]">Dataset:</span>
          <select
            className="bg-[#111827] border border-[#2a3550] rounded px-3 py-1.5 text-xs text-[#94a3b8] flex-1"
            value={selectedDatasetId}
            onChange={e => setSelectedDatasetId(e.target.value)}
          >
            <option value="">Select a dataset</option>
            {datasetsArray.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {!selectedDatasetId && datasetsArray.length > 0 && (
            <InfoBar type="warning">Select a dataset before uploading</InfoBar>
          )}
        </div>
      </div>

      {/* Camera Section */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-400" /> Camera Capture
        </h3>

        {cameraState === "idle" && (
          <div className="text-center py-8">
            <Camera className="w-12 h-12 text-[#64748b] mx-auto mb-3" />
            <p className="text-sm text-[#94a3b8] mb-4">Take photos directly with your device camera</p>
            <button
              className="btn-primary text-sm flex items-center gap-2 mx-auto"
              onClick={startCamera}
              disabled={!selectedDatasetId}
            >
              <Video className="w-4 h-4" />
              Open Camera
            </button>
            {!selectedDatasetId && (
              <p className="text-[10px] text-amber-400 mt-2">Select a dataset first</p>
            )}
          </div>
        )}

        {cameraState === "requesting" && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-[#94a3b8]">Requesting camera access...</p>
            <p className="text-[10px] text-[#64748b] mt-1">Please allow camera permission in your browser</p>
          </div>
        )}

        {cameraState === "error" && (
          <div className="text-center py-8">
            <VideoOff className="w-12 h-12 text-rose-400 mx-auto mb-3" />
            <p className="text-sm text-rose-400 mb-2">Camera unavailable</p>
            <p className="text-xs text-[#94a3b8] mb-4 max-w-md mx-auto">{cameraError}</p>
            <div className="flex gap-2 justify-center">
              <button className="btn-primary text-xs flex items-center gap-1" onClick={startCamera}>
                <Video className="w-3 h-3" /> Try Again
              </button>
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3 h-3" /> Upload Instead
              </button>
            </div>
          </div>
        )}

        {cameraState === "active" && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black" style={{ maxHeight: 400 }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full object-contain"
                style={{ maxHeight: 400 }}
              />
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <button
                  className="w-16 h-16 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                  onClick={takePhoto}
                >
                  <div className="w-12 h-12 rounded-full border-4 border-gray-800" />
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={stopCamera}>
                <VideoOff className="w-3 h-3" /> Close Camera
              </button>
            </div>
          </div>
        )}

        {cameraState === "captured" && capturedImage && (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden">
              <img src={capturedImage} alt="Captured" className="w-full object-contain" style={{ maxHeight: 400 }} />
            </div>
            <div className="flex justify-center gap-3">
              <button className="btn-secondary text-sm flex items-center gap-1" onClick={retakePhoto}>
                <X className="w-4 h-4" /> Retake
              </button>
              <button className="btn-primary text-sm flex items-center gap-1" onClick={usePhoto}>
                <CheckCircle2 className="w-4 h-4" /> Use This Photo
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Upload Section */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-400" /> Upload Photos
        </h3>
        <div
          className={`upload-zone ${dragOver ? "dragover" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
          />
          <Upload className="w-10 h-10 text-[#64748b] mx-auto mb-2" />
          <h4 className="text-sm font-semibold mb-1">Drag & Drop Images</h4>
          <p className="text-xs text-[#64748b] mb-2">JPG, JPEG, PNG, WebP — Batch upload supported</p>
          <button className="btn-primary text-xs" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            Browse Files
          </button>
          <p className="text-[10px] text-[#64748b] mt-3">All images must be originally captured by the team. No external/scraped images.</p>
        </div>
      </div>

      {/* Pending Uploads */}
      {pendingFiles.length > 0 && (
        <div className="glass-card-solid p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">Queued Files ({pendingFiles.length})</h3>
            <div className="flex gap-2">
              <button className="btn-primary text-[10px] px-3 py-1 flex items-center gap-1" onClick={uploadAll} disabled={isUploading || !selectedDatasetId}>
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {isUploading ? "Uploading..." : "Upload All"}
              </button>
              <button className="btn-secondary text-[10px] px-3 py-1" onClick={clearCompleted}>Clear Done</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-auto">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="relative rounded-lg overflow-hidden bg-[#111827] border border-[#2a3550]">
                <div className="aspect-square relative">
                  <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
                  {pf.done && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div>}
                  {pf.error && <div className="absolute inset-0 bg-rose-500/20 flex items-center justify-center"><XCircle className="w-8 h-8 text-rose-400" /></div>}
                  {pf.uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}
                  <button className="absolute top-1 right-1 p-0.5 rounded bg-black/60 hover:bg-black/80" onClick={() => removePending(idx)}>
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="p-1.5">
                  <p className="text-[9px] font-mono truncate text-[#94a3b8]">{pf.file.name}</p>
                  <p className="text-[8px] text-[#64748b]">{formatSize(pf.file.size)}</p>
                </div>
                {pf.uploading && <div className="progress-bar mx-1.5 mb-1.5"><div className="progress-fill" style={{ width: `${pf.progress}%` }} /></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Image, label: "Total Images", value: imagesLoading ? "..." : images.length, color: "text-blue-400" },
          { icon: CheckCircle2, label: "Annotated", value: imagesLoading ? "..." : annotatedCount, color: "text-emerald-400" },
          { icon: AlertTriangle, label: "Needs Annotation", value: imagesLoading ? "..." : unannotatedCount, color: "text-amber-400" },
          { icon: Database, label: "Total Size", value: formatSize(totalSize), color: "text-violet-400" },
        ].map(s => (
          <div key={s.label} className="metric-card flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div><p className="text-lg font-bold">{s.value}</p><p className="text-[10px] text-[#64748b]">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Image Gallery */}
      {selectedDatasetId && images.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Your Images</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {images.map(img => (
              <div key={img.id} className="glass-card-solid overflow-hidden group">
                <div className="aspect-square bg-[#111827] flex items-center justify-center relative">
                  {img.filepath ? (
                    <img src={`/api/serve/${img.datasetId}/${img.filename}`} alt={img.originalFilename ?? img.filename} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Image className="w-8 h-8 text-[#2a3550]" />
                  )}
                  <span className={`absolute top-1 right-1 w-3 h-3 rounded-full ${
                    img.annotationStatus === "annotated" ? "bg-emerald-500" : "bg-amber-500"
                  }`} />
                </div>
                <div className="p-2">
                  <p className="text-[10px] font-mono truncate" title={img.originalFilename ?? img.filename}>{img.originalFilename ?? img.filename}</p>
                  <p className="text-[9px] text-[#64748b]">{img.annotationStatus === "annotated" ? "Annotated" : "Needs annotation"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Step */}
      {images.length > 0 && (
        <div className="glass-card p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold">{images.length} images collected</p>
                <p className="text-[10px] text-[#94a3b8]">
                  {unannotatedCount > 0
                    ? `Next: Create classes and annotate ${unannotatedCount} images`
                    : "All images annotated! Ready for quality check."}
                </p>
              </div>
            </div>
            <a href="/datasets" className="btn-primary text-xs flex items-center gap-1">
              Go to Dataset <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
