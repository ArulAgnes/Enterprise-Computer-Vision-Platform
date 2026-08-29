"use client";

import Link from "next/link";
import {
  Camera, Database, Tag, PenTool, ShieldCheck, CheckCircle, Scissors,
  Archive, Brain, Target, ScanSearch, Download, Upload, BookOpen, FileText,
  ArrowRight, Check
} from "lucide-react";

export interface WorkflowStep {
  id: string;
  number: number;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  href: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "capture", number: 1, label: "Capture", shortLabel: "Capture", icon: Camera, href: "/capture", description: "Collect images with camera or upload" },
  { id: "dataset", number: 2, label: "Dataset", shortLabel: "Dataset", icon: Database, href: "/datasets", description: "Create and configure your dataset" },
  { id: "classes", number: 3, label: "Classes", shortLabel: "Classes", icon: Tag, href: "/datasets", description: "Define object classes to recognize" },
  { id: "annotate", number: 4, label: "Annotate", shortLabel: "Annotate", icon: PenTool, href: "/annotation", description: "Draw bounding boxes on images" },
  { id: "quality", number: 5, label: "Quality", shortLabel: "Quality", icon: ShieldCheck, href: "/quality", description: "Check image and annotation quality" },
  { id: "validate", number: 6, label: "Validate", shortLabel: "Validate", icon: CheckCircle, href: "/quality", description: "Validate dataset structure" },
  { id: "split", number: 7, label: "Split", shortLabel: "Split", icon: Scissors, href: "/datasets", description: "Split into train/validation/test" },
  { id: "version", number: 8, label: "Version", shortLabel: "Version", icon: Archive, href: "/datasets", description: "Create a dataset snapshot" },
  { id: "train", number: 9, label: "Train", shortLabel: "Train", icon: Brain, href: "/training", description: "Train your model from scratch" },
  { id: "evaluate", number: 10, label: "Evaluate", shortLabel: "Eval", icon: Target, href: "/evaluation", description: "Measure model performance" },
  { id: "inference", number: 11, label: "Inference", shortLabel: "Infer", icon: ScanSearch, href: "/inference", description: "Test on new images" },
  { id: "kaggle-export", number: 12, label: "Kaggle Export", shortLabel: "Export", icon: Download, href: "/kaggle", description: "Export dataset for Kaggle" },
  { id: "kaggle-publish", number: 13, label: "Publish Dataset", shortLabel: "Publish", icon: Upload, href: "/kaggle", description: "Publish to Kaggle" },
  { id: "kaggle-notebook", number: 14, label: "Notebook", shortLabel: "Notebook", icon: BookOpen, href: "/kaggle", description: "Generate and publish notebook" },
  { id: "report", number: 15, label: "Report", shortLabel: "Report", icon: FileText, href: "/competition", description: "Final competition report" },
];

export type WorkflowState = {
  currentStep: number;
  completedSteps: number[];
  totalImages: number;
  totalClasses: number;
  totalAnnotations: number;
  annotatedImages: number;
  hasQualityReports: boolean;
  qualityReportCount: number;
  qualityComplete: boolean;
  allQualityGreen: boolean;
  hasSplits: boolean;
  hasVersions: boolean;
  hasExperiments: boolean;
  hasTrainedModel: boolean;
  hasEvaluations: boolean;
  hasKagglePublication: boolean;
  hasNotebook: boolean;
  annotationComplete: boolean;
  blockers: string[];
};

export function determineWorkflowState(data: {
  images: number;
  classes: number;
  annotations: number;
  annotatedImages: number;
  hasQualityReports: boolean;
  qualityReportCount?: number;
  hasSplits: boolean;
  hasVersions: boolean;
  hasExperiments: boolean;
  hasTrainedModel: boolean;
  hasEvaluations: boolean;
  hasKagglePublication: boolean;
  hasNotebook: boolean;
}): WorkflowState {
  const completedSteps: number[] = [];

  if (data.images > 0) completedSteps.push(1);
  if (data.images > 0) completedSteps.push(2);
  if (data.classes > 0) completedSteps.push(3);
  if (data.annotatedImages > 0 && data.annotatedImages === data.images) completedSteps.push(4);
  if (data.hasQualityReports) completedSteps.push(5);
  if (data.hasQualityReports) completedSteps.push(6);
  if (data.hasSplits) completedSteps.push(7);
  if (data.hasVersions) completedSteps.push(8);
  if (data.hasTrainedModel) completedSteps.push(9);
  if (data.hasEvaluations) completedSteps.push(10);
  if (data.hasEvaluations) completedSteps.push(11);
  if (data.hasKagglePublication) completedSteps.push(12);
  if (data.hasKagglePublication) completedSteps.push(13);
  if (data.hasNotebook) completedSteps.push(14);
  if (data.hasNotebook) completedSteps.push(15);

  let currentStep = 1;
  for (let i = 1; i <= 15; i++) {
    if (!completedSteps.includes(i)) {
      currentStep = i;
      break;
    }
    if (i === 15) currentStep = 15;
  }

  const qualityReportCount = data.qualityReportCount ?? 0;
  const qualityComplete = data.hasQualityReports && qualityReportCount >= data.images;
  const allQualityGreen = qualityComplete;

  return {
    currentStep,
    completedSteps,
    totalImages: data.images,
    totalClasses: data.classes,
    totalAnnotations: data.annotations,
    annotatedImages: data.annotatedImages,
    hasQualityReports: data.hasQualityReports,
    qualityReportCount,
    qualityComplete,
    allQualityGreen,
    hasSplits: data.hasSplits,
    hasVersions: data.hasVersions,
    hasExperiments: data.hasExperiments,
    hasTrainedModel: data.hasTrainedModel,
    hasEvaluations: data.hasEvaluations,
    hasKagglePublication: data.hasKagglePublication,
    hasNotebook: data.hasNotebook,
    annotationComplete: data.annotatedImages > 0 && data.annotatedImages === data.images,
    blockers: [],
  };
}

interface WorkflowStepperProps {
  currentStep: number;
  completedSteps: number[];
  compact?: boolean;
}

export function WorkflowStepper({ currentStep, completedSteps, compact = false }: WorkflowStepperProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {WORKFLOW_STEPS.map((step) => {
          const isCompleted = completedSteps.includes(step.number);
          const isCurrent = step.number === currentStep;
          return (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                isCurrent
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : isCompleted
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-[#64748b] hover:text-[#94a3b8]"
              }`}
              title={step.description}
            >
              {isCompleted ? <Check className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
              <span>{step.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="glass-card-solid p-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {WORKFLOW_STEPS.map((step, i, arr) => {
          const isCompleted = completedSteps.includes(step.number);
          const isCurrent = step.number === currentStep;
          const isFuture = step.number > currentStep;

          return (
            <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
              <Link
                href={step.href}
                className={`flex flex-col items-center p-2 rounded-lg min-w-[70px] transition-all ${
                  isCurrent
                    ? "bg-blue-500/15 border border-blue-500/40 shadow-lg shadow-blue-500/10"
                    : isCompleted
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-[#111827] border border-[#2a3550] opacity-50"
                }`}
                title={step.description}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                  isCurrent
                    ? "bg-blue-500 text-white"
                    : isCompleted
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-[#1a2540] text-[#64748b]"
                }`}>
                  {isCompleted ? <Check className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
                </div>
                <span className={`text-[9px] font-semibold text-center leading-tight ${
                  isCurrent ? "text-blue-400" : isCompleted ? "text-emerald-400" : "text-[#64748b]"
                }`}>
                  {step.shortLabel}
                </span>
              </Link>
              {i < arr.length - 1 && (
                <ArrowRight className={`w-3 h-3 flex-shrink-0 ${
                  isCompleted ? "text-emerald-500/50" : "text-[#2a3550]"
                }`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-center">
        <span className="text-[10px] text-[#64748b]">
          Step {currentStep} of {WORKFLOW_STEPS.length}: {WORKFLOW_STEPS[currentStep - 1]?.label}
        </span>
      </div>
    </div>
  );
}

export function getCurrentStepInfo(currentStep: number): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find(s => s.number === currentStep);
}

export function getNextStep(currentStep: number): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find(s => s.number === currentStep + 1);
}

export function getPrevStep(currentStep: number): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find(s => s.number === currentStep - 1);
}
