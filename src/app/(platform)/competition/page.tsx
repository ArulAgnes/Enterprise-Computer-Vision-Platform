"use client";

import { Trophy, CheckCircle2, AlertCircle, ArrowRight, Database, PenTool, Brain, Target, ScanSearch, Zap } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { PageHeader } from "@/components/workflow";
import Link from "next/link";

interface Dataset {
  id: string;
  name: string;
  datasetId?: string;
  imageCount?: number;
  annotatedCount?: number;
  classCount?: number;
}

interface Model {
  id: string;
  name: string;
  checkpointPath?: string;
  precision?: number;
  recall?: number;
  f1?: number;
}

export default function CompetitionPage() {
  const { state: workflow } = useWorkflowState();
  const { data: datasetsData } = useApi<Dataset[]>("/api/datasets");
  const datasets = Array.isArray(datasetsData) ? datasetsData : [];
  const dataset = datasets[0] ?? null;

  const { data: modelsData } = useApi<{ models: Model[]; total: number }>("/api/models");
  const models = modelsData?.models ?? [];
  const trainedModel = models.find(m => m.checkpointPath);

  const imageCount = dataset?.imageCount ?? 0;
  const annotationCount = dataset?.annotatedCount ?? 0;
  const hasAnnotations = annotationCount > 0;
  const hasTrainedModel = !!trainedModel;
  const hasCheckpoint = hasTrainedModel && !!trainedModel?.checkpointPath;

  const statuses = [
    { label: "Dataset", icon: Database, done: imageCount > 0, detail: `${imageCount} images`, href: "/datasets" },
    { label: "Classes", icon: Zap, done: (dataset?.classCount ?? 0) > 0, detail: `${dataset?.classCount ?? 0} class(es)`, href: "/datasets" },
    { label: "Annotation", icon: PenTool, done: hasAnnotations, detail: `${annotationCount} / ${imageCount} annotated`, blocked: !hasAnnotations && imageCount > 0, href: "/annotation" },
    { label: "Training", icon: Brain, done: hasCheckpoint, detail: hasCheckpoint ? "Model trained" : "Blocked — annotate first", blocked: !hasAnnotations, href: "/training" },
    { label: "Evaluation", icon: Target, done: false, detail: hasCheckpoint ? "Ready to evaluate" : "Blocked", blocked: !hasCheckpoint, href: "/evaluation" },
    { label: "Inference", icon: ScanSearch, done: false, detail: hasCheckpoint ? "Ready to infer" : "Blocked", blocked: !hasCheckpoint, href: "/inference" },
  ];

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <PageHeader title="Competition Mode" subtitle="DATA GENESIS 2026 — Ramco Institute of Technology" step={15} totalSteps={15} />

      {/* Project header */}
      <div className="glass-card-solid p-6 competition-gradient border-blue-500/20">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold gradient-text">VisionBharat</h2>
            <p className="text-xs text-[#94a3b8]">DataGenesis 2026 — From-Scratch Object Detection</p>
            <p className="text-[10px] text-[#64748b] mt-1">Built by Arul Maria Agnes, Ramco Institute of Technology</p>
          </div>
        </div>
      </div>

      {/* Project status */}
      <div className="glass-card-solid p-4">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Project Readiness</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {statuses.map((s) => (
            <Link key={s.label} href={s.href} className="flex items-center gap-3 p-3 rounded-lg bg-[#111827] hover:bg-[#1a2540] transition-colors">
              {s.done ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : s.blocked ? (
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#2a3550] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <s.icon className="w-3 h-3 text-[#64748b]" />
                  <span className={`text-xs font-semibold ${s.done ? "text-emerald-400" : s.blocked ? "text-amber-400" : "text-[#64748b]"}`}>{s.label}</span>
                </div>
                <p className="text-[10px] text-[#64748b] truncate mt-0.5">{s.detail}</p>
              </div>
              <ArrowRight className="w-3 h-3 text-[#64748b] flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Next action */}
      {!hasAnnotations && imageCount > 0 && (
        <div className="glass-card p-4 border-blue-500/30 bg-blue-500/5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <PenTool className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">Next Action</p>
                <h3 className="text-sm font-bold">Annotate {imageCount} human images with bounding boxes</h3>
                <p className="text-xs text-[#94a3b8]">This is the current blocking step. Training cannot proceed without annotations.</p>
              </div>
            </div>
            <Link href="/annotation" className="btn-primary text-xs flex items-center gap-1">
              Open Annotation Studio <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Compliance checklist */}
      <div className="glass-card-solid p-4">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">DataGenesis 2026 Compliance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "No pretrained weights", checked: true },
            { label: "No transfer learning", checked: true },
            { label: "Custom architecture (VisionBharatDetector)", checked: true },
            { label: "Random weight initialization", checked: true },
            { label: "Team-collected dataset", checked: imageCount > 0 },
            { label: "From-scratch training", checked: hasCheckpoint },
            { label: "Real annotations", checked: hasAnnotations },
            { label: "Train/Val/Test split", checked: imageCount > 0 },
            { label: "Quality validation", checked: false },
            { label: "Reproducible results (seed=42)", checked: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-[#111827]">
              {item.checked ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#2a3550] flex-shrink-0" />
              )}
              <span className={`text-xs ${item.checked ? "text-emerald-400" : "text-[#64748b]"}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Technical details */}
      <div className="glass-card-solid p-4">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Technical Stack</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Framework", value: "Next.js 16 + TypeScript" },
            { label: "Database", value: "PostgreSQL + Drizzle" },
            { label: "ML Framework", value: "PyTorch 2.13 (CPU)" },
            { label: "Architecture", value: "Custom CNN (2.67M params)" },
            { label: "Dataset", value: `${imageCount} images` },
            { label: "Classes", value: `${dataset?.classCount ?? 0} (person)` },
            { label: "Training", value: hasCheckpoint ? "Completed" : "Pending annotations" },
            { label: "Model", value: hasCheckpoint ? trainedModel?.name : "Not yet trained" },
          ].map(item => (
            <div key={item.label} className="p-3 bg-[#111827] rounded text-center">
              <p className="text-xs font-bold">{item.value}</p>
              <p className="text-[10px] text-[#64748b]">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
