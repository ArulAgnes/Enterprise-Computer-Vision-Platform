"use client";

import {
  Database, Image, Tag, ShieldCheck, Brain, FlaskConical, Target, ScanSearch,
  AlertTriangle, Box, FileText, TrendingUp, Clock, CheckCircle2, XCircle,
  AlertCircle, ArrowRight, Zap, Activity, Layers, Eye, Camera
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

const classDistribution = [
  { name: "Clay Diya", count: 145, color: "#f59e0b" },
  { name: "Brass Diya", count: 128, color: "#ef4444" },
  { name: "Hanging Diya", count: 97, color: "#8b5cf6" },
  { name: "Kuthu Vilakku", count: 112, color: "#06b6d4" },
  { name: "Temple Bell", count: 84, color: "#10b981" },
  { name: "Incense Holder", count: 76, color: "#f97316" },
  { name: "Ritual Plate", count: 68, color: "#ec4899" },
  { name: "Camphor Holder", count: 53, color: "#6366f1" },
];

const trainingHistory = [
  { epoch: 1, trainLoss: 4.8, valLoss: 5.1, precision: 0.05, recall: 0.03 },
  { epoch: 10, trainLoss: 3.2, valLoss: 3.5, precision: 0.22, recall: 0.18 },
  { epoch: 20, trainLoss: 2.1, valLoss: 2.4, precision: 0.41, recall: 0.35 },
  { epoch: 30, trainLoss: 1.5, valLoss: 1.8, precision: 0.55, recall: 0.48 },
  { epoch: 40, trainLoss: 1.1, valLoss: 1.4, precision: 0.64, recall: 0.57 },
  { epoch: 50, trainLoss: 0.85, valLoss: 1.15, precision: 0.71, recall: 0.63 },
];

const qualityData = [
  { name: "Acceptable", value: 643, color: "#10b981" },
  { name: "Review", value: 87, color: "#f59e0b" },
  { name: "Reject", value: 33, color: "#ef4444" },
];

const splitData = [
  { name: "Train", value: 539, color: "#3b82f6" },
  { name: "Validation", value: 116, color: "#8b5cf6" },
  { name: "Test", value: 108, color: "#10b981" },
];

const recentActivity = [
  { time: "2 min ago", action: "Quality analysis completed", category: "QUALITY", status: "success" },
  { time: "15 min ago", action: "Duplicate detection scan finished", category: "DATASET", status: "success" },
  { time: "1 hr ago", action: "Annotation validation passed", category: "ANNOTATION", status: "success" },
  { time: "2 hrs ago", action: "Dataset split updated (70/15/15)", category: "DATASET", status: "info" },
  { time: "5 hrs ago", action: "Class 'Camphor Holder' added", category: "DATASET", status: "info" },
  { time: "1 day ago", action: "3 images flagged for review", category: "QUALITY", status: "warning" },
];

function MetricCard({ icon: Icon, label, value, sub, trend, color = "blue" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
    cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/20",
    emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20",
    amber: "from-amber-500/20 to-amber-600/10 border-amber-500/20",
    rose: "from-rose-500/20 to-rose-600/10 border-rose-500/20",
    violet: "from-violet-500/20 to-violet-600/10 border-violet-500/20",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-400", cyan: "text-cyan-400", emerald: "text-emerald-400",
    amber: "text-amber-400", rose: "text-rose-400", violet: "text-violet-400",
  };
  return (
    <div className={`metric-card bg-gradient-to-br ${colorMap[color]} border`}>
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${iconColor[color]}`} />
        {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-400" />}
        {trend === "down" && <TrendingUp className="w-4 h-4 text-rose-400 rotate-180" />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[#94a3b8] mt-1">{label}</p>
      {sub && <p className="text-[10px] text-[#64748b] mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusItem({ label, score, maxScore = 100 }: { label: string; score: number; maxScore?: number }) {
  const pct = (score / maxScore) * 100;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[#94a3b8]">{label}</span>
        <span className="font-mono font-semibold">{score}</span>
      </div>
      <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-cyan-600/5 to-emerald-600/5" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">VISIONBHARAT</h1>
              <p className="text-xs text-[#94a3b8]">India-Centric Dataset Engineering & From-Scratch Computer Vision Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4 text-xs text-[#94a3b8]">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-400" /> System Active</span>
            <span className="flex items-center gap-1"><Database className="w-3 h-3 text-blue-400" /> Dataset: DIYA-2026-v0.3</span>
            <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /> Model: VB-CV-01</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-amber-400" /> Demo Mode</span>
          </div>
        </div>
      </div>

      {/* Dataset Status */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" /> DATASET STATUS
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard icon={Image} label="Total Images" value={763} sub="643 acceptable" color="blue" trend="up" />
          <MetricCard icon={Tag} label="Annotations" value="4,218" sub="Avg 5.5/img" color="cyan" trend="up" />
          <MetricCard icon={Layers} label="Classes" value={8} sub="India-centric" color="violet" />
          <MetricCard icon={ShieldCheck} label="Health Score" value="94.8%" sub="7 invalid" color="emerald" />
          <MetricCard icon={Eye} label="Annotated" value="97.5%" sub="19 unannotated" color="amber" />
          <MetricCard icon={AlertCircle} label="Duplicates" value={12} sub="3 near-dup" color="rose" trend="down" />
        </div>
      </div>

      {/* Model & Experiment Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Status */}
        <div className="glass-card-solid p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" /> MODEL STATUS
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
              <div>
                <p className="text-sm font-semibold font-mono">VB-CV-01</p>
                <p className="text-[10px] text-[#64748b]">Custom CNN Detector — From Scratch</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded badge-warning">Candidate</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-[#111827] rounded">
                <p className="text-lg font-bold text-blue-400">0.71</p>
                <p className="text-[10px] text-[#64748b]">Precision</p>
              </div>
              <div className="text-center p-2 bg-[#111827] rounded">
                <p className="text-lg font-bold text-cyan-400">0.63</p>
                <p className="text-[10px] text-[#64748b]">Recall</p>
              </div>
              <div className="text-center p-2 bg-[#111827] rounded">
                <p className="text-lg font-bold text-emerald-400">0.67</p>
                <p className="text-[10px] text-[#64748b]">F1</p>
              </div>
              <div className="text-center p-2 bg-[#111827] rounded">
                <p className="text-lg font-bold text-amber-400">0.58</p>
                <p className="text-[10px] text-[#64748b]">IoU</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748b]">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Random weight initialization — No pretrained weights</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748b]">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Trained exclusively on team-collected dataset</span>
            </div>
          </div>
        </div>

        {/* Experiment Status */}
        <div className="glass-card-solid p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-cyan-400" /> EXPERIMENT STATUS
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
              <div>
                <p className="text-sm font-semibold font-mono">EXP-2026-003</p>
                <p className="text-[10px] text-[#64748b]">Residual + Multi-scale — 50 epochs</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded badge-success">Best</span>
            </div>
            <div className="overflow-auto" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trainingHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                  <XAxis dataKey="epoch" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="trainLoss" stroke="#3b82f6" strokeWidth={2} dot={false} name="Train Loss" />
                  <Line type="monotone" dataKey="valLoss" stroke="#f59e0b" strokeWidth={2} dot={false} name="Val Loss" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="text-center text-[#64748b]">3 experiments</div>
              <div className="text-center text-[#64748b]">50 epochs (best)</div>
              <div className="text-center text-[#64748b]">CPU training</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Distribution */}
        <div className="glass-card-solid p-5">
          <h3 className="text-xs font-semibold mb-3 text-[#94a3b8] uppercase tracking-wider">Class Distribution</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classDistribution} layout="vertical">
                <XAxis type="number" stroke="#64748b" fontSize={10} />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={9} width={90} />
                <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {classDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Class imbalance detected — Temple Bell & Camphor Holder need more samples
          </div>
        </div>

        {/* Quality Distribution */}
        <div className="glass-card-solid p-5">
          <h3 className="text-xs font-semibold mb-3 text-[#94a3b8] uppercase tracking-wider">Image Quality</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={qualityData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {qualityData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-[10px]">
            {qualityData.map(d => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-[#94a3b8]">{d.name}: {d.value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Split Distribution */}
        <div className="glass-card-solid p-5">
          <h3 className="text-xs font-semibold mb-3 text-[#94a3b8] uppercase tracking-wider">Train/Val/Test Split</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={splitData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {splitData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a2235", border: "1px solid #2a3550", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-[10px]">
            {splitData.map(d => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-[#94a3b8]">{d.name}: {d.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Competition Readiness + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competition Readiness */}
        <div className="glass-card-solid p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" /> COMPETITION READINESS
          </h2>
          <div className="space-y-3">
            <StatusItem label="Dataset Completeness" score={91} />
            <StatusItem label="Annotation Quality" score={95} />
            <StatusItem label="Class Balance" score={72} />
            <StatusItem label="Model Performance (Val)" score={67} />
            <StatusItem label="Documentation" score={100} />
            <StatusItem label="No Pretrained Weights" score={100} />
          </div>
          <div className="mt-4 p-3 bg-gradient-to-r from-blue-600/10 to-cyan-600/10 rounded-lg border border-blue-500/20 text-center">
            <p className="text-[10px] text-[#94a3b8] uppercase tracking-wider">Project Readiness Score</p>
            <p className="text-3xl font-bold gradient-text mt-1">87.5%</p>
            <p className="text-[10px] text-[#64748b] mt-1">Internal project metric — NOT official competition score</p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card-solid p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> RECENT ACTIVITY
          </h2>
          <div className="space-y-2">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#111827] transition-colors">
                {item.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />}
                {item.status === "info" && <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5" />}
                {item.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-xs">{item.action}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded badge-neutral font-mono">{item.category}</span>
                    <span className="text-[10px] text-[#64748b]">{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" /> END-TO-END PIPELINE
        </h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { label: "CAPTURE", icon: Camera, status: "done" },
            { label: "CURATE", icon: ShieldCheck, status: "done" },
            { label: "VALIDATE", icon: CheckCircle2, status: "done" },
            { label: "TRAIN", icon: Brain, status: "done" },
            { label: "EVALUATE", icon: Target, status: "partial" },
            { label: "DETECT", icon: ScanSearch, status: "partial" },
            { label: "ANALYZE", icon: AlertTriangle, status: "pending" },
            { label: "EXPLAIN", icon: Eye, status: "pending" },
            { label: "DEPLOY", icon: Zap, status: "pending" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2 flex-shrink-0">
              <div className={`flex flex-col items-center p-3 rounded-lg min-w-[80px] ${
                step.status === "done" ? "bg-emerald-500/10 border border-emerald-500/30" :
                step.status === "partial" ? "bg-amber-500/10 border border-amber-500/30" :
                "bg-[#111827] border border-[#2a3550]"
              }`}>
                <step.icon className={`w-4 h-4 mb-1 ${
                  step.status === "done" ? "text-emerald-400" :
                  step.status === "partial" ? "text-amber-400" : "text-[#64748b]"
                }`} />
                <span className={`text-[10px] font-semibold ${
                  step.status === "done" ? "text-emerald-400" :
                  step.status === "partial" ? "text-amber-400" : "text-[#64748b]"
                }`}>{step.label}</span>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-[#2a3550] flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Compliance Quick Check */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> COMPETITION COMPLIANCE QUICK CHECK
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Original team images", ok: true },
            { label: "No pretrained weights", ok: true },
            { label: "No transfer learning", ok: true },
            { label: "No external datasets", ok: true },
            { label: "Random initialization", ok: true },
            { label: "Training from scratch", ok: true },
            { label: "Held-out test set", ok: true },
            { label: "No fake metrics", ok: true },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
              <span className="text-[#94a3b8]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
