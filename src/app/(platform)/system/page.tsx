"use client";

import { useState, useEffect } from "react";
import { Settings, Cpu, HardDrive, Monitor, Clock, ShieldCheck, Activity, Database, Info, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useApi } from "@/lib/hooks";

interface HealthData {
  status: string;
  mode: string;
  ok: boolean;
  version: string;
  services: {
    database: { status: string; detail: string };
    storage: { status: string; detail: string };
    python: { status: string; detail: string };
    gpu: { status: string; detail: string };
    training: { status: string; detail: string };
  };
  counts: { datasets: number; images: number };
}
interface ModelsData { models: Array<{ id: string; name: string; status: string }>; total: number; }
interface TrainingData { experiments: Array<{ id: string; status: string }>; total: number; }

export default function SystemPage() {
  const { data: healthData, loading: healthLoading, refetch: refetchHealth } = useApi<HealthData>("/api/health");
  const { data: datasetsRes, loading: datasetsLoading } = useApi<Array<{ id: string; name: string }>>("/api/datasets");
  const { data: modelsRes, loading: modelsLoading } = useApi<ModelsData>("/api/models");
  const { data: trainingRes, loading: trainingLoading } = useApi<TrainingData>("/api/training");

  const dbOk = healthData?.services?.database?.status === "ok";
  const storageOk = healthData?.services?.storage?.status === "ok";
  const pythonOk = healthData?.services?.python?.status === "ok";
  const gpuAvailable = healthData?.services?.gpu?.status === "available";
  const trainingAvailable = healthData?.services?.training?.status === "available";
  const datasetCount = healthData?.counts?.datasets ?? datasetsRes?.length ?? null;
  const modelCount = modelsRes?.total ?? null;
  const experimentCount = trainingRes?.total ?? null;
  const hasTrainingExperiments = (trainingRes?.experiments?.length ?? 0) > 0;
  const hasModels = (modelsRes?.total ?? 0) > 0;

  const loading = healthLoading || datasetsLoading || modelsLoading || trainingLoading;

  const features = [
    { feature: "Database (PostgreSQL)", status: dbOk ? "Working" : "Error", notes: healthData?.services?.database?.detail || "Checking...", ok: dbOk },
    { feature: "Dataset Management", status: dbOk ? "Working" : "Error", notes: `${datasetCount ?? 0} datasets`, ok: dbOk },
    { feature: "Image Upload & Ingest", status: dbOk && storageOk ? "Working" : "Error", notes: storageOk ? "Drag & drop, batch" : "Storage unavailable", ok: dbOk && storageOk },
    { feature: "Quality Analysis", status: dbOk ? "Working" : "Error", notes: "Brightness, blur, entropy analysis", ok: dbOk },
    { feature: "Duplicate Detection", status: dbOk ? "Working" : "Error", notes: "SHA-256 + perceptual hash", ok: dbOk },
    { feature: "Annotation UI", status: dbOk ? "Working" : "Error", notes: "Bounding box drawing", ok: dbOk },
    { feature: "Annotation Validation", status: dbOk ? "Working" : "Error", notes: "Health score computed", ok: dbOk },
    { feature: "Dataset Splitting", status: dbOk ? "Working" : "Error", notes: "Deterministic with seed", ok: dbOk },
    { feature: "Training (Python)", status: hasTrainingExperiments ? "Available" : trainingAvailable ? "Ready" : "External", notes: hasTrainingExperiments ? `${experimentCount} experiments` : trainingAvailable ? "ai/train.py ready" : "Requires PyTorch", ok: hasTrainingExperiments || trainingAvailable },
    { feature: "Inference", status: hasModels ? "Available" : "External", notes: hasModels ? "Model registered" : "Requires trained model", ok: hasModels },
    { feature: "Webcam Capture", status: "Browser-dependent", notes: "Requires HTTPS + permissions", ok: false },
    { feature: "CUDA GPU Training", status: gpuAvailable ? "Available" : "GPU Required", notes: gpuAvailable ? "CUDA detected" : "CPU fallback available", ok: gpuAvailable },
    { feature: "Kaggle Upload", status: "Not Implemented", notes: "Export package available", ok: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">System</h1>
          <p className="text-sm text-[#94a3b8]">System status, hardware, configuration, and diagnostics</p>
        </div>
        <button onClick={() => refetchHealth()} className="p-2 rounded-lg hover:bg-[#111827] transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4 text-[#64748b]" />
        </button>
      </div>

      {/* Mode banner */}
      {healthData && (
        <div className={`glass-card-solid p-4 border ${healthData.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-center gap-3">
            {healthData.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangleIcon />}
            <div>
              <p className="text-sm font-bold">{healthData.mode}</p>
              <p className="text-xs text-[#94a3b8]">
                {healthData.ok ? "All core services operational" : "Some services degraded — check details below"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Database, label: "Database", value: loading ? "Checking..." : dbOk ? "PostgreSQL" : "Disconnected", detail: healthData?.services?.database?.detail || "Drizzle ORM", color: dbOk ? "text-emerald-400" : "text-rose-400", ok: dbOk },
          { icon: Monitor, label: "GPU", value: gpuAvailable ? "CUDA Available" : "Not Available", detail: gpuAvailable ? healthData?.services?.gpu?.detail : "CPU training mode", color: gpuAvailable ? "text-emerald-400" : "text-amber-400", ok: gpuAvailable },
          { icon: HardDrive, label: "Storage", value: loading ? "Checking..." : storageOk ? "Available" : "Error", detail: healthData?.services?.storage?.detail || "Local dataset storage", color: storageOk ? "text-blue-400" : "text-rose-400", ok: storageOk },
          { icon: Cpu, label: "Python AI", value: loading ? "Checking..." : pythonOk ? healthData?.services?.python?.detail || "Available" : "Not Found", detail: pythonOk ? "ai/ directory verified" : "Python not found", color: pythonOk ? "text-violet-400" : "text-rose-400", ok: pythonOk },
        ].map(s => (
          <div key={s.label} className="metric-card">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-sm font-bold">{s.value}</p>
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className="text-[10px] text-[#475569]">{s.detail}</p>
          </div>
        ))}
      </div>

      {/* Environment */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400" /> Environment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {[
            { key: "Platform", value: "VisionBharat DataGenesis 2026" },
            { key: "Version", value: healthData?.version || "1.0.0" },
            { key: "Frontend", value: "Next.js 16 + React 19 + TypeScript" },
            { key: "UI", value: "Tailwind CSS 4" },
            { key: "Database", value: dbOk ? "PostgreSQL — Connected" : "PostgreSQL — Disconnected" },
            { key: "AI Framework", value: pythonOk ? "PyTorch (Python — available)" : "PyTorch (Python — not found)" },
            { key: "Image Processing", value: "OpenCV + Pillow" },
            { key: "Numerical", value: "NumPy" },
            { key: "Mode", value: healthData?.mode || "Checking..." },
            { key: "Training Entry", value: trainingAvailable ? "ai/train.py — Ready" : "External process" },
            { key: "GPU", value: gpuAvailable ? healthData?.services?.gpu?.detail : "CPU fallback" },
            { key: "Project Lead", value: "Arul Maria Agnes" },
            { key: "Institution", value: "Ramco Institute of Technology, Rajapalayam" },
            { key: "Competition", value: "DataGenesis 2026 National AI & CV Hackathon" },
          ].map(item => (
            <div key={item.key} className="flex justify-between p-2 bg-[#111827] rounded">
              <span className="text-[#64748b]">{item.key}</span>
              <span className="font-mono text-[#94a3b8]">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Summary */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-emerald-400" /> Data Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Datasets", value: loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : datasetCount ?? 0 },
            { label: "Models", value: loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : modelCount ?? 0 },
            { label: "Experiments", value: loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : experimentCount ?? 0 },
            { label: "DB Status", value: loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : dbOk ? "Healthy" : "Down" },
          ].map(s => (
            <div key={s.label} className="p-3 bg-[#111827] rounded text-center">
              <p className="text-lg font-bold text-[#94a3b8]">{s.value}</p>
              <p className="text-[10px] text-[#64748b]">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Status */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Feature Status</h3>
        <table className="data-table">
          <thead><tr><th>Feature</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {features.map(f => (
              <tr key={f.feature}>
                <td className="text-xs font-semibold">{f.feature}</td>
                <td>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    f.status === "Working" || f.status === "Available" || f.status === "Ready" ? "badge-success" :
                    f.status === "External" ? "badge-info" :
                    f.status === "GPU Required" ? "badge-warning" :
                    f.status === "Error" ? "badge-error" : "badge-neutral"
                  }`}>{f.status}</span>
                </td>
                <td className="text-[10px] text-[#64748b]">{f.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Security */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Security <span className="text-[10px] text-[#64748b] font-normal">(design claims)</span></h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
          {[
            { label: "File type validation", ok: true },
            { label: "Upload size limits", ok: true },
            { label: "Path traversal protection", ok: true },
            { label: "Safe filename handling", ok: true },
            { label: "No hardcoded secrets", ok: true },
            { label: "CORS configured", ok: true },
            { label: "EXIF stripping", ok: true },
            { label: "Input validation", ok: true },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 p-2 bg-[#111827] rounded">
              <ShieldCheck className={`w-3 h-3 ${s.ok ? "text-emerald-400" : "text-rose-400"}`} />
              <span className="text-[#94a3b8]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="glass-card-solid p-5 text-center">
        <h2 className="text-lg font-bold gradient-text mb-2">VISIONBHARAT</h2>
        <p className="text-xs text-[#94a3b8] mb-1">An India-Centric Dataset Engineering & From-Scratch Computer Vision Platform</p>
        <p className="text-xs text-[#64748b]">DataGenesis 2026 National AI & Computer Vision Hackathon</p>
        <p className="text-xs text-[#64748b] mt-2">Ramco Institute of Technology, Rajapalayam</p>
        <p className="text-xs text-[#64748b] mt-1">Project Lead: Arul Maria Agnes</p>
      </div>
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-400">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
  );
}
