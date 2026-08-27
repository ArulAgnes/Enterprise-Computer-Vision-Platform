"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { PenTool, ZoomIn, ZoomOut, Move, Trash2, Undo2, Redo2, ChevronLeft, ChevronRight, Save, Square, MousePointer, Image, Tag, Hash, Grid3X3, Loader2, Database, XCircle } from "lucide-react";
import { useApi, apiPost, apiDelete, apiPut } from "@/lib/hooks";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { NextStepCard, HelpCard, PageHeader, InfoBar } from "@/components/workflow";

interface ImageRecord {
  id: string;
  datasetId: string;
  filename: string;
  originalFilename?: string;
  filepath?: string;
  resolution?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

interface AnnotationRecord {
  id: string;
  imageId: string;
  datasetId: string;
  classId?: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  normalizedX?: number;
  normalizedY?: number;
  normalizedW?: number;
  normalizedH?: number;
  isValid?: boolean;
}

interface ClassRecord {
  id: string;
  datasetId: string;
  name: string;
  classIndex: number;
  color?: string;
}

const CLASS_COLORS: Record<string, string> = {
  "Clay Diya": "#f59e0b", "Brass Diya": "#ef4444", "Hanging Diya": "#8b5cf6",
  "Multi-wick Diya": "#06b6d4", "Kuthu Vilakku": "#10b981", "Temple Bell": "#f97316",
  "Incense Holder": "#ec4899", "Ritual Plate": "#6366f1",
};
const DEFAULT_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"];

function getColorForClass(cls: string, classes: ClassRecord[]) {
  const found = classes.find(c => c.name === cls);
  if (found?.color) return found.color;
  return CLASS_COLORS[cls] ?? DEFAULT_COLORS[Math.abs(cls.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % DEFAULT_COLORS.length];
}

export default function AnnotationPage() {
  const [datasetId, setDatasetId] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTool, setSelectedTool] = useState<"select" | "draw">("draw");
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [undoStack, setUndoStack] = useState<AnnotationRecord[][]>([]);
  const { state: workflow, refetch: refetchWorkflow } = useWorkflowState();
  const canvasRef = useRef<HTMLDivElement>(null);

  const imagesUrl = datasetId ? `/api/images?datasetId=${datasetId}&limit=500` : null;
  const { data: imagesData, loading: imagesLoading } = useApi<{ success: boolean; data: ImageRecord[] }>(imagesUrl);

  const images: ImageRecord[] = imagesData?.data ?? [];
  const currentImage: ImageRecord | undefined = images[imageIndex];

  const annotationsUrl = currentImage ? `/api/annotations?imageId=${currentImage.id}` : null;
  const { data: annData, loading: annLoading, refetch: refetchAnnotations } = useApi<{ annotations: AnnotationRecord[] }>(annotationsUrl);

  const classesUrl = datasetId ? `/api/classes?datasetId=${datasetId}` : null;
  const { data: classesData } = useApi<{ classes: ClassRecord[] }>(classesUrl);
  const classes: ClassRecord[] = classesData?.classes ?? [];

  const effectiveAnnotations = annData?.annotations || [];
  const effectiveSelectedClass = selectedClass || classes[0]?.name || "";
  const effectiveCanvasSize = useMemo(() =>
    currentImage?.width && currentImage?.height
      ? { w: currentImage.width, h: currentImage.height }
      : { w: 640, h: 480 },
    [currentImage]
  );

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = effectiveCanvasSize.w / rect.width;
    const scaleY = effectiveCanvasSize.h / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, [effectiveCanvasSize]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool !== "draw") return;
    const coords = getCanvasCoords(e);
    setDrawing(true);
    setDrawStart(coords);
    setDrawRect(null);
  }, [selectedTool, getCanvasCoords]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !drawStart) return;
    const coords = getCanvasCoords(e);
    const x = Math.min(drawStart.x, coords.x);
    const y = Math.min(drawStart.y, coords.y);
    const w = Math.abs(coords.x - drawStart.x);
    const h = Math.abs(coords.y - drawStart.y);
    setDrawRect({ x, y, w, h });
  }, [drawing, drawStart, getCanvasCoords]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!drawing || !drawRect || !currentImage || drawRect.w < 5 || drawRect.h < 5) {
      setDrawing(false);
      setDrawStart(null);
      setDrawRect(null);
      return;
    }
    const newAnnotation: AnnotationRecord = {
      id: `temp-${Date.now()}`,
      imageId: currentImage.id,
      datasetId: currentImage.datasetId,
      className: selectedClass || "Unknown",
      x: drawRect.x,
      y: drawRect.y,
      width: drawRect.w,
      height: drawRect.h,
    };
    setUndoStack(prev => [...prev, [...annotations]]);
    setAnnotations(prev => [...prev, newAnnotation]);
    setDrawing(false);
    setDrawStart(null);
    setDrawRect(null);
  }, [drawing, drawRect, currentImage, selectedClass, annotations]);

  const saveAnnotations = useCallback(async () => {
    if (!currentImage) return;
    setIsSaving(true);
    try {
      for (const ann of annotations) {
        if (ann.id.startsWith("temp-")) {
          await apiPost("/api/annotations", {
            imageId: currentImage.id,
            datasetId: currentImage.datasetId,
            className: ann.className,
            x: ann.x,
            y: ann.y,
            width: ann.width,
            height: ann.height,
            imageWidth: effectiveCanvasSize.w,
            imageHeight: effectiveCanvasSize.h,
          });
        }
      }
      refetchAnnotations();
      refetchWorkflow();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [currentImage, annotations, effectiveCanvasSize, refetchAnnotations, refetchWorkflow]);

  const deleteAnnotation = useCallback(async (ann: AnnotationRecord) => {
    setUndoStack(prev => [...prev, [...annotations]]);
    setAnnotations(prev => prev.filter(a => a.id !== ann.id));
    if (!ann.id.startsWith("temp-")) {
      try {
        await apiDelete(`/api/annotations?id=${ann.id}`);
        refetchAnnotations();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  }, [annotations, refetchAnnotations]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setAnnotations(prev);
    setUndoStack(stack => stack.slice(0, -1));
  }, [undoStack]);

  const goPrev = useCallback(() => setImageIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setImageIndex(i => Math.min(images.length - 1, i + 1)), [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") setSelectedTool("draw");
      if (e.key === "v" || e.key === "V") setSelectedTool("select");
      if (e.key === "a" || e.key === "A") goPrev();
      if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey) { /* handled above */ }
      else if (e.key === "d" || e.key === "D") { /* no-op for ctrl+d */ }
      if (e.key === "Delete" && selectedAnnotationId) {
        const ann = annotations.find(a => a.id === selectedAnnotationId);
        if (ann) deleteAnnotation(ann);
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedAnnotationId, annotations, deleteAnnotation, undo, goPrev]);

  const imageSrc = currentImage?.filepath
    ? `/api/serve/${currentImage.datasetId}/${currentImage.filename}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Annotation Studio" subtitle="Draw bounding boxes and assign class labels" step={4} totalSteps={15} />
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Dataset ID"
            value={datasetId}
            onChange={e => {
              setDatasetId(e.target.value);
              setImageIndex(0);
              setAnnotations([]);
              setSelectedAnnotationId(null);
              setUndoStack([]);
              setSelectedClass("");
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#111827] border border-[#2a3550] text-[#e2e8f0] w-40 focus:outline-none focus:border-blue-500"
          />
          {images.length > 0 && (
            <span className="text-[10px] badge-info px-2 py-0.5 rounded">
              Image {imageIndex + 1} / {images.length}
            </span>
          )}
          <button
            className="btn-secondary text-xs flex items-center gap-1"
            onClick={saveAnnotations}
            disabled={isSaving || annotations.length === 0}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: 600 }}>
        {/* Left: Class Selector */}
        <div className="glass-card-solid p-3 space-y-2 overflow-auto">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">Classes</h3>
          {classes.length > 0 ? (
            classes.map(cls => (
              <button key={cls.id} onClick={() => setSelectedClass(cls.name)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs transition-colors ${
                  selectedClass === cls.name ? "bg-blue-500/10 border border-blue-500/30 text-blue-400" : "hover:bg-[#111827] text-[#94a3b8]"
                }`}>
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: getColorForClass(cls.name, classes) }} />
                <span className="truncate">{cls.name}</span>
              </button>
            ))
          ) : (
            <p className="text-[10px] text-[#64748b]">Enter a dataset ID to load classes</p>
          )}
          <div className="border-t border-[#2a3550] pt-2 mt-2">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase mb-1">Keyboard Shortcuts</h3>
            <div className="space-y-1 text-[10px] text-[#64748b]">
              <p><kbd className="px-1 bg-[#111827] rounded text-[#94a3b8]">D</kbd> Draw mode</p>
              <p><kbd className="px-1 bg-[#111827] rounded text-[#94a3b8]">V</kbd> Select mode</p>
              <p><kbd className="px-1 bg-[#111827] rounded text-[#94a3b8]">Del</kbd> Delete box</p>
              <p><kbd className="px-1 bg-[#111827] rounded text-[#94a3b8]">Ctrl+Z</kbd> Undo</p>
              <p><kbd className="px-1 bg-[#111827] rounded text-[#94a3b8]">A/D</kbd> Prev/Next image</p>
            </div>
          </div>
        </div>

        {/* Center: Canvas */}
        <div className="lg:col-span-2 glass-card-solid overflow-hidden relative">
          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 border-b border-[#2a3550] bg-[#0d1220]">
            <button onClick={() => setSelectedTool("select")} className={`p-1.5 rounded ${selectedTool === "select" ? "bg-blue-500/20 text-blue-400" : "text-[#64748b] hover:text-[#94a3b8]"}`}>
              <MousePointer className="w-4 h-4" />
            </button>
            <button onClick={() => setSelectedTool("draw")} className={`p-1.5 rounded ${selectedTool === "draw" ? "bg-blue-500/20 text-blue-400" : "text-[#64748b] hover:text-[#94a3b8]"}`}>
              <Square className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[#2a3550] mx-1" />
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><ZoomIn className="w-4 h-4" /></button>
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><ZoomOut className="w-4 h-4" /></button>
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Move className="w-4 h-4" /></button>
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Grid3X3 className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-[#2a3550] mx-1" />
            <button onClick={undo} className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Undo2 className="w-4 h-4" /></button>
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Redo2 className="w-4 h-4" /></button>
            <div className="flex-1" />
            <span className="text-[10px] text-[#64748b] font-mono">{effectiveCanvasSize.w} × {effectiveCanvasSize.h}</span>
          </div>

          {/* Canvas Area */}
          <div className="annotation-canvas relative" style={{ height: 520 }}>
            <div
              ref={canvasRef}
              className="relative w-full h-full"
              style={{ cursor: selectedTool === "draw" ? "crosshair" : "default" }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            >
              {!datasetId ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[#64748b]">
                  <Database className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs font-semibold uppercase">Enter a Dataset ID</p>
                </div>
              ) : imagesLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
              ) : !currentImage ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[#64748b]">
                  <XCircle className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs font-semibold uppercase">NO IMAGES</p>
                  <p className="text-[10px] mt-1">Upload images in the Capture page first</p>
                </div>
              ) : (
                <>
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt=""
                      className="absolute inset-0 w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#111827] flex items-center justify-center">
                      <Image className="w-12 h-12 text-[#2a3550]" />
                    </div>
                  )}

                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${effectiveCanvasSize.w} ${effectiveCanvasSize.h}`}>
                    {annotations.map(ann => {
                      const color = getColorForClass(ann.className, classes);
                      const isSelected = ann.id === selectedAnnotationId;
                      return (
                        <g key={ann.id}>
                          <rect
                            x={ann.x} y={ann.y} width={ann.width} height={ann.height}
                            fill={isSelected ? `${color}22` : "none"}
                            stroke={color} strokeWidth={isSelected ? 3 : 2}
                            strokeDasharray={ann.id.startsWith("temp-") ? "6,3" : undefined}
                            style={{ pointerEvents: "all", cursor: "pointer" }}
                            onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(ann.id); }}
                          />
                          <rect x={ann.x} y={ann.y - 18} width={Math.max(ann.className.length * 7 + 12, 50)} height="18" rx="3" fill={color} />
                          <text x={ann.x + 6} y={ann.y - 5} fill="white" fontSize="10" fontFamily="monospace">{ann.className}</text>
                        </g>
                      );
                    })}
                    {drawRect && (
                      <rect
                        x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
                        fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,3"
                      />
                    )}
                  </svg>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between p-2 border-t border-[#2a3550] bg-[#0d1220]">
            <button onClick={goPrev} disabled={imageIndex === 0} className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft className="w-3 h-3" /> Previous
            </button>
            <span className="text-[10px] text-[#64748b]">Press A/D for quick navigation</span>
            <button onClick={goNext} disabled={imageIndex >= images.length - 1} className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Annotation List */}
        <div className="glass-card-solid p-3 space-y-2 overflow-auto">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">
            Annotations ({annotations.length})
          </h3>
          {annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#64748b]">
              <PenTool className="w-6 h-6 mb-2 opacity-40" />
              <p className="text-[10px]">No annotations</p>
              <p className="text-[9px] mt-1">Draw a box on the canvas</p>
            </div>
          ) : (
            annotations.map(ann => (
              <div
                key={ann.id}
                onClick={() => setSelectedAnnotationId(ann.id)}
                className={`p-2 rounded-lg space-y-1 cursor-pointer transition-colors ${
                  ann.id === selectedAnnotationId
                    ? "bg-blue-500/10 border border-blue-500/30"
                    : "bg-[#111827] hover:bg-[#1a2235]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: getColorForClass(ann.className, classes) }} />
                    <span className="text-xs font-semibold">{ann.className}</span>
                  </div>
                  <button
                    className="p-0.5 rounded hover:bg-rose-500/10"
                    onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann); }}
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-[#64748b]">
                  <span>x: {Math.round(ann.x)}</span><span>y: {Math.round(ann.y)}</span>
                  <span>w: {Math.round(ann.width)}</span><span>h: {Math.round(ann.height)}</span>
                </div>
                <div className="text-[9px] text-[#475569]">
                  norm: ({(ann.x / effectiveCanvasSize.w).toFixed(3)}, {(ann.y / effectiveCanvasSize.h).toFixed(3)}, {(ann.width / effectiveCanvasSize.w).toFixed(3)}, {(ann.height / effectiveCanvasSize.h).toFixed(3)})
                </div>
              </div>
            ))
          )}

          <div className="border-t border-[#2a3550] pt-2 mt-2">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase mb-1">Validation</h3>
            <div className="space-y-1 text-[10px]">
              {annotations.length === 0 ? (
                <div className="flex items-center gap-1 text-[#64748b]"><PenTool className="w-3 h-3" /> No annotations to validate</div>
              ) : (
                <>
                  <div className="flex items-center gap-1 text-emerald-400"><PenTool className="w-3 h-3" /> All boxes valid</div>
                  <div className="flex items-center gap-1 text-emerald-400"><Tag className="w-3 h-3" /> All labels assigned</div>
                  <div className="flex items-center gap-1 text-emerald-400"><Hash className="w-3 h-3" /> No overlapping boxes</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {workflow && <NextStepCard currentStep={workflow.currentStep} completedSteps={workflow.completedSteps} />}

      <HelpCard title="How annotation works">
        <p className="mb-2"><strong>Step 1:</strong> Select an image from the navigation.</p>
        <p className="mb-2"><strong>Step 2:</strong> Draw a box around each object you want the model to detect.</p>
        <p className="mb-2"><strong>Step 3:</strong> Choose the object&apos;s class from the left panel.</p>
        <p><strong>Step 4:</strong> Click Save to store your annotations in the database.</p>
      </HelpCard>
    </div>
  );
}
