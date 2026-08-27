"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Upload, Image, CheckCircle2, AlertTriangle, XCircle, Hash, HardDrive, Clock, Tag, ShieldCheck, FolderOpen, Loader2, X, Database } from "lucide-react";
import { useApi, apiUpload, apiDelete } from "@/lib/hooks";

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

export default function CapturePage() {
  const [dragOver, setDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [datasetId, setDatasetId] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const imagesUrl = datasetId ? `/api/images?datasetId=${datasetId}&limit=200` : null;
  const { data: imagesData, loading: imagesLoading, error: imagesError, refetch } = useApi<{ success: boolean; data: ImageRecord[] }>(imagesUrl);

  const images: ImageRecord[] = imagesData?.data ?? [];
  const totalSize = images.reduce((sum, img) => sum + (img.fileSize ?? 0), 0);
  const annotatedCount = images.filter(i => i.annotationStatus === "annotated").length;
  const qualityOkCount = images.filter(i => i.qualityStatus === "green").length;
  const qualityReviewCount = images.filter(i => i.qualityStatus === "yellow").length;
  const qualityRejectCount = images.filter(i => i.qualityStatus === "red").length;

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
    if (!datasetId) return;
    const toUpload = pendingFiles.filter(p => !p.uploading && !p.done && !p.error);
    if (toUpload.length === 0) return;

    const formData = new FormData();
    formData.append("datasetId", datasetId);
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
    } catch (err) {
      setPendingFiles(prev =>
        prev.map(p => (toUpload.includes(p) ? { ...p, uploading: false, error: String(err) } : p))
      );
    }
  }, [datasetId, pendingFiles, refetch]);

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

  const handleDeleteImage = useCallback(async (id: string) => {
    try {
      await apiDelete(`/api/images/${id}`);
      refetch();
    } catch {
      // Image delete endpoint not implemented yet
    }
  }, [refetch]);

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

  const hasData = images.length > 0;
  const isUploading = pendingFiles.some(p => p.uploading);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Capture & Ingest</h1>
          <p className="text-sm text-[#94a3b8]">Upload original team-collected images to the dataset</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Dataset ID"
            value={datasetId}
            onChange={e => setDatasetId(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#111827] border border-[#2a3550] text-[#e2e8f0] w-48 focus:outline-none focus:border-blue-500"
          />
          <button className="btn-secondary text-xs" onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}>
            {viewMode === "grid" ? "Table View" : "Grid View"}
          </button>
        </div>
      </div>

      {/* Upload Zone */}
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
        <input
          ref={folderInputRef}
          type="file"
          multiple
          /* @ts-expect-error webkitdirectory is non-standard */
          webkitdirectory=""
          className="hidden"
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
        />
        <Upload className="w-12 h-12 text-[#64748b] mx-auto mb-3" />
        <h3 className="text-sm font-semibold mb-1">Drag & Drop Images</h3>
        <p className="text-xs text-[#64748b] mb-3">Supports JPG, PNG, JPEG — Batch upload supported</p>
        <div className="flex gap-2 justify-center" onClick={e => e.stopPropagation()}>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3 h-3" /> Browse Files
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => folderInputRef.current?.click()}>
            <FolderOpen className="w-3 h-3" /> Upload Folder
          </button>
          <button className="btn-secondary text-xs flex items-center gap-1" disabled>
            <Camera className="w-3 h-3" /> Camera Capture
          </button>
        </div>
        {!datasetId && (
          <p className="text-[10px] text-amber-400 mt-3">Enter a Dataset ID above before uploading</p>
        )}
        <p className="text-[10px] text-[#64748b] mt-3">All images must be originally captured by the team. No external/scraped images.</p>
      </div>

      {/* Pending Uploads */}
      {pendingFiles.length > 0 && (
        <div className="glass-card-solid p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">
              Queued Files ({pendingFiles.length})
            </h3>
            <div className="flex gap-2">
              <button
                className="btn-primary text-[10px] px-3 py-1 flex items-center gap-1"
                onClick={uploadAll}
                disabled={isUploading || !datasetId}
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {isUploading ? "Uploading..." : "Upload All"}
              </button>
              <button className="btn-secondary text-[10px] px-3 py-1" onClick={clearCompleted}>
                Clear Done
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-auto">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="relative rounded-lg overflow-hidden bg-[#111827] border border-[#2a3550]">
                <div className="aspect-square relative">
                  <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
                  {pf.done && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                  )}
                  {pf.error && (
                    <div className="absolute inset-0 bg-rose-500/20 flex items-center justify-center">
                      <XCircle className="w-8 h-8 text-rose-400" />
                    </div>
                  )}
                  {pf.uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                  )}
                  <button
                    className="absolute top-1 right-1 p-0.5 rounded bg-black/60 hover:bg-black/80"
                    onClick={() => removePending(idx)}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="p-1.5">
                  <p className="text-[9px] font-mono truncate text-[#94a3b8]">{pf.file.name}</p>
                  <p className="text-[8px] text-[#64748b]">{formatSize(pf.file.size)}</p>
                </div>
                {pf.uploading && (
                  <div className="progress-bar mx-1.5 mb-1.5">
                    <div className="progress-fill" style={{ width: `${pf.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Image, label: "Total Images", value: imagesLoading ? "..." : images.length, color: "text-blue-400" },
          { icon: CheckCircle2, label: "Quality OK", value: imagesLoading ? "..." : qualityOkCount, color: "text-emerald-400" },
          { icon: AlertTriangle, label: "Review", value: imagesLoading ? "..." : qualityReviewCount, color: "text-amber-400" },
          { icon: XCircle, label: "Rejected", value: imagesLoading ? "..." : qualityRejectCount, color: "text-rose-400" },
        ].map(s => (
          <div key={s.label} className="metric-card flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div><p className="text-lg font-bold">{s.value}</p><p className="text-[10px] text-[#64748b]">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Content Area */}
      {!datasetId ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
          <Database className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-semibold uppercase tracking-wider">Enter a Dataset ID to load images</p>
        </div>
      ) : imagesLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : imagesError ? (
        <div className="flex flex-col items-center justify-center py-16 text-rose-400">
          <XCircle className="w-6 h-6 mb-2" />
          <p className="text-xs">{imagesError}</p>
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
          <Image className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs font-semibold uppercase tracking-wider">NO IMAGES</p>
          <p className="text-[10px] mt-1">Upload images using the area above</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {images.map(img => (
            <div key={img.id} className="glass-card-solid overflow-hidden group cursor-pointer">
              <div className="aspect-square bg-[#111827] flex items-center justify-center relative">
                {img.filepath ? (
                  <img
                    src={`/api/serve/${img.datasetId}/${img.filename}`}
                    alt={img.originalFilename ?? img.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a2235] to-[#0d1220] flex items-center justify-center">
                    <Image className="w-8 h-8 text-[#2a3550]" />
                  </div>
                )}
                <span className={`absolute top-1 right-1 w-3 h-3 rounded-full ${
                  img.qualityStatus === "green" ? "bg-emerald-500" :
                  img.qualityStatus === "yellow" ? "bg-amber-500" :
                  img.qualityStatus === "red" ? "bg-rose-500" :
                  "bg-[#64748b]"
                }`} />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button className="p-1.5 rounded bg-rose-500/20 text-rose-400 text-[10px]" onClick={() => handleDeleteImage(img.id)}>
                    Del
                  </button>
                </div>
              </div>
              <div className="p-2">
                <p className="text-[10px] font-mono truncate" title={img.originalFilename ?? img.filename}>
                  {img.originalFilename ?? img.filename}
                </p>
                <p className="text-[9px] text-[#64748b]">{img.resolution ?? "—"}</p>
                <p className="text-[8px] text-[#475569]">{formatSize(img.fileSize)}</p>
                {img.imageHash && <p className="text-[8px] text-[#475569] font-mono truncate" title={img.imageHash}>sha256: {img.imageHash.substring(0, 16)}...</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card-solid overflow-auto">
          <table className="data-table">
            <thead>
              <tr><th>Filename</th><th>Resolution</th><th>Size</th><th>Hash</th><th>Annotated</th><th>Quality</th></tr>
            </thead>
            <tbody>
              {images.map(img => (
                <tr key={img.id}>
                  <td className="font-mono text-xs truncate max-w-[200px]" title={img.originalFilename ?? img.filename}>
                    {img.originalFilename ?? img.filename}
                  </td>
                  <td className="text-xs">{img.resolution ?? "—"}</td>
                  <td className="text-xs">{formatSize(img.fileSize)}</td>
                  <td className="text-[9px] font-mono truncate max-w-[120px] text-[#64748b]" title={img.imageHash ?? ""}>
                    {img.imageHash ? `${img.imageHash.substring(0, 12)}...` : "—"}
                  </td>
                  <td>
                    {img.annotationStatus === "annotated" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </td>
                  <td>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      img.qualityStatus === "green" ? "badge-success" :
                      img.qualityStatus === "yellow" ? "badge-warning" :
                      img.qualityStatus === "red" ? "badge-error" :
                      "badge-neutral"
                    }`}>
                      {img.qualityStatus === "green" ? "OK" :
                       img.qualityStatus === "yellow" ? "Review" :
                       img.qualityStatus === "red" ? "Reject" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
