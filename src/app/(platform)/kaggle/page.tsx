"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trophy, CheckCircle2, XCircle, ExternalLink, Loader2,
  Database, ShieldCheck, Upload, Globe, AlertCircle, Info,
  FileText, BookOpen
} from "lucide-react";
import { useApi, apiPost } from "@/lib/hooks";

interface KaggleStatus {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  status: string;
  error?: string;
}

interface Dataset {
  id: string;
  name: string;
  version?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    datasetName: string;
    datasetVersion: string;
    totalImages: number;
    totalAnnotations: number;
    totalClasses: number;
    annotatedImages: number;
    unannotatedImages: number;
    splits: Record<string, number>;
    qualityFlags: Record<string, number>;
  };
}

interface ExportResult {
  success: boolean;
  exportDir?: string;
  slug?: string;
  title?: string;
  totalImages?: number;
  totalAnnotations?: number;
  classes?: number;
  validation?: ValidationResult;
  error?: string;
}

interface PublishResult {
  success: boolean;
  action?: string;
  url?: string;
  slug?: string;
  status?: string;
  error?: string;
}

interface VerifyResult {
  verified: boolean;
  url?: string;
  slug?: string;
  username?: string;
  title?: string;
  error?: string;
}

interface NotebookResult {
  success: boolean;
  notebookPath?: string;
  error?: string;
}

export default function KagglePage() {
  const { data: kaggleStatus, loading: statusLoading, refetch: refetchStatus } =
    useApi<KaggleStatus>("/api/kaggle/status");
  const { data: datasetsData, loading: datasetsLoading } =
    useApi<Dataset[]>("/api/datasets");

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [slug, setSlug] = useState("visionbharat-indian-lamps");
  const [title, setTitle] = useState("VisionBharat — Traditional Indian Lamps & Ritual Objects");
  const [description, setDescription] = useState(
    "India-centric dataset of traditional Indian lamps and ritual objects for computer vision research. Collected as part of DataGenesis 2026."
  );
  const [license, setLicense] = useState("CC0-1.0");

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [generatingNotebook, setGeneratingNotebook] = useState(false);
  const [notebookResult, setNotebookResult] = useState<NotebookResult | null>(null);
  const [publishingNotebook, setPublishingNotebook] = useState(false);
  const [notebookPublished, setNotebookPublished] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const datasetsArray = Array.isArray(datasetsData) ? datasetsData : [];
  const status = kaggleStatus;

  useEffect(() => {
    if (datasetsArray.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(datasetsArray[0].id);
    }
  }, [datasetsArray, selectedDatasetId]);

  const showMsg = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    setMessage({ text, type });
  }, []);

  const handleValidate = useCallback(async () => {
    if (!selectedDatasetId) { showMsg("Select a dataset first.", "error"); return; }
    setValidating(true); setValidationResult(null); setMessage(null);
    try {
      const res = await apiPost<ValidationResult>("/api/kaggle/validate", { datasetId: selectedDatasetId });
      setValidationResult(res);
      showMsg(res.valid ? "Dataset validation passed!" : `Validation failed: ${res.errors.length} error(s)`, res.valid ? "success" : "error");
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Validation failed.", "error");
    } finally { setValidating(false); }
  }, [selectedDatasetId, showMsg]);

  const handleExport = useCallback(async () => {
    if (!selectedDatasetId || !slug || !title) { showMsg("Fill in all required fields.", "error"); return; }
    setExporting(true); setExportResult(null); setMessage(null);
    try {
      const res = await apiPost<ExportResult>("/api/kaggle/export", {
        datasetId: selectedDatasetId, slug, title, description, license,
      });
      setExportResult(res);
      if (res.success) { showMsg("Export package created successfully.", "success"); }
      else { showMsg(res.error || "Export failed.", "error"); }
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Export failed.", "error");
    } finally { setExporting(false); }
  }, [selectedDatasetId, slug, title, description, license, showMsg]);

  const handlePublish = useCallback(async () => {
    if (!slug || !title) { showMsg("Run export first.", "error"); return; }
    setPublishing(true); setPublishResult(null); setMessage(null);
    try {
      const res = await apiPost<PublishResult>("/api/kaggle/publish", {
        slug, title, description, datasetId: selectedDatasetId,
      });
      setPublishResult(res);
      if (res.success) {
        showMsg(`Dataset ${res.action === "updated" ? "updated" : "published"}! URL: ${res.url}`, "success");
      } else { showMsg(res.error || "Publishing failed.", "error"); }
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Publishing failed.", "error");
    } finally { setPublishing(false); }
  }, [slug, title, description, selectedDatasetId, showMsg]);

  const handleVerify = useCallback(async () => {
    if (!status?.username || !slug) { showMsg("Cannot verify: missing info.", "error"); return; }
    setVerifying(true); setVerifyResult(null); setMessage(null);
    try {
      const res = await fetch(`/api/kaggle/verify?username=${encodeURIComponent(status.username)}&slug=${encodeURIComponent(slug)}`);
      const data: VerifyResult = await res.json();
      setVerifyResult(data);
      showMsg(data.verified ? "Dataset verified on Kaggle!" : (data.error || "Could not verify."), data.verified ? "success" : "error");
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Verification failed.", "error");
    } finally { setVerifying(false); }
  }, [status, slug, showMsg]);

  const handleGenerateNotebook = useCallback(async () => {
    if (!selectedDatasetId || !slug || !title) { showMsg("Fill in dataset config first.", "error"); return; }
    setGeneratingNotebook(true); setNotebookResult(null); setMessage(null);
    try {
      const res = await apiPost<NotebookResult>("/api/kaggle/notebook", {
        datasetId: selectedDatasetId, slug, title,
      });
      setNotebookResult(res);
      showMsg(res.success ? "Notebook generated!" : (res.error || "Generation failed."), res.success ? "success" : "error");
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Notebook generation failed.", "error");
    } finally { setGeneratingNotebook(false); }
  }, [selectedDatasetId, slug, title, showMsg]);

  const handlePublishNotebook = useCallback(async () => {
    if (!slug) { showMsg("Generate notebook first.", "error"); return; }
    setPublishingNotebook(true); setMessage(null);
    try {
      const res = await apiPost<{ success: boolean; url?: string; error?: string }>("/api/kaggle/notebook/publish", { slug });
      setNotebookPublished(res.success);
      showMsg(res.success ? "Notebook published!" : (res.error || "Publication failed."), res.success ? "success" : "error");
    } catch (err: unknown) {
      const e = err as { message?: string };
      showMsg(e.message || "Notebook publication failed.", "error");
      setNotebookPublished(false);
    } finally { setPublishingNotebook(false); }
  }, [slug, showMsg]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" /> Kaggle Publication
        </h1>
        <p className="text-sm text-[#94a3b8]">
          Publish your validated dataset to Kaggle for DataGenesis 2026 Round 1
        </p>
      </div>

      {/* What is Kaggle? */}
      <div className="glass-card-solid p-4 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[#94a3b8] space-y-1">
            <p className="font-semibold text-blue-400">What is Kaggle?</p>
            <p>Kaggle is where you publish your completed dataset for Round 1 of DataGenesis 2026.</p>
            <p>What happens when I click Publish? VisionBharat validates your dataset, creates the export package, uploads it using your Kaggle credentials, publishes it, and verifies the resulting dataset.</p>
            <p>What do I need? Your Kaggle API token must be configured locally as KAGGLE_API_TOKEN.</p>
            <p>Will my token be uploaded? No. The token is used only for authentication and is never stored in the dataset or sent to the browser.</p>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="glass-card-solid p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-400" /> STEP-BY-STEP WORKFLOW
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { step: "1", label: "Create Dataset", done: datasetsArray.length > 0 },
            { step: "2", label: "Upload Images", done: datasetsArray.length > 0 },
            { step: "3", label: "Create Classes", done: datasetsArray.length > 0 },
            { step: "4", label: "Annotate", done: datasetsArray.length > 0 },
            { step: "5", label: "Quality Check", done: false },
            { step: "6", label: "Check Duplicates", done: false },
            { step: "7", label: "Validate Annotations", done: false },
            { step: "8", label: "Create Split", done: false },
            { step: "9", label: "Create Version", done: false },
            { step: "10", label: "Open Kaggle Page", done: true },
            { step: "11", label: "Click Validate", done: validationResult?.valid === true },
            { step: "12", label: "Click Export", done: exportResult?.success === true },
            { step: "13", label: "Click Publish", done: publishResult?.success === true },
            { step: "14", label: "Wait for Upload", done: publishResult?.success === true },
            { step: "15", label: "Click Verify", done: verifyResult?.verified === true },
            { step: "16", label: "Open Kaggle URL", done: verifyResult?.verified === true },
            { step: "17", label: "Generate Notebook", done: notebookResult?.success === true },
          ].map((item) => (
            <div key={item.step} className={`flex items-center gap-2 p-2 rounded ${item.done ? "bg-emerald-500/10" : "bg-[#111827]"}`}>
              {item.done ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" /> : <span className="w-3 h-3 rounded-full border border-[#2a3550] flex-shrink-0" />}
              <span className="text-[#94a3b8]">{item.step}. {item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Status */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" /> KAGGLE CONNECTION
        </h2>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking connection...
          </div>
        ) : status?.authenticated ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">Connected</span>
            </div>
            <p className="text-xs text-[#94a3b8]">Username: {status.username}</p>
            <button onClick={() => refetchStatus()} className="btn-secondary text-xs">Refresh Status</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-sm font-semibold text-rose-400">Not Connected</span>
            </div>
            <p className="text-xs text-[#94a3b8]">{status?.error || "Kaggle credentials not configured."}</p>
            <p className="text-xs text-[#64748b]">Set KAGGLE_API_TOKEN environment variable and restart the server.</p>
          </div>
        )}
      </div>

      {/* Dataset Configuration */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" /> DATASET CONFIGURATION
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#94a3b8] mb-1 block">Dataset</label>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3550] rounded-lg px-3 py-2 text-sm">
              {datasetsLoading ? <option>Loading...</option> : datasetsArray.length === 0 ? <option>No datasets available</option> :
                datasetsArray.map((d) => <option key={d.id} value={d.id}>{d.name} (v{d.version || "0.1"})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94a3b8] mb-1 block">Kaggle Slug *</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3550] rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="visionbharat-indian-lamps" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[#94a3b8] mb-1 block">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3550] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[#94a3b8] mb-1 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full bg-[#0f1729] border border-[#2a3550] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#94a3b8] mb-1 block">License</label>
            <select value={license} onChange={(e) => setLicense(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3550] rounded-lg px-3 py-2 text-sm">
              <option value="CC0-1.0">CC0-1.0 (Public Domain)</option>
              <option value="CC-BY-4.0">CC-BY-4.0</option>
              <option value="CC-BY-SA-4.0">CC-BY-SA-4.0</option>
            </select>
          </div>
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div className={`glass-card-solid p-5 border ${validationResult.valid ? "border-emerald-500/30" : "border-rose-500/30"}`}>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className={`w-4 h-4 ${validationResult.valid ? "text-emerald-400" : "text-rose-400"}`} />
            VALIDATION {validationResult.valid ? "PASSED" : "FAILED"}
          </h2>
          {validationResult.errors.length > 0 && (
            <div className="mb-3 space-y-1">
              {validationResult.errors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-rose-400">
                  <XCircle className="w-3 h-3" /> {e}
                </div>
              ))}
            </div>
          )}
          {validationResult.warnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {validationResult.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertCircle className="w-3 h-3" /> {w}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-2 bg-[#111827] rounded"><span className="text-[#64748b]">Images:</span> <span className="font-mono">{validationResult.stats.totalImages}</span></div>
            <div className="p-2 bg-[#111827] rounded"><span className="text-[#64748b]">Annotations:</span> <span className="font-mono">{validationResult.stats.totalAnnotations}</span></div>
            <div className="p-2 bg-[#111827] rounded"><span className="text-[#64748b]">Classes:</span> <span className="font-mono">{validationResult.stats.totalClasses}</span></div>
            <div className="p-2 bg-[#111827] rounded"><span className="text-[#64748b]">Annotated:</span> <span className="font-mono">{validationResult.stats.annotatedImages}</span></div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-violet-400" /> PUBLICATION ACTIONS
        </h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleValidate} disabled={validating || !selectedDatasetId}
            className="btn-secondary text-xs flex items-center gap-1">
            {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Validate Dataset
          </button>
          <button onClick={handleExport} disabled={exporting || !selectedDatasetId}
            className="btn-primary text-xs flex items-center gap-1">
            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Export Dataset
          </button>
          <button onClick={handlePublish} disabled={publishing || !status?.authenticated || !exportResult?.success}
            className="btn-primary text-xs flex items-center gap-1">
            {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
            Publish to Kaggle
          </button>
          <button onClick={handleVerify} disabled={verifying || !status?.authenticated}
            className="btn-secondary text-xs flex items-center gap-1">
            {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Verify Dataset
          </button>
          {publishResult?.url && (
            <a href={publishResult.url} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-xs flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Open Kaggle Dataset
            </a>
          )}
        </div>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-xs ${
            message.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" :
            message.type === "error" ? "bg-rose-500/10 border border-rose-500/30 text-rose-400" :
            "bg-blue-500/10 border border-blue-500/30 text-blue-400"
          }`}>{message.text}</div>
        )}

        {exportResult?.success && (
          <div className="mt-4 p-3 bg-[#111827] rounded-lg text-xs space-y-1">
            <p className="text-emerald-400 font-semibold">Export Complete</p>
            <p className="text-[#94a3b8]">Slug: {exportResult.slug}</p>
            <p className="text-[#94a3b8]">Images: {exportResult.totalImages} | Annotations: {exportResult.totalAnnotations} | Classes: {exportResult.classes}</p>
            <p className="text-[#64748b]">Dir: {exportResult.exportDir}</p>
          </div>
        )}

        {verifyResult && (
          <div className={`mt-4 p-3 rounded-lg text-xs ${verifyResult.verified ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
            {verifyResult.verified ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400 font-semibold">Verified on Kaggle</span></div>
                {verifyResult.url && <p className="text-[#94a3b8]">{verifyResult.url}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-amber-400">{verifyResult.error || "Could not verify."}</span></div>
            )}
          </div>
        )}
      </div>

      {/* Notebook Section */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" /> KAGGLE NOTEBOOK
        </h2>
        <p className="text-xs text-[#94a3b8] mb-4">
          Generate a Kaggle notebook that documents your dataset and model workflow.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleGenerateNotebook} disabled={generatingNotebook || !selectedDatasetId}
            className="btn-secondary text-xs flex items-center gap-1">
            {generatingNotebook ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Generate Notebook
          </button>
          <button onClick={handlePublishNotebook} disabled={publishingNotebook || !notebookResult?.success || !status?.authenticated}
            className="btn-primary text-xs flex items-center gap-1">
            {publishingNotebook ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
            Publish Notebook
          </button>
          {notebookPublished === true && (
            <span className="btn-secondary text-xs flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Published
            </span>
          )}
        </div>
        {notebookResult?.success && (
          <div className="mt-3 p-3 bg-[#111827] rounded-lg text-xs">
            <p className="text-emerald-400 font-semibold">Notebook Generated</p>
            <p className="text-[#64748b]">{notebookResult.notebookPath}</p>
          </div>
        )}
      </div>

      {/* Round 1 Checklist */}
      <div className="glass-card-solid p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" /> ROUND 1 READINESS
        </h2>
        <div className="space-y-2">
          {[
            { label: "Dataset created", done: datasetsArray.length > 0 },
            { label: "Original images collected", done: datasetsArray.length > 0 },
            { label: "Kaggle credentials configured", done: status?.authenticated === true },
            { label: "Dataset validated", done: validationResult?.valid === true },
            { label: "Export package generated", done: exportResult?.success === true },
            { label: "Kaggle dataset published", done: publishResult?.success === true },
            { label: "Kaggle dataset verified", done: verifyResult?.verified === true },
            { label: "Notebook generated", done: notebookResult?.success === true },
            { label: "Notebook published", done: notebookPublished === true },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-[#64748b]" />}
              <span className={item.done ? "text-[#94a3b8]" : "text-[#64748b]"}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
