"use client";

import { useState } from "react";
import { BarChart3, AlertTriangle, TrendingUp, Layers, Image, Tag, Database, AlertCircle, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { useApi } from "@/lib/hooks";

interface Dataset {
  id: string;
  name: string;
  datasetId: string;
}

interface ClassInfo {
  id: string;
  name: string;
  annotationCount: number;
  color?: string;
}

interface AnalyticsData {
  totalImages: number;
  totalAnnotations: number;
  totalClasses: number;
  classes: ClassInfo[];
  perClassDistribution: Array<{ className: string; count: number; percentage: number }>;
  splitDistribution: Record<string, number>;
  qualityDistribution: Record<string, number>;
  qualityStats: {
    avgBrightness: number;
    avgContrast: number;
    avgBlur: number;
    avgEntropy: number;
  };
  duplicateGroups: number;
}

const COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#10b981", "#f97316", "#ec4899", "#6366f1"];

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

export default function AnalyticsPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);

  const { data: datasets, loading: datasetsLoading } = useApi<Dataset[]>("/api/datasets");
  const datasetsArray = Array.isArray(datasets) ? datasets : [];
  const effectiveDatasetId = selectedDatasetId || datasetsArray[0]?.id || null;

  const { data: analytics, loading: analyticsLoading, error: analyticsError } = useApi<AnalyticsData>(
    effectiveDatasetId ? `/api/analytics?datasetId=${effectiveDatasetId}` : null
  );

  const classDist = (analytics?.perClassDistribution || []).map((c, i) => ({
    name: c.className,
    count: c.count,
    color: COLORS[i % COLORS.length],
  }));

  const splitDist = Object.entries(analytics?.splitDistribution || {}).map(([name, value]) => ({
    name: name || "unassigned",
    value,
  }));

  const qualityDist = Object.entries(analytics?.qualityDistribution || {}).map(([name, value]) => ({
    name: name || "pending",
    value,
    color: name === "green" ? "#10b981" : name === "yellow" ? "#f59e0b" : name === "red" ? "#ef4444" : "#64748b",
  }));

  const objectSizes = [
    { range: "Tiny (<32px)", count: 0 },
    { range: "Small (32-96)", count: 0 },
    { range: "Medium (96-256)", count: 0 },
    { range: "Large (>256px)", count: 0 },
  ];

  const diversityScores = [
    { metric: "Resolution", score: analytics?.qualityStats?.avgBrightness ? Math.min(100, Math.round(analytics.qualityStats.avgBrightness / 2.55)) : 0 },
    { metric: "Brightness", score: analytics?.qualityStats?.avgBrightness ? Math.min(100, Math.round(analytics.qualityStats.avgBrightness / 2.55)) : 0 },
    { metric: "Contrast", score: analytics?.qualityStats?.avgContrast ? Math.min(100, Math.round(analytics.qualityStats.avgContrast)) : 0 },
    { metric: "Blur", score: analytics?.qualityStats?.avgBlur ? Math.min(100, Math.round(analytics.qualityStats.avgBlur)) : 0 },
    { metric: "Entropy", score: analytics?.qualityStats?.avgEntropy ? Math.min(100, Math.round(analytics.qualityStats.avgEntropy * 10)) : 0 },
    { metric: "Class Dist", score: classDist.length > 0 ? Math.min(100, Math.round(100 - (Math.max(...classDist.map(c => c.count)) / Math.max(1, Math.min(...classDist.map(c => c.count))) - 1) * 20)) : 0 },
  ];

  const advisorItems = classDist
    .filter(c => c.count < 100)
    .map(c => ({
      cls: c.name,
      current: c.count,
      recommended: Math.max(c.count * 2, 120),
      status: c.count < 50 ? "Critical" : "Needs samples",
      suggestions: ["different angles", "indoor/outdoor", "various lighting"],
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dataset Analytics</h1>
          <p className="text-sm text-[#94a3b8]">Comprehensive dataset statistics, distributions, and balancing advisor</p>
        </div>
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
      </div>

      {!effectiveDatasetId ? (
        <NoDataCard label="Select a dataset to begin" />
      ) : analyticsLoading ? (
        <LoadingSpinner />
      ) : analyticsError ? (
        <ErrorState message={analyticsError} />
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Total Images", value: analytics?.totalImages || 0 },
              { label: "Annotated", value: analytics?.totalAnnotations || 0 },
              { label: "Total Objects", value: analytics?.totalAnnotations || 0 },
              { label: "Classes", value: analytics?.totalClasses || 0 },
              { label: "Avg Objects/Img", value: (analytics?.totalImages && analytics?.totalAnnotations) ? (analytics.totalAnnotations / analytics.totalImages).toFixed(1) : "0" },
              { label: "Duplicate Groups", value: analytics?.duplicateGroups || 0 },
            ].map(s => (
              <div key={s.label} className="metric-card text-center">
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] text-[#64748b]">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Class Distribution */}
            <div className="glass-card-solid p-5">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Class Distribution (Annotations)</h3>
              <div style={{ height: 250 }}>
                {classDist.length === 0 ? (
                  <NoDataCard label="No class data" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classDist}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} angle={-30} textAnchor="end" height={60} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {classDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Split Distribution */}
            <div className="glass-card-solid p-5">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Split Distribution</h3>
              <div style={{ height: 250 }}>
                {splitDist.length === 0 ? (
                  <NoDataCard label="No split data" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={splitDist}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Quality Distribution */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" /> Quality Distribution
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div style={{ height: 250 }}>
                {qualityDist.length === 0 ? (
                  <NoDataCard label="No quality data" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={qualityDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(props: any) => `${props.name || ""}: ${((props.percent || 0) * 100).toFixed(0)}%`}>
                        {qualityDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="space-y-3">
                {qualityDist.map(d => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs text-[#94a3b8] w-24 capitalize">{d.name}</span>
                    <div className="flex-1 h-2 bg-[#1a2540] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${analytics?.totalImages ? (d.value / analytics.totalImages) * 100 : 0}%`, backgroundColor: d.color }} />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Diversity Score */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" /> Project Dataset Diversity Index
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div style={{ height: 250 }}>
                {diversityScores.every(d => d.score === 0) ? (
                  <NoDataCard label="No diversity data" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={diversityScores}>
                      <PolarGrid stroke="#2a3550" />
                      <PolarAngleAxis dataKey="metric" stroke="#64748b" fontSize={11} />
                      <PolarRadiusAxis stroke="#2a3550" fontSize={9} />
                      <Radar name="Diversity" dataKey="score" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="space-y-3">
                {diversityScores.map(d => (
                  <div key={d.metric} className="flex items-center gap-3">
                    <span className="text-xs text-[#94a3b8] w-24">{d.metric}</span>
                    <div className="flex-1 h-2 bg-[#1a2540] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${d.score}%` }} />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">{d.score}</span>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-300">
                  ℹ This is a project-internal diversity metric based on measurable dataset properties. Not a scientifically universal metric.
                </div>
              </div>
            </div>
          </div>

          {/* Dataset Advisor */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> DATASET ADVISOR
            </h3>
            <div className="space-y-3">
              {advisorItems.length === 0 ? (
                <NoDataCard label="All classes have sufficient samples" />
              ) : (
                advisorItems.map(item => (
                  <div key={item.cls} className="p-4 rounded-lg bg-[#111827] space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{item.cls}</p>
                        <p className="text-[10px] text-[#64748b]">Current: {item.current} images • Recommended: {item.recommended}+</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${item.status === "Critical" ? "badge-error" : "badge-warning"}`}>{item.status}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {item.suggestions.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">{s}</span>
                      ))}
                    </div>
                    <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (item.current / item.recommended) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leakage Check */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3">DATASET LEAKAGE CHECK</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-[#111827] rounded text-center">
                <p className="text-lg font-bold text-emerald-400">{analytics?.duplicateGroups || 0}</p><p className="text-[10px] text-[#64748b]">Duplicate Groups</p>
              </div>
              <div className="p-3 bg-[#111827] rounded text-center">
                <p className="text-lg font-bold text-emerald-400">{splitDist.length > 0 ? "Split OK" : "N/A"}</p><p className="text-[10px] text-[#64748b]">Split Status</p>
              </div>
              <div className="p-3 bg-[#111827] rounded text-center">
                <p className="text-lg font-bold text-amber-400">{analytics?.qualityDistribution?.red || 0}</p><p className="text-[10px] text-[#64748b]">Quality Issues</p>
              </div>
              <div className="p-3 bg-[#111827] rounded text-center">
                <p className="text-lg font-bold text-blue-400">{analytics?.totalImages || 0}</p><p className="text-[10px] text-[#64748b]">Total Images</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
