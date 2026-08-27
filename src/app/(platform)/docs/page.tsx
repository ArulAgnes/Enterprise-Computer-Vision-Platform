"use client";

import { BookOpen, FileText, ExternalLink, Code, ShieldCheck, Beaker, Database, Brain, Scale } from "lucide-react";

const docSections = [
  { id: "architecture", title: "Architecture & Design", icon: Code, items: [
    "System Architecture Overview", "Frontend (Next.js + React + TypeScript)", "Backend Design (FastAPI + Python)",
    "AI Engine (PyTorch + NumPy + OpenCV)", "Database Schema (PostgreSQL + Drizzle)", "API Reference",
  ]},
  { id: "dataset", title: "Dataset Guide", icon: Database, items: [
    "Dataset Collection Methodology", "Capture Protocol & Guidelines", "Image Quality Standards",
    "Annotation Protocol", "Quality Control Pipeline", "Duplicate Detection Algorithm",
    "Dataset Splitting Strategy", "Leakage Prevention", "Version Control",
  ]},
  { id: "model", title: "Model & Training Guide", icon: Brain, items: [
    "Custom CNN Architecture Design", "Layer-by-Layer Specification", "Loss Function Formulation",
    "Weight Initialization (Random)", "Training Configuration", "Hyperparameter Guidelines",
    "Augmentation Strategy", "Checkpoint Management",
  ]},
  { id: "eval", title: "Evaluation Guide", icon: Beaker, items: [
    "IoU Calculation", "Precision/Recall/F1 Computation", "Confusion Matrix Interpretation",
    "Per-Class Analysis", "Error Analysis Methodology", "Robustness Testing",
    "Ablation Studies", "Confidence Calibration",
  ]},
  { id: "compliance", title: "Competition Compliance", icon: ShieldCheck, items: [
    "No Pretrained Weights — Verification", "No Transfer Learning — Verification",
    "No External Datasets — Verification", "Random Initialization — Proof",
    "Training From Scratch — Documentation", "Test Set Isolation",
    "Source Code Audit Procedure",
  ]},
  { id: "ethics", title: "Ethics & Privacy", icon: Scale, items: [
    "Data Provenance Policy", "Privacy Review Workflow", "EXIF/Metadata Stripping",
    "Consent Management", "Face Redaction (if applicable)", "Responsible AI Practices",
  ]},
];

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Documentation</h1>
        <p className="text-sm text-[#94a3b8]">Complete technical documentation for the VisionBharat platform</p>
      </div>

      {/* Why This Dataset */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 gradient-text">Why This Dataset — Research Justification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#94a3b8]">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-blue-400">Cultural Relevance</h4>
            <p>Traditional Indian lamps (diyas) and ritual objects are deeply embedded in Indian cultural and religious practices. They represent centuries of craftsmanship and carry significant heritage value.</p>
            <h4 className="text-sm font-semibold text-emerald-400 mt-3">Visual Diversity</h4>
            <p>Objects vary across materials (clay, brass, copper), shapes, sizes, wick configurations, and decorative patterns. This creates a challenging fine-grained recognition problem.</p>
            <h4 className="text-sm font-semibold text-violet-400 mt-3">Lighting Variation</h4>
            <p>These objects are used in diverse lighting conditions — from bright daylight to dim oil-lit environments — making detection challenging and practically relevant.</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-amber-400">Shape Similarity Challenge</h4>
            <p>Several classes share similar geometric profiles (e.g., brass diya vs. multi-wick diya), requiring the model to learn discriminative features beyond shape alone.</p>
            <h4 className="text-sm font-semibold text-rose-400 mt-3">Practical Applications</h4>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Digital heritage preservation</li>
              <li>Cultural education tools</li>
              <li>Museum digitization</li>
              <li>E-commerce classification</li>
              <li>Tourism technology</li>
              <li>Educational computer vision</li>
            </ul>
            <h4 className="text-sm font-semibold text-cyan-400 mt-3">Material & Texture Variation</h4>
            <p>Clay, brass, and copper present distinct texture patterns. The model must distinguish material properties alongside geometric features.</p>
          </div>
        </div>
      </div>

      {/* Doc Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docSections.map(section => (
          <div key={section.id} className="glass-card-solid p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <section.icon className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold">{section.title}</h3>
            </div>
            <div className="space-y-1">
              {section.items.map(item => (
                <div key={item} className="flex items-center gap-2 p-1.5 rounded hover:bg-[#111827] cursor-pointer text-xs text-[#94a3b8] transition-colors">
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Architecture Diagram */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">End-to-End Pipeline Architecture</h3>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[
            "Original Images", "Raw Dataset", "Quality Control", "Annotation",
            "Validation", "Dataset Version", "Train/Val/Test", "Augmentation",
            "Custom CNN", "Training", "Evaluation", "Model Registry",
            "Inference", "Dashboard",
          ].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-1">
              <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300">
                {step}
              </div>
              {i < arr.length - 1 && <span className="text-[#2a3550]">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Competition Compliance */}
      <div className="glass-card-solid p-5 border border-emerald-500/20">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Competition Compliance Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { label: "Dataset: Original team-collected images", ok: true },
            { label: "Pretrained weights: NONE", ok: true },
            { label: "Transfer learning: NONE", ok: true },
            { label: "External datasets: NONE", ok: true },
            { label: "Foundation models: NONE", ok: true },
            { label: "Model initialization: Random", ok: true },
            { label: "Training: From scratch", ok: true },
            { label: "Evaluation: Held-out test set", ok: true },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 p-2 bg-[#111827] rounded">
              {item.ok ? <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <ShieldCheck className="w-4 h-4 text-rose-400 flex-shrink-0" />}
              <span className="text-[#94a3b8]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
