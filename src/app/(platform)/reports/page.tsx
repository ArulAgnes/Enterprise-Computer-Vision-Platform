"use client";

import { useState } from "react";
import { FileText, Download, BookOpen, Database, Brain, ShieldCheck, Archive, File } from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";

interface ReportType {
  id: string;
  title: string;
  desc: string;
  icon: typeof Brain;
  apiType: string;
}

interface GeneratedReport {
  type: string;
  filename: string;
  path: string;
  content: string;
}

interface ExistingReport {
  filename: string;
  path: string;
  size: number;
  modified: string;
}

interface Model {
  id: string;
  modelId: string;
  name: string;
}

interface Dataset {
  id: string;
  datasetId: string;
  name: string;
}

const reportTypes: ReportType[] = [
  { id: "model-card", title: "Model Card", desc: "Model documentation, metrics, limitations, and compliance", icon: Brain, apiType: "model_card" },
  { id: "dataset-card", title: "Dataset Card", desc: "Dataset provenance, methodology, statistics, and ethics", icon: Database, apiType: "dataset_card" },
  { id: "research-report", title: "Research Report", desc: "Comprehensive research documentation for competition", icon: BookOpen, apiType: "research_report" },
  { id: "training-report", title: "Training Report", desc: "Full training log, hyperparameters, loss curves", icon: FileText, apiType: "training_report" },
  { id: "eval-report", title: "Evaluation Report", desc: "Metrics, confusion matrix, per-class results", icon: ShieldCheck, apiType: "eval_report" },
  { id: "submission", title: "Competition Submission Package", desc: "Complete export for DataGenesis 2026", icon: Archive, apiType: "submission" },
];

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  const { data: modelsData } = useApi<{ models: Model[]; total: number }>("/api/models");
  const { data: datasetsData } = useApi<{ datasets: Dataset[]; total: number }>("/api/datasets");
  const { data: reportsData, refetch: refetchReports } = useApi<{ reports: ExistingReport[]; total: number }>("/api/reports");

  const models = modelsData?.models ?? [];
  const datasets = datasetsData?.datasets ?? [];
  const existingReports = reportsData?.reports ?? [];

  const generateReport = async (rt: ReportType) => {
    setGenerating(rt.id);
    setReportMessage(null);
    setGeneratedReport(null);

    try {
      const body: Record<string, unknown> = { type: rt.apiType };
      if (rt.apiType === "model_card" && models.length > 0) {
        body.modelId = models[0].id;
      }
      if (rt.apiType === "dataset_card" && datasets.length > 0) {
        body.datasetId = datasets[0].id;
      }

      const result = await apiPost<{ report: GeneratedReport }>("/api/reports", body);
      setGeneratedReport(result.report);
      setReportMessage(`Report generated: ${result.report.filename}`);
      refetchReports();
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reports & Export</h1>
        <p className="text-sm text-[#94a3b8]">Generate model cards, dataset cards, research reports, and competition submission</p>
      </div>

      {reportMessage && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">{reportMessage}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((rt) => (
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
              <button
                onClick={() => generateReport(rt)}
                disabled={generating === rt.id}
                className="btn-primary text-[10px] px-3 py-1.5 flex items-center gap-1 flex-1 disabled:opacity-50"
              >
                <FileText className="w-3 h-3" /> {generating === rt.id ? "Generating..." : "Generate"}
              </button>
              {existingReports.some((r) => r.filename.includes(rt.apiType)) && (
                <button className="btn-secondary text-[10px] px-3 py-1.5 flex items-center gap-1">
                  <Download className="w-3 h-3" /> Export
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {generatedReport && (
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" /> Generated Report — {generatedReport.filename}
          </h3>
          <pre className="text-[10px] font-mono text-[#94a3b8] bg-[#111827] p-4 rounded-lg overflow-auto max-h-96">
            {generatedReport.content}
          </pre>
        </div>
      )}

      {existingReports.length > 0 && (
        <div className="glass-card-solid p-5">
          <h3 className="text-sm font-semibold mb-3">Existing Reports</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {existingReports.map((r) => (
                <tr key={r.filename}>
                  <td className="text-xs font-mono">{r.filename}</td>
                  <td className="text-xs font-mono">{(r.size / 1024).toFixed(1)}KB</td>
                  <td className="text-xs font-mono">{new Date(r.modified).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="glass-card-solid p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-blue-400" /> Dataset Card Preview</h3>
        {datasets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-blue-400 mb-2">Dataset Information</p>
              <p><span className="text-[#64748b]">Name:</span> {datasets[0].name}</p>
              <p><span className="text-[#64748b]">ID:</span> {datasets[0].datasetId}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#64748b]">NO DATASET REGISTERED</p>
        )}
      </div>

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
          ].map((section) => (
            <div key={section} className="p-2 bg-[#111827] rounded flex items-center gap-2">
              <File className="w-3 h-3 text-[#64748b]" />
              <span className="text-[#94a3b8]">{section}</span>
            </div>
          ))}
        </div>
      </div>

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
