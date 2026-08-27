"use client";

import { BarChart3, AlertTriangle, TrendingUp, Layers, Image, Tag } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

const classDist = [
  { name: "Clay Diya", count: 312, color: "#f59e0b" },
  { name: "Brass Diya", count: 278, color: "#ef4444" },
  { name: "Hanging Diya", count: 198, color: "#8b5cf6" },
  { name: "Multi-wick", count: 167, color: "#06b6d4" },
  { name: "Kuthu Vilakku", count: 245, color: "#10b981" },
  { name: "Temple Bell", count: 156, color: "#f97316" },
  { name: "Incense Holder", count: 134, color: "#ec4899" },
  { name: "Ritual Plate", count: 118, color: "#6366f1" },
];

const objectSizes = [
  { range: "Tiny (<32px)", count: 245 },
  { range: "Small (32-96)", count: 890 },
  { range: "Medium (96-256)", count: 1560 },
  { range: "Large (>256px)", count: 1523 },
];

const diversityScores = [
  { metric: "Resolution", score: 82 },
  { metric: "Brightness", score: 75 },
  { metric: "Scale", score: 68 },
  { metric: "Viewpoint", score: 71 },
  { metric: "Background", score: 65 },
  { metric: "Class Dist", score: 72 },
];

const advisorItems = [
  { cls: "Temple Bell", current: 84, recommended: 150, status: "Needs samples", suggestions: ["outdoor", "low light", "side angle", "partial occlusion", "different backgrounds"] },
  { cls: "Camphor Holder", current: 53, recommended: 120, status: "Critical", suggestions: ["all angles", "indoor/outdoor", "various lighting", "with other objects"] },
  { cls: "Ritual Plate", current: 68, recommended: 120, status: "Needs samples", suggestions: ["top view", "with contents", "different materials", "various sizes"] },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dataset Analytics</h1>
        <p className="text-sm text-[#94a3b8]">Comprehensive dataset statistics, distributions, and balancing advisor</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Total Images", value: 763 },
          { label: "Annotated", value: 744 },
          { label: "Total Objects", value: 4218 },
          { label: "Classes", value: 8 },
          { label: "Avg Objects/Img", value: 5.5 },
          { label: "Imbalance Ratio", value: "2.6:1" },
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
          </div>
        </div>

        {/* Object Size Distribution */}
        <div className="glass-card-solid p-5">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Object Size Distribution</h3>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={objectSizes}>
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={diversityScores}>
                <PolarGrid stroke="#2a3550" />
                <PolarAngleAxis dataKey="metric" stroke="#64748b" fontSize={11} />
                <PolarRadiusAxis stroke="#2a3550" fontSize={9} />
                <Radar name="Diversity" dataKey="score" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
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
          {advisorItems.map(item => (
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
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(item.current / item.recommended) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leakage Check */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">DATASET LEAKAGE CHECK</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-[#111827] rounded text-center">
            <p className="text-lg font-bold text-emerald-400">0</p><p className="text-[10px] text-[#64748b]">Exact Duplicates</p>
          </div>
          <div className="p-3 bg-[#111827] rounded text-center">
            <p className="text-lg font-bold text-emerald-400">0</p><p className="text-[10px] text-[#64748b]">Near Dup Across Splits</p>
          </div>
          <div className="p-3 bg-[#111827] rounded text-center">
            <p className="text-lg font-bold text-amber-400">3</p><p className="text-[10px] text-[#64748b]">Sequence Leakage</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-center">
            <p className="text-sm font-bold text-amber-400">REVIEW REQUIRED</p><p className="text-[10px] text-[#64748b]">Status</p>
          </div>
        </div>
      </div>
    </div>
  );
}
