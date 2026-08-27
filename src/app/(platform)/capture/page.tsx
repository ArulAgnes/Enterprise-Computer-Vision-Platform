"use client";

import { useState } from "react";
import { Camera, Upload, Image, CheckCircle2, AlertTriangle, XCircle, Hash, HardDrive, Clock, Tag, ShieldCheck, FolderOpen } from "lucide-react";

const demoImages = Array.from({ length: 12 }, (_, i) => ({
  id: `img-${i + 1}`, filename: `DIYA_${String(i + 1).padStart(4, "0")}.jpg`,
  resolution: i % 3 === 0 ? "4032×3024" : i % 3 === 1 ? "3024×4032" : "3840×2160",
  size: `${(2 + Math.random() * 4).toFixed(1)} MB`, hash: `sha256_${i.toString(16).padStart(8, "0")}...`,
  class: ["Clay Diya", "Brass Diya", "Kuthu Vilakku", "Temple Bell", "Hanging Diya"][i % 5],
  annotated: i < 10, quality: i < 8 ? "green" : i < 10 ? "yellow" : "red",
}));

export default function CapturePage() {
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Capture & Ingest</h1>
          <p className="text-sm text-[#94a3b8]">Upload original team-collected images to the dataset</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}>
            {viewMode === "grid" ? "Table View" : "Grid View"}
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div className={`upload-zone ${dragOver ? "dragover" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); }}>
        <Upload className="w-12 h-12 text-[#64748b] mx-auto mb-3" />
        <h3 className="text-sm font-semibold mb-1">Drag & Drop Images</h3>
        <p className="text-xs text-[#64748b] mb-3">Supports JPG, PNG, JPEG — Batch upload supported</p>
        <div className="flex gap-2 justify-center">
          <button className="btn-primary text-xs flex items-center gap-1"><Upload className="w-3 h-3" /> Browse Files</button>
          <button className="btn-secondary text-xs flex items-center gap-1"><FolderOpen className="w-3 h-3" /> Upload Folder</button>
          <button className="btn-secondary text-xs flex items-center gap-1"><Camera className="w-3 h-3" /> Camera Capture</button>
        </div>
        <p className="text-[10px] text-amber-400 mt-3">⚠ All images must be originally captured by the team. No external/scraped images.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Image, label: "Total Images", value: 763, color: "text-blue-400" },
          { icon: CheckCircle2, label: "Quality OK", value: 643, color: "text-emerald-400" },
          { icon: AlertTriangle, label: "Review", value: 87, color: "text-amber-400" },
          { icon: XCircle, label: "Rejected", value: 33, color: "text-rose-400" },
        ].map(s => (
          <div key={s.label} className="metric-card flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div><p className="text-lg font-bold">{s.value}</p><p className="text-[10px] text-[#64748b]">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Image Grid */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {demoImages.map(img => (
            <div key={img.id} className="glass-card-solid overflow-hidden group cursor-pointer">
              <div className="aspect-square bg-[#111827] flex items-center justify-center relative">
                <div className="w-full h-full bg-gradient-to-br from-[#1a2235] to-[#0d1220] flex items-center justify-center">
                  <Image className="w-8 h-8 text-[#2a3550]" />
                </div>
                <span className={`absolute top-1 right-1 w-3 h-3 rounded-full ${
                  img.quality === "green" ? "bg-emerald-500" : img.quality === "yellow" ? "bg-amber-500" : "bg-rose-500"
                }`} />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button className="p-1.5 rounded bg-blue-500/20 text-blue-400 text-[10px]">View</button>
                  <button className="p-1.5 rounded bg-rose-500/20 text-rose-400 text-[10px]">Del</button>
                </div>
              </div>
              <div className="p-2">
                <p className="text-[10px] font-mono truncate">{img.filename}</p>
                <p className="text-[9px] text-[#64748b]">{img.resolution}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card-solid overflow-auto">
          <table className="data-table">
            <thead>
              <tr><th>Filename</th><th>Resolution</th><th>Size</th><th>Class</th><th>Annotated</th><th>Quality</th></tr>
            </thead>
            <tbody>
              {demoImages.map(img => (
                <tr key={img.id}>
                  <td className="font-mono text-xs">{img.filename}</td>
                  <td className="text-xs">{img.resolution}</td>
                  <td className="text-xs">{img.size}</td>
                  <td className="text-xs">{img.class}</td>
                  <td>{img.annotated ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}</td>
                  <td><span className={`text-[10px] px-2 py-0.5 rounded ${
                    img.quality === "green" ? "badge-success" : img.quality === "yellow" ? "badge-warning" : "badge-error"
                  }`}>{img.quality === "green" ? "OK" : img.quality === "yellow" ? "Review" : "Reject"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
