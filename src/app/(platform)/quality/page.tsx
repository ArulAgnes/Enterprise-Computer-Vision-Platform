"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Eye, Copy, Search, Filter, Image, Layers, Database, AlertCircle, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useApi, apiPost } from "@/lib/hooks";

interface Dataset {
  id: string;
  name: string;
  datasetId: string;
}

interface QualityReport {
  id: string;
  imageId: string;
  datasetId: string;
  brightness: number;
  contrast: number;
  blurScore: number;
  sharpness: number;
  noiseEstimate: number;
  entropy: number;
  exposureEstimate: number;
  aspectRatio: number;
  isBlurry: boolean;
  isDark: boolean;
  isOverexposed: boolean;
  isTiny: boolean;
  isCorrupt: boolean;
  isDuplicate: boolean;
  qualityScore: number;
  qualityFlag: string;
  reviewNotes?: string;
}

interface DuplicateGroup {
  id: string;
  datasetId: string;
  groupType: string;
  similarityScore: number;
  imageIds: string[];
}

interface QualityResponse {
  reports: QualityReport[];
  total: number;
}

interface DuplicateResponse {
  groups: DuplicateGroup[];
  total: number;
}

interface AnalysisResult {
  analyzed: number;
  results: Array<{
    imageId: string;
    filename: string;
    brightness: number;
    contrast: number;
    blurScore: number;
    entropy: number;
    qualityScore: number;
    qualityFlag: string;
    isBlurry: boolean;
    isDark: boolean;
    isOverexposed: boolean;
    isTiny: boolean;
    isCorrupt: boolean;
    error?: string;
  }>;
}

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

export default function QualityPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: datasets, loading: datasetsLoading } = useApi<Dataset[]>("/api/datasets");

  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const effectiveDatasetId = selectedDatasetId || datasetsArray[0]?.id || null;

  const { data: qualityData, loading: qualityLoading, error: qualityError, refetch: refetchQuality } = useApi<QualityResponse>(
    effectiveDatasetId ? `/api/quality?datasetId=${effectiveDatasetId}` : null
  );

  const { data: duplicateData, loading: duplicateLoading, error: duplicateError, refetch: refetchDuplicates } = useApi<DuplicateResponse>(
    effectiveDatasetId ? `/api/duplicates?datasetId=${effectiveDatasetId}` : null
  );

  const reports = qualityData?.reports || [];
  const groups = duplicateData?.groups || [];

  const greenCount = reports.filter(r => r.qualityFlag === "green").length;
  const yellowCount = reports.filter(r => r.qualityFlag === "yellow").length;
  const redCount = reports.filter(r => r.qualityFlag === "red").length;
  const totalReviewed = greenCount + yellowCount + redCount;
  const healthScore = totalReviewed > 0 ? ((greenCount / totalReviewed) * 100).toFixed(1) : "0.0";

  const qualityMetrics = [
    { name: "Brightness", good: reports.filter(r => !r.isDark).length, review: 0, bad: reports.filter(r => r.isDark).length },
    { name: "Contrast", good: reports.filter(r => r.contrast > 30).length, review: 0, bad: reports.filter(r => r.contrast <= 30).length },
    { name: "Blur", good: reports.filter(r => !r.isBlurry).length, review: 0, bad: reports.filter(r => r.isBlurry).length },
    { name: "Noise", good: reports.filter(r => r.noiseEstimate < 15).length, review: 0, bad: reports.filter(r => r.noiseEstimate >= 15).length },
    { name: "Entropy", good: reports.filter(r => r.entropy > 4).length, review: 0, bad: reports.filter(r => r.entropy <= 4).length },
    { name: "Exposure", good: reports.filter(r => !r.isOverexposed).length, review: 0, bad: reports.filter(r => r.isOverexposed).length },
  ];

  const flaggedImages = reports
    .filter(r => r.qualityFlag === "red" || r.qualityFlag === "yellow")
    .map(r => ({
      imageId: r.imageId,
      reason: r.isBlurry ? "Blurry" : r.isDark ? "Very dark" : r.isOverexposed ? "Overexposed" : r.isTiny ? "Tiny image" : r.isCorrupt ? "Corrupt" : "Low quality",
      flag: r.qualityFlag,
      score: r.qualityScore,
    }))
    .slice(0, 10);

  const duplicateDisplayGroups = groups.map((g, i) => ({
    id: i + 1,
    type: g.groupType === "exact" ? "Exact" : "Near",
    imageCount: Array.isArray(g.imageIds) ? g.imageIds.length : 0,
    similarity: g.similarityScore / 100,
  }));

  const handleRunAnalysis = async () => {
    if (!effectiveDatasetId) return;
    setAnalyzing(true);
    try {
      await apiPost("/api/quality", { datasetId: effectiveDatasetId });
      await refetchQuality();
      await refetchDuplicates();
    } catch (err) {
      console.error("Quality analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Quality Control</h1>
          <p className="text-sm text-[#94a3b8]">Image quality analysis, duplicate detection, and validation</p>
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
          <button
            className="btn-primary text-xs flex items-center gap-1"
            onClick={handleRunAnalysis}
            disabled={!effectiveDatasetId || analyzing}
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {analyzing ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </div>

      {!effectiveDatasetId ? (
        <NoDataCard label="Select a dataset to begin" />
      ) : qualityLoading || duplicateLoading ? (
        <LoadingSpinner />
      ) : qualityError || duplicateError ? (
        <ErrorState message={qualityError || duplicateError || "Failed to load data"} />
      ) : (
        <>
          {/* Health Score */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { icon: CheckCircle2, label: "Acceptable", value: greenCount, color: "text-emerald-400" },
              { icon: AlertTriangle, label: "Review", value: yellowCount, color: "text-amber-400" },
              { icon: XCircle, label: "Reject", value: redCount, color: "text-rose-400" },
              { icon: Copy, label: "Duplicates", value: groups.length, color: "text-violet-400" },
              { icon: ShieldCheck, label: "Health Score", value: `${healthScore}%`, color: "text-blue-400" },
            ].map(s => (
              <div key={s.label} className="metric-card text-center">
                <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] text-[#64748b]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Quality Distribution Chart */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">Quality Distribution by Metric</h3>
            <div style={{ height: 250 }}>
              {reports.length === 0 ? (
                <NoDataCard label="No quality reports" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qualityMetrics}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="good" stackId="a" fill="#10b981" name="Good" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="review" stackId="a" fill="#f59e0b" name="Review" />
                    <Bar dataKey="bad" stackId="a" fill="#ef4444" name="Bad" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Flagged Images */}
            <div className="glass-card-solid p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Flagged Images
              </h3>
              <div className="space-y-2">
                {flaggedImages.length === 0 ? (
                  <NoDataCard label="No flagged images" />
                ) : (
                  flaggedImages.map(img => (
                    <div key={img.imageId} className="flex items-center justify-between p-2 rounded-lg bg-[#111827]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${img.flag === "red" ? "bg-rose-500" : "bg-amber-500"}`} />
                        <div>
                          <p className="text-xs font-mono">{img.imageId.slice(0, 8)}...</p>
                          <p className="text-[10px] text-[#64748b]">{img.reason} (Score: {img.score})</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button className="text-[10px] px-2 py-0.5 rounded badge-success">Keep</button>
                        <button className="text-[10px] px-2 py-0.5 rounded badge-error">Reject</button>
                        <button className="text-[10px] px-2 py-0.5 rounded badge-info">Review</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Duplicate Groups */}
            <div className="glass-card-solid p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Copy className="w-4 h-4 text-violet-400" /> Duplicate Detection
              </h3>
              <div className="space-y-3">
                {duplicateDisplayGroups.length === 0 ? (
                  <NoDataCard label="No duplicate groups found" />
                ) : (
                  duplicateDisplayGroups.map(group => (
                    <div key={group.id} className="p-3 rounded-lg bg-[#111827] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Duplicate Group #{group.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${group.type === "Exact" ? "badge-error" : "badge-warning"}`}>
                          {group.type} — Similarity: {(group.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-[#94a3b8] pl-3">• {group.imageCount} images in group</p>
                      <div className="flex gap-1 pt-1">
                        <button className="text-[10px] px-2 py-0.5 rounded badge-success">Keep First</button>
                        <button className="text-[10px] px-2 py-0.5 rounded badge-info">Keep Both</button>
                        <button className="text-[10px] px-2 py-0.5 rounded badge-warning">Manual Review</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300">
                ✅ SHA-256 for exact duplicates • Perceptual hashing for near-duplicates
              </div>
            </div>
          </div>

          {/* Annotation Validation */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" /> Annotation Health
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center"><p className="text-2xl font-bold">{reports.length}</p><p className="text-[10px] text-[#64748b]">Total Reports</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-emerald-400">{greenCount}</p><p className="text-[10px] text-[#64748b]">Valid</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-rose-400">{redCount}</p><p className="text-[10px] text-[#64748b]">Invalid</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-amber-400">{yellowCount}</p><p className="text-[10px] text-[#64748b]">Review</p></div>
              <div className="text-center"><p className="text-2xl font-bold gradient-text">{healthScore}%</p><p className="text-[10px] text-[#64748b]">Health Score</p></div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-rose-400">{reports.filter(r => r.isCorrupt).length}</p><p className="text-[#64748b]">Corrupt</p></div>
              <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-rose-400">{reports.filter(r => r.isBlurry).length}</p><p className="text-[#64748b]">Blurry</p></div>
              <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-amber-400">{reports.filter(r => r.isDark).length}</p><p className="text-[#64748b]">Dark</p></div>
              <div className="p-2 bg-[#111827] rounded text-center"><p className="font-bold text-amber-400">{reports.filter(r => r.isOverexposed).length}</p><p className="text-[#64748b]">Overexposed</p></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
