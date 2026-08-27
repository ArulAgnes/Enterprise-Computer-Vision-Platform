"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Camera, Database, Tag, PenTool, ShieldCheck, Brain, Target, ScanSearch,
  ArrowRight, Zap, CheckCircle2, ArrowUpRight, Upload, Image as ImageIcon
} from "lucide-react";
import { useWorkflowState, type WorkflowState } from "@/lib/useWorkflowState";
import { WorkflowStepper, WORKFLOW_STEPS, NextStepCard, HelpCard, InfoBar } from "@/components/workflow";

const STEP_ACTIONS: Record<number, { label: string; href: string; icon: React.ElementType }> = {
  1: { label: "Open Camera", href: "/capture", icon: Camera },
  2: { label: "Create Dataset", href: "/datasets", icon: Database },
  3: { label: "Add Classes", href: "/datasets", icon: Tag },
  4: { label: "Start Annotating", href: "/annotation", icon: PenTool },
  5: { label: "Run Quality Check", href: "/quality", icon: ShieldCheck },
  6: { label: "Validate Dataset", href: "/quality", icon: ShieldCheck },
  7: { label: "Split Dataset", href: "/datasets", icon: Database },
  8: { label: "Create Version", href: "/datasets", icon: Database },
  9: { label: "Train Model", href: "/training", icon: Brain },
  10: { label: "Evaluate Model", href: "/evaluation", icon: Target },
  11: { label: "Test Inference", href: "/inference", icon: ScanSearch },
  12: { label: "Export to Kaggle", href: "/kaggle", icon: Database },
  13: { label: "Publish Dataset", href: "/kaggle", icon: Database },
  14: { label: "Publish Notebook", href: "/kaggle", icon: Database },
  15: { label: "View Report", href: "/competition", icon: Database },
};

const STEP_MESSAGES: Record<number, string> = {
  1: "You haven't added any images yet. Capture photos with your camera or upload existing team-captured images.",
  2: "Create a dataset to organize your images and annotations.",
  3: "Define the object classes your model should recognize.",
  4: "Draw bounding boxes around objects in your images to teach the model.",
  5: "Check your images for quality issues like blur, darkness, or duplicates.",
  6: "Validate that your dataset structure is correct and ready for training.",
  7: "Split your images into training, validation, and test sets.",
  8: "Create a frozen snapshot of your dataset for reproducibility.",
  9: "Train your model from scratch using your annotated dataset.",
  10: "Measure how well your model performs on unseen test data.",
  11: "Test your trained model on new images.",
  12: "Export your dataset in Kaggle-compatible format.",
  13: "Publish your dataset to Kaggle for DataGenesis 2026.",
  14: "Generate and publish a Kaggle notebook.",
  15: "View your final competition report.",
};

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="metric-card">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] text-[#64748b]">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { state: workflow, loading } = useWorkflowState();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#64748b]">
        <Zap className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">Failed to load project status</p>
      </div>
    );
  }

  const currentStep = WORKFLOW_STEPS.find(s => s.number === workflow.currentStep);
  const action = STEP_ACTIONS[workflow.currentStep];
  const message = STEP_MESSAGES[workflow.currentStep];
  const progressPct = Math.round((workflow.completedSteps.length / 15) * 100);

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
              <p className="text-xs text-[#94a3b8]">DataGenesis 2026 — Build your dataset, train your model</p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Stepper */}
      <WorkflowStepper currentStep={workflow.currentStep} completedSteps={workflow.completedSteps} />

      {/* Progress Bar */}
      <div className="glass-card-solid p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#94a3b8]">Overall Progress</span>
          <span className="text-xs font-bold text-blue-400">{progressPct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-[10px] text-[#64748b] mt-1">{workflow.completedSteps.length} of 15 steps completed</p>
      </div>

      {/* Current Step - What do I do now? */}
      <div className="glass-card p-6 border-blue-500/30 bg-gradient-to-r from-blue-600/5 to-cyan-600/5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            {currentStep && <currentStep.icon className="w-7 h-7 text-blue-400" />}
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">What to do now</p>
            <h2 className="text-lg font-bold mb-1">
              Step {workflow.currentStep}: {currentStep?.label}
            </h2>
            <p className="text-sm text-[#94a3b8] mb-4">{message}</p>
            {action && (
              <Link href={action.href} className="btn-primary text-sm inline-flex items-center gap-2">
                <action.icon className="w-4 h-4" />
                {action.label}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ImageIcon} label="Images" value={workflow.totalImages} color="text-blue-400" />
        <StatCard icon={Tag} label="Classes" value={workflow.totalClasses} color="text-violet-400" />
        <StatCard icon={PenTool} label="Annotated" value={`${workflow.annotatedImages}/${workflow.totalImages}`} color="text-emerald-400" />
        <StatCard icon={Brain} label="Trained" value={workflow.hasTrainedModel ? "Yes" : "No"} color={workflow.hasTrainedModel ? "text-emerald-400" : "text-[#64748b]"} />
      </div>

      {/* Dataset Summary */}
      {workflow.totalImages > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Your Dataset */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" /> Your Dataset
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
                <span className="text-xs text-[#94a3b8]">Images collected</span>
                <span className="text-sm font-bold">{workflow.totalImages}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
                <span className="text-xs text-[#94a3b8]">Object classes</span>
                <span className="text-sm font-bold">{workflow.totalClasses}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
                <span className="text-xs text-[#94a3b8]">Images annotated</span>
                <span className="text-sm font-bold">{workflow.annotatedImages}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
                <span className="text-xs text-[#94a3b8]">Need annotation</span>
                <span className={`text-sm font-bold ${workflow.unannotatedImages > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {workflow.unannotatedImages}
                </span>
              </div>
            </div>
          </div>

          {/* Next Actions */}
          <div className="glass-card-solid p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-emerald-400" /> What&apos;s Next
            </h3>
            <div className="space-y-2">
              {WORKFLOW_STEPS.slice(0, 7).map(step => {
                const isCompleted = workflow.completedSteps.includes(step.number);
                const isCurrent = step.number === workflow.currentStep;
                return (
                  <Link
                    key={step.id}
                    href={step.href}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                      isCurrent
                        ? "bg-blue-500/10 border border-blue-500/30"
                        : isCompleted
                        ? "bg-emerald-500/5"
                        : "opacity-50"
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isCurrent ? "bg-blue-500 text-white" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-[#1a2540] text-[#64748b]"
                    }`}>
                      {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
                    </div>
                    <span className={`text-xs font-semibold flex-1 ${isCurrent ? "text-blue-400" : isCompleted ? "text-emerald-400" : "text-[#64748b]"}`}>
                      {step.label}
                    </span>
                    {isCurrent && <ArrowRight className="w-3 h-3 text-blue-400" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Compliance */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> DataGenesis 2026 Compliance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Team-created images", ok: workflow.totalImages > 0 },
            { label: "No pretrained weights", ok: true },
            { label: "No transfer learning", ok: true },
            { label: "Random initialization", ok: true },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <div className="w-4 h-4 rounded-full border border-[#64748b]" />}
              <span className="text-[#94a3b8]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Help */}
      <HelpCard title="How this platform works">
        <p className="mb-2">This platform guides you through 15 steps to build a complete computer vision dataset and train a model from scratch.</p>
        <p className="mb-2"><strong>The workflow:</strong> Capture images → Define classes → Annotate objects → Check quality → Split data → Train model → Evaluate → Publish to Kaggle</p>
        <p>Each step must be completed before moving to the next. The progress bar at the top shows your current position.</p>
      </HelpCard>
    </div>
  );
}
