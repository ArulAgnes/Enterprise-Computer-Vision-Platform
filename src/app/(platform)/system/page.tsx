"use client";

import { Settings, Cpu, HardDrive, Monitor, Clock, ShieldCheck, Activity, Database, Info, RefreshCw } from "lucide-react";

export default function SystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">System</h1>
        <p className="text-sm text-[#94a3b8]">System status, hardware, configuration, and diagnostics</p>
      </div>

      {/* System Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Cpu, label: "CPU", value: "Available", detail: "x86_64", color: "text-blue-400" },
          { icon: Monitor, label: "GPU", value: "Not Available", detail: "CPU training mode", color: "text-amber-400" },
          { icon: HardDrive, label: "Storage", value: "Filesystem", detail: "Local dataset storage", color: "text-emerald-400" },
          { icon: Database, label: "Database", value: "PostgreSQL", detail: "Drizzle ORM", color: "text-violet-400" },
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
            { key: "Version", value: "1.0.0" },
            { key: "Frontend", value: "Next.js 16 + React 19 + TypeScript" },
            { key: "UI", value: "Tailwind CSS 4" },
            { key: "Database", value: "PostgreSQL via Drizzle ORM" },
            { key: "AI Framework", value: "PyTorch (Python — separate process)" },
            { key: "Image Processing", value: "OpenCV + Pillow" },
            { key: "Numerical", value: "NumPy" },
            { key: "Mode", value: "Offline / Demo" },
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

      {/* Feature Status */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Feature Status</h3>
        <table className="data-table">
          <thead><tr><th>Feature</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {[
              { feature: "Dataset Management", status: "Working", notes: "Full CRUD operations" },
              { feature: "Image Upload & Ingest", status: "Working", notes: "Drag & drop, batch" },
              { feature: "Quality Analysis", status: "Working", notes: "Brightness, blur, entropy" },
              { feature: "Duplicate Detection", status: "Working", notes: "SHA-256 + perceptual hash" },
              { feature: "Annotation UI", status: "Working", notes: "Bounding box drawing" },
              { feature: "Annotation Validation", status: "Working", notes: "Health score computed" },
              { feature: "Dataset Splitting", status: "Working", notes: "Deterministic with seed" },
              { feature: "Training (Python)", status: "External", notes: "Requires PyTorch + GPU" },
              { feature: "Inference", status: "External", notes: "Requires trained model" },
              { feature: "Webcam Capture", status: "Browser-dependent", notes: "Requires HTTPS + permissions" },
              { feature: "CUDA GPU Training", status: "GPU Required", notes: "CPU fallback available" },
              { feature: "Kaggle Upload", status: "Not Implemented", notes: "Export package available" },
            ].map(f => (
              <tr key={f.feature}>
                <td className="text-xs font-semibold">{f.feature}</td>
                <td>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    f.status === "Working" ? "badge-success" :
                    f.status === "External" ? "badge-info" :
                    f.status === "GPU Required" ? "badge-warning" : "badge-neutral"
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
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Security</h3>
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
