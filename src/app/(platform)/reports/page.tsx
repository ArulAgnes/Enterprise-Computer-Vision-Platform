"use client";

import { FileText, Download, BookOpen, Database, Brain, ShieldCheck, Archive, File } from "lucide-react";

const reportTypes = [
  { id: "model-card", title: "Model Card", desc: "Model documentation, metrics, limitations, and compliance", icon: Brain, generated: true },
  { id: "dataset-card", title: "Dataset Card", desc: "Dataset provenance, methodology, statistics, and ethics", icon: Database, generated: true },
  { id: "training-report", title: "Training Report", desc: "Full training log, hyperparameters, loss curves", icon: FileText, generated: true },
  { id: "eval-report", title: "Evaluation Report", desc: "Metrics, confusion matrix, per-class results", icon: ShieldCheck, generated: true },
  { id: "research-paper", title: "Research Report", desc: "Comprehensive research documentation for competition", icon: BookOpen, generated: true },
  { id: "submission", title: "Competition Submission Package", desc: "Complete export for DataGenesis 2026", icon: Archive, generated: false },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reports & Export</h1>
        <p className="text-sm text-[#94a3b8]">Generate model cards, dataset cards, research reports, and competition submission</p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map(rt => (
          <div key={rt.id} className="glass-card-solid p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <rt.icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{rt.title}</h3>
                <p className="text-[10px] text-[#64748b]">{rt.desc}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-[10px] px-3 py-1.5 flex items-center gap-1 flex-1">
                <FileText className="w-3 h-3" /> Generate
              </button>
              {rt.generated && (
                <button className="btn-secondary text-[10px] px-3 py-1.5 flex items-center gap-1">
                  <Download className="w-3 h-3" /> Export
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dataset Card Preview */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-blue-400" /> Dataset Card Preview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-blue-400 mb-2">Dataset Information</p>
            <p><span className="text-[#64748b]">Name:</span> Traditional Indian Lamps & Ritual Objects</p>
            <p><span className="text-[#64748b]">ID:</span> DIYA-2026</p>
            <p><span className="text-[#64748b]">Version:</span> 0.3</p>
            <p><span className="text-[#64748b]">Theme:</span> India-Centric Cultural Heritage</p>
            <p><span className="text-[#64748b]">Images:</span> 763 (643 acceptable)</p>
            <p><span className="text-[#64748b]">Annotations:</span> 4,218</p>
            <p><span className="text-[#64748b]">Classes:</span> 8</p>
            <p><span className="text-[#64748b]">Split:</span> 539 / 116 / 108 (Train/Val/Test)</p>
            <p><span className="text-[#64748b]">Format:</span> YOLO (normalized)</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-emerald-400 mb-2">Provenance & Ethics</p>
            <p><span className="text-[#64748b]">Collection:</span> Original team-captured images</p>
            <p><span className="text-[#64748b]">Location:</span> Rajapalayam, Tamil Nadu, India</p>
            <p><span className="text-[#64748b]">Methodology:</span> Systematic multi-angle capture</p>
            <p><span className="text-[#64748b]">External Data:</span> <span className="text-rose-400 font-semibold">NONE</span></p>
            <p><span className="text-[#64748b]">Scraped Data:</span> <span className="text-rose-400 font-semibold">NONE</span></p>
            <p><span className="text-[#64748b]">Privacy:</span> EXIF stripped, no faces captured</p>
            <p><span className="text-[#64748b]">License:</span> Team-controlled</p>
            <p><span className="text-[#64748b]">Contributors:</span> Arul Maria Agnes et al.</p>
          </div>
        </div>
      </div>

      {/* Research Report Structure */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-400" /> Research Report Structure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {[
            "1. Abstract", "2. Problem Statement", "3. Motivation & Cultural Relevance",
            "4. Dataset Collection Methodology", "5. Quality Control & Curation",
            "6. Annotation Methodology", "7. Dataset Statistics & Analysis",
            "8. Model Architecture Design", "9. Training Methodology (From Scratch)",
            "10. Loss Function Formulation", "11. Experimental Setup & Results",
            "12. Evaluation & Metrics", "13. Error Analysis", "14. Ablation Studies",
            "15. Limitations", "16. Ethical Considerations",
            "17. Future Work", "18. Conclusion", "19. Competition Compliance",
          ].map(section => (
            <div key={section} className="p-2 bg-[#111827] rounded flex items-center gap-2">
              <File className="w-3 h-3 text-[#64748b]" />
              <span className="text-[#94a3b8]">{section}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export Structure */}
      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3">Competition Submission Structure</h3>
        <pre className="text-[10px] font-mono text-[#94a3b8] bg-[#111827] p-4 rounded-lg overflow-auto">
{`VisionBharat_DataGenesis2026/
├── 01_Dataset/
│   ├── images/ (train/ val/ test/)
│   └── labels/ (train/ val/ test/)
├── 02_Annotations/
├── 03_Model/
│   ├── VB-CV-002-best.pt
│   └── model_config.yaml
├── 04_Training/
│   └── training_log.json
├── 05_Evaluation/
│   ├── confusion_matrix.json
│   └── per_class_metrics.json
├── 06_Reports/
│   ├── MODEL_CARD.md
│   └── DATASET_CARD.md
├── 07_Documentation/
├── 08_Source_Code/
├── 09_Reproducibility/
│   └── reproduce.sh
├── 10_Competition_Compliance/
│   └── COMPLIANCE_AUDIT.md
└── README.md`}
        </pre>
      </div>
    </div>
  );
}
