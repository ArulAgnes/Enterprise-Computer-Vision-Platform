"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { WORKFLOW_STEPS, type WorkflowStep } from "./WorkflowStepper";

interface NextStepCardProps {
  currentStep: number;
  completedSteps: number[];
  customMessage?: string;
}

export function NextStepCard({ currentStep, completedSteps, customMessage }: NextStepCardProps) {
  const current = WORKFLOW_STEPS.find(s => s.number === currentStep);
  const next = WORKFLOW_STEPS.find(s => s.number === currentStep + 1);

  if (!current) return null;

  if (currentStep === 15 && completedSteps.includes(15)) {
    return (
      <div className="glass-card p-4 border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-400">All Steps Complete!</h3>
            <p className="text-xs text-[#94a3b8]">Your dataset is published and ready for DataGenesis 2026.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 border-blue-500/30 bg-blue-500/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <current.icon className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">Current Step</p>
            <h3 className="text-sm font-bold">
              Step {current.number}: {current.label}
            </h3>
            <p className="text-xs text-[#94a3b8]">{customMessage || current.description}</p>
          </div>
        </div>
        {next && (
          <Link
            href={next.href}
            className="btn-primary text-xs flex items-center gap-1 whitespace-nowrap"
          >
            Next: {next.shortLabel}
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

interface StepActionCardProps {
  step: WorkflowStep;
  isCompleted: boolean;
  isCurrent: boolean;
  description?: string;
}

export function StepActionCard({ step, isCompleted, isCurrent, description }: StepActionCardProps) {
  return (
    <Link
      href={step.href}
      className={`glass-card-solid p-4 transition-all hover:scale-[1.02] ${
        isCurrent
          ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
          : isCompleted
          ? "border-emerald-500/30"
          : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isCurrent
            ? "bg-blue-500 text-white"
            : isCompleted
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-[#1a2540] text-[#64748b]"
        }`}>
          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <step.icon className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <p className={`text-xs font-semibold ${isCurrent ? "text-blue-400" : isCompleted ? "text-emerald-400" : "text-[#94a3b8]"}`}>
            Step {step.number}: {step.label}
          </p>
          <p className="text-[10px] text-[#64748b]">{description || step.description}</p>
        </div>
        {isCurrent && <ArrowRight className="w-4 h-4 text-blue-400" />}
      </div>
    </Link>
  );
}
