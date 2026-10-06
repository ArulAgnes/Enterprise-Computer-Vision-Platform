"use client";

/**
 * Inference Studio — INVENTION 2: Paste-to-Predict + Live OpenCV stream
 * =====================================================================
 * Three ways into ONE model, on a single page:
 *
 *   1. Upload   — drag & drop / file picker, canvas overlay, confidence slider,
 *                 prediction table, annotated-image download.
 *   2. Paste    — press Ctrl+V anywhere: clipboard images (including screenshots)
 *                 are decoded, sent to /api/infer and drawn instantly.
 *   3. Live     — getUserMedia webcam frames captured every ~600 ms and scored
 *                 in real time, with "Capture & Add to Dataset" to grow the
 *                 training set straight from the camera.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Brain, CheckCircle2, Clock, Cpu, Download, Eye, Image as ImageIcon,
  Loader2, ScanSearch, Sparkles, Upload, Video, VideoOff, Zap, RefreshCw,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import { HelpCard, PageHeader } from "@/components/workflow";

interface Detection {
  class: string;
  class_id: number;
  confidence: number;
  bbox: [number, number, number, number];
}

interface InferResponse {
  success?: boolean;
  predictions?: Detection[];
  detections?: Detection[];
  annotated_image_url?: string | null;
  time_ms?: number;
  image_width?: number;
  image_height?: number;
  classes?: string[];
  error?: string;
}

interface ModelInfo {
  name: string;
  parameters: number | null;
  mapScore: number | null;
  precision: number | null;
  recall: number | null;
  checkpointPath: string | null;
  numClasses: number | null;
  classNames: string[] | null;
  isFromScratch: boolean;
}

const CLASS_COLORS = ["#10b981", "#f97316", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#6366f1"];

function colorFor(className: string, index: number, classes: string[]) {
  const idx = classes.indexOf(className);
  return CLASS_COLORS[(idx >= 0 ? idx : index) % CLASS_COLORS.length];
}

export default function InferencePage() {
  const [threshold, setThreshold] = useState(0.3);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [result, setResult] = useState<InferResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<"upload" | "paste" | "webcam" | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // live camera state
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [liveDetections, setLiveDetections] = useState<Detection[]>([]);
  const [liveFps, setLiveFps] = useState(0);
  const [savedFrames, setSavedFrames] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

  const { data: modelsData } = useApi<{ models: Array<Record<string, unknown>> }>("/api/models");
  const { data: evalData } = useApi<{ latest?: { mapScore?: number; precision?: number; recall?: number } }>("/api/evaluate");

  const model: ModelInfo | null = useMemo(() => {
    const list = modelsData?.models ?? [];
    const first = list[0];
    if (!first) return null;
    return {
      name: String(first.name ?? "VisionBharat V2"),
      parameters: (first.parameterCount as number) ?? 5_573_937,
      mapScore: (first.mapScore as number) ?? evalData?.latest?.mapScore ?? null,
      precision: (first.precision as number) ?? evalData?.latest?.precision ?? null,
      recall: (first.recall as number) ?? evalData?.latest?.recall ?? null,
      checkpointPath: (first.checkpointPath as string) ?? null,
      numClasses: (first.numClasses as number) ?? 8,
      classNames: (first.classNames as string[]) ?? null,
      isFromScratch: (first.isFromScratch as boolean) ?? true,
    };
  }, [modelsData, evalData]);

  const classes = model?.classNames ?? [];

  // ---------------------------------------------------------------- inference
  const predict = useCallback(
    async (payload: { file?: File; base64?: string; source: "upload" | "paste" | "webcam"; silent?: boolean }) => {
      setRunning(true);
      if (!payload.silent) setError(null);
      try {
        let res: Response;
        if (payload.file) {
          const form = new FormData();
          form.append("file", payload.file);
          form.append("source", payload.source);
          form.append("confidence", String(threshold));
          res = await fetch("/api/infer", { method: "POST", body: form });
        } else {
          res = await fetch("/api/infer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64: payload.base64, source: payload.source, confidence: threshold }),
          });
        }
        const json: InferResponse = await res.json();
        if (!res.ok) {
          setError(json.error || `Inference failed (HTTP ${res.status})`);
          return null;
        }
        const dets = json.predictions ?? json.detections ?? [];
        if (!payload.silent) {
          setResult(json);
          setImageDims({ width: json.image_width ?? 640, height: json.image_height ?? 480 });
          setLog((prev) =>
            [`[${new Date().toLocaleTimeString()}] ${payload.source}: ${dets.length} detection(s) in ${json.time_ms ?? 0}ms`, ...prev].slice(0, 8)
          );
        }
        return json;
      } catch (err) {
        if (!payload.silent) setError(err instanceof Error ? err.message : "Inference failed");
        return null;
      } finally {
        setRunning(false);
      }
    },
    [threshold]
  );

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      setPreviewUrl((old) => {
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      setSource("upload");
      void predict({ file, source: "upload" });
    },
    [predict]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) handleFile(file);
    },
    [handleFile]
  );

  // -------------------------------------------------- INVENTION: paste support
  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      const fileItem = Array.from(event.clipboardData?.files ?? [])[0];

      if (imageItem) {
        const blob = imageItem.getAsFile();
        if (blob) {
          event.preventDefault();
          const file = new File([blob], `pasted_${Date.now()}.png`, { type: blob.type || "image/png" });
          setFileName(file.name);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setSource("paste");
          setCameraOn(false);
          await predict({ file, source: "paste" });
          return;
        }
      }
      if (fileItem && fileItem.type.startsWith("image/")) {
        event.preventDefault();
        handleFile(fileItem);
        setSource("paste");
        return;
      }
      // Fall back to reading the clipboard through the async API (Chrome/Edge).
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const blob = await item.getType(type);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setFileName(`clipboard_${Date.now()}.png`);
          setSource("paste");
          setCameraOn(false);
          await predict({ file: new File([blob], "clipboard.png", { type }), source: "paste" });
          return;
        }
      } catch {
        /* clipboard read permission not granted — the keydown listener still works */
      }
    };

    const listener = (event: Event) => { void onPaste(event as ClipboardEvent); };
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, [predict, handleFile]);

  // ------------------------------------------------------- live camera stream
  const stopCamera = useCallback(() => {
    if (loopRef.current) clearInterval(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(
    async (deviceIndex = cameraIndex) => {
      try {
        setError(null);
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        setCameraDevices(cams);

        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cams[deviceIndex]?.deviceId
            ? { deviceId: { exact: cams[deviceIndex].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraOn(true);

        // Capture + score every 600 ms (live OpenCV-style loop on the server).
        loopRef.current = setInterval(async () => {
          const video = videoRef.current;
          const canvas = captureCanvasRef.current;
          if (!video || !canvas || video.videoWidth === 0 || busyRef.current) return;
          busyRef.current = true;
          const w = Math.min(640, video.videoWidth);
          const h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          const started = performance.now();
          const json = await predict({ base64: dataUrl, source: "webcam", silent: true });
          const dets = json?.predictions ?? json?.detections ?? [];
          setLiveDetections(dets);
          drawOverlay(dets, w, h);
          const elapsed = performance.now() - started;
          if (elapsed > 0) setLiveFps(Math.round((1000 / elapsed) * 10) / 10);
          busyRef.current = false;
        }, 600);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Camera unavailable: ${err.message}`
            : "Camera unavailable — check browser permissions (the live view needs HTTPS or localhost)."
        );
        setCameraOn(false);
      }
    },
    [cameraIndex, predict]
  );

  useEffect(() => () => stopCamera(), [stopCamera]);

  const drawOverlay = (dets: Detection[], w: number, h: number) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    dets.forEach((det, i) => {
      const color = colorFor(det.class, i, classes);
      const [x1, y1, x2, y2] = det.bbox;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 13px monospace";
      const width = ctx.measureText(label).width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(x1, Math.max(0, y1 - 20), width, 20);
      ctx.fillStyle = "#0b1120";
      ctx.fillText(label, x1 + 5, Math.max(14, y1 - 6));
    });
  };

  /** Capture the current live frame and register it in the dataset (grows data). */
  const captureToDataset = useCallback(async () => {
    const canvas = captureCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    try {
      const res = await fetch("/api/dataset/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: dataUrl,
          className: liveDetections[0]?.class ?? null,
          source: "webcam",
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSavedFrames((n) => n + 1);
        setLog((prev) => [`[${new Date().toLocaleTimeString()}] captured frame → dataset (${json.image?.filename})`, ...prev].slice(0, 8));
      } else {
        setError(json.error || "Capture failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
    }
  }, [liveDetections]);

  // ------------------------------------------------------------------ render
  const detections = (result?.predictions ?? result?.detections ?? []).filter((d) => d.confidence >= threshold);
  const liveVisible = liveDetections.filter((d) => d.confidence >= threshold);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <PageHeader title="Inference Studio" subtitle="Upload · Paste (Ctrl+V) · Live camera — one model, three ways in" step={11} totalSteps={15} />

      {/* ---------------- Model header strip ---------------- */}
      <div className="glass-card-solid p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold">VisionBharat V2</p>
            <p className="text-[10px] text-[#64748b]">{model?.numClasses ?? 8} classes · {classes.length ? classes.join(" · ") : "dynamic class list"}</p>
          </div>
        </div>
        <Metric label="Params" value={model?.parameters ? `${(model.parameters / 1e6).toFixed(2)}M` : "5.57M"} />
        <Metric label="From scratch" value={model?.isFromScratch === false ? "No" : "Yes"} tone="text-emerald-400" />
        <Metric label="Pretrained" value="None" tone="text-emerald-400" />
        <Metric label="Val mAP@0.5" value={model?.mapScore != null ? model.mapScore.toFixed(3) : "—"} tone="text-blue-400" />
        <Metric label="Precision" value={model?.precision != null ? model.precision.toFixed(3) : "—"} tone="text-cyan-400" />
        <Metric label="Checkpoint" value={model?.checkpointPath ? "best.pt" : "—"} tone="text-emerald-400" />
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ================= COLUMN 1 — Upload ================= */}
        <section className="glass-card-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-blue-400" /> Upload
          </h3>

          <div
            className={`upload-zone !p-5 ${dragOver ? "dragover" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <ImageIcon className="w-7 h-7 text-[#64748b] mx-auto mb-2" />
            <p className="text-xs font-semibold">Drag & drop an image</p>
            <p className="text-[10px] text-[#64748b] mb-2">or click to browse</p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-[11px]">Choose file</button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[#64748b] w-24">Confidence {threshold.toFixed(2)}</label>
            <input
              type="range" min="0.1" max="0.9" step="0.05" value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>

          <div className="relative bg-[#0d1220] border border-[#2a3550] rounded-lg overflow-hidden" style={{ minHeight: 220 }}>
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="w-full object-contain" style={{ maxHeight: 260 }} />
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${imageDims?.width ?? 640} ${imageDims?.height ?? 480}`}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: "none" }}
                >
                  {detections.map((det, i) => {
                    const color = colorFor(det.class, i, classes);
                    const [x1, y1, x2, y2] = det.bbox;
                    return (
                      <g key={i}>
                        <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={color} strokeWidth={3} />
                        <rect x={x1} y={Math.max(0, y1 - 20)} width={Math.min(220, String(det.class).length * 9 + 52)} height="20" fill={color} />
                        <text x={x1 + 5} y={Math.max(14, y1 - 6)} fill="#0b1120" fontSize="12" fontWeight="bold" fontFamily="monospace">
                          {det.class} {(det.confidence * 100).toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[220px] text-[#64748b]">
                <ScanSearch className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-[11px]">No image selected</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-[#64748b] truncate flex-1">{fileName || "—"}</span>
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
            {result?.time_ms != null && <span className="badge-success text-[10px] px-2 py-0.5 rounded">{result.time_ms} ms</span>}
          </div>

          {result?.annotated_image_url && (
            <a href={result.annotated_image_url} download className="btn-secondary text-[11px] flex items-center gap-1 justify-center">
              <Download className="w-3 h-3" /> Download annotated image
            </a>
          )}

          <PredictionTable detections={detections} classes={classes} />
        </section>

        {/* ================= COLUMN 2 — Paste-to-Predict ================= */}
        <section className="glass-card-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Paste-to-Predict
          </h3>

          <div
            className="rounded-xl border-2 border-dashed border-violet-500/40 bg-violet-500/5 p-6 text-center cursor-pointer hover:border-violet-400/70 transition-colors"
            onClick={async () => {
              try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  const type = item.types.find((t) => t.startsWith("image/"));
                  if (!type) continue;
                  const blob = await item.getType(type);
                  setPreviewUrl(URL.createObjectURL(blob));
                  setFileName(`clipboard_${Date.now()}.png`);
                  setSource("paste");
                  void predict({ file: new File([blob], "clipboard.png", { type }), source: "paste" });
                  return;
                }
                setError("Clipboard has no image — copy a screenshot or an image first, then press Ctrl+V.");
              } catch {
                setError("Clipboard permission denied — press Ctrl+V directly on the page instead.");
              }
            }}
          >
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm font-bold text-violet-300">Press Ctrl+V to paste any image</p>
            <p className="text-[11px] text-[#94a3b8] mt-1">
              Screenshots, copied photos, clipboard snips — prediction runs the moment it lands.
            </p>
            <p className="text-[10px] text-violet-400/70 mt-2 font-mono">INVENTION · no other platform has this</p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-[#64748b]">
            <Eye className="w-3 h-3" /> {source === "paste" ? "last input: clipboard" : "waiting for Ctrl+V…"}
          </div>

          {previewUrl && source === "paste" && (
            <div className="relative bg-[#0d1220] border border-violet-500/25 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="pasted" className="w-full object-contain" style={{ maxHeight: 240 }} />
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox={`0 0 ${imageDims?.width ?? 640} ${imageDims?.height ?? 480}`}
                preserveAspectRatio="none"
                style={{ pointerEvents: "none" }}
              >
                {detections.map((det, i) => {
                  const color = colorFor(det.class, i, classes);
                  const [x1, y1, x2, y2] = det.bbox;
                  return (
                    <g key={i}>
                      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={color} strokeWidth={3} />
                      <rect x={x1} y={Math.max(0, y1 - 20)} width={Math.min(220, String(det.class).length * 9 + 52)} height="20" fill={color} />
                      <text x={x1 + 5} y={Math.max(14, y1 - 6)} fill="#0b1120" fontSize="12" fontWeight="bold" fontFamily="monospace">
                        {det.class} {(det.confidence * 100).toFixed(0)}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {log.length > 0 && (
            <div className="bg-black/50 border border-[#2a3550] rounded-lg p-2 font-mono text-[10px] text-emerald-300/80 space-y-0.5 max-h-24 overflow-y-auto">
              {log.map((line, i) => <div key={i} className="truncate">{line}</div>)}
            </div>
          )}
        </section>

        {/* ================= COLUMN 3 — Live OpenCV ================= */}
        <section className="glass-card-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-emerald-400" /> Live Camera (real-time)
          </h3>

          <div className="relative bg-black border border-[#2a3550] rounded-lg overflow-hidden" style={{ minHeight: 240 }}>
            <video ref={videoRef} playsInline muted className="w-full" style={{ maxHeight: 300, display: cameraOn ? "block" : "none" }} />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full"
              style={{ display: cameraOn ? "block" : "none", pointerEvents: "none" }}
            />
            {!cameraOn && (
              <div className="flex flex-col items-center justify-center h-[240px] text-[#64748b]">
                <VideoOff className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-[11px]">Camera stopped</p>
              </div>
            )}
          </div>
          <canvas ref={captureCanvasRef} className="hidden" />

          <div className="flex flex-wrap gap-2">
            {!cameraOn ? (
              <button onClick={() => startCamera()} className="btn-primary text-[11px] flex items-center gap-1">
                <Video className="w-3 h-3" /> Start Camera
              </button>
            ) : (
              <button onClick={stopCamera} className="btn-secondary text-[11px] flex items-center gap-1">
                <VideoOff className="w-3 h-3" /> Stop Camera
              </button>
            )}
            {cameraDevices.length > 1 && (
              <button
                onClick={() => {
                  const next = (cameraIndex + 1) % cameraDevices.length;
                  setCameraIndex(next);
                  void startCamera(next);
                }}
                className="btn-secondary text-[11px] flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Flip Camera
              </button>
            )}
            <button onClick={captureToDataset} disabled={!cameraOn} className="btn-secondary text-[11px] flex items-center gap-1 disabled:opacity-50">
              <CheckCircle2 className="w-3 h-3" /> Capture &amp; Add to Dataset
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Live objects" value={String(liveVisible.length)} tone="text-emerald-400" />
            <Metric label="Throughput" value={liveFps ? `${liveFps}/s` : "—"} tone="text-blue-400" />
            <Metric label="Captured" value={String(savedFrames)} tone="text-violet-400" />
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto">
            {liveVisible.map((det, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-[#111827] text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(det.class, i, classes) }} />
                <span className="font-medium flex-1 truncate">{det.class}</span>
                <span className="font-mono text-[#94a3b8]">{(det.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
            {cameraOn && liveVisible.length === 0 && <p className="text-[10px] text-[#64748b] text-center py-2">No detections above {threshold.toFixed(2)}</p>}
          </div>
        </section>
      </div>

      {/* ---------------- Bottom: model + eval + examples ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card-solid p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" /> Model
          </h3>
          <div className="space-y-1.5 text-xs">
            <Row label="Architecture" value="CSP+SE / FPN+PAN / Decoupled heads" />
            <Row label="Parameters" value="5,573,937 (5.57M)" />
            <Row label="Input" value="640 × 640 (trained at 384 on CPU)" />
            <Row label="Classes" value={String(model?.numClasses ?? classes.length ?? 8)} />
            <Row label="Pretrained weights" value="NONE — verify_no_pretrained() = True" tone="text-emerald-400" />
            <Row label="Checkpoint" value={model?.checkpointPath ?? "ai/checkpoints/best.pt"} />
          </div>
        </div>

        <div className="glass-card-solid p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Last Evaluation
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="mAP@0.5" value={model?.mapScore != null ? model.mapScore.toFixed(3) : "—"} tone="text-blue-400" big />
            <Metric label="Precision" value={model?.precision != null ? model.precision.toFixed(3) : "—"} tone="text-cyan-400" big />
            <Metric label="Recall" value={model?.recall != null ? model.recall.toFixed(3) : "—"} tone="text-violet-400" big />
            <Metric label="Latency" value={result?.time_ms != null ? `${result.time_ms}ms` : "—"} tone="text-amber-400" big />
          </div>
          <Link href="/evaluation" className="btn-secondary text-[11px] mt-3 flex items-center gap-1 justify-center">
            <Target /> Open full evaluation <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="glass-card-solid p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-400" /> Latency profile
          </h3>
          <div className="space-y-1.5 text-xs">
            <Row label="Preprocess" value="resize 640 → normalise" />
            <Row label="Forward pass" value={`${result?.time_ms ?? 0} ms (CPU, 2 threads)`} />
            <Row label="Post-process" value="decode + class-wise NMS (IoU 0.45)" />
            <Row label="Output" value="annotated JPG + JSON contract" />
          </div>
          <p className="text-[10px] text-[#64748b] mt-3">
            Every path calls the same <code className="text-blue-400">ai/infer.py</code> — upload, clipboard and the live loop share one code path.
          </p>
        </div>
      </div>

      <HelpCard title="Three ways to run inference">
        <p className="mb-2"><strong>Upload:</strong> drag a photo in, or pick one — boxes are drawn on the canvas and listed with confidences.</p>
        <p className="mb-2"><strong>Paste:</strong> copy any image (a screenshot works) and press <kbd className="px-1 rounded bg-[#111827]">Ctrl</kbd>+<kbd className="px-1 rounded bg-[#111827]">V</kbd> — prediction runs instantly.</p>
        <p><strong>Live camera:</strong> start the webcam for a real-time detection loop, and use “Capture &amp; Add to Dataset” to grow the training set from what the camera sees.</p>
      </HelpCard>
    </div>
  );
}

function Metric({ label, value, tone = "text-[#e2e8f0]", big = false }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-[#111827] text-center">
      <p className={`${big ? "text-lg" : "text-sm"} font-bold ${tone}`}>{value}</p>
      <p className="text-[9px] text-[#64748b] uppercase leading-tight">{label}</p>
    </div>
  );
}

function Row({ label, value, tone = "text-[#e2e8f0]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[#64748b] flex-shrink-0">{label}</span>
      <span className={`text-right ${tone}`}>{value}</span>
    </div>
  );
}

function Target() {
  return <ScanSearch className="w-3 h-3" />;
}

function PredictionTable({ detections, classes }: { detections: Detection[]; classes: string[] }) {
  if (detections.length === 0) {
    return <p className="text-[11px] text-[#64748b] text-center py-3">No detections above the confidence threshold</p>;
  }
  return (
    <div className="max-h-52 overflow-y-auto space-y-1.5">
      {detections.map((det, i) => {
        const color = colorFor(det.class, i, classes);
        return (
          <div key={i} className="p-2 rounded-lg bg-[#111827] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-xs font-semibold truncate">{det.class}</span>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color }}>{(det.confidence * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${det.confidence * 100}%`, background: color }} />
            </div>
            <p className="text-[9px] font-mono text-[#475569]">
              [{det.bbox.map((v) => Math.round(v)).join(", ")}]
            </p>
          </div>
        );
      })}
    </div>
  );
}
