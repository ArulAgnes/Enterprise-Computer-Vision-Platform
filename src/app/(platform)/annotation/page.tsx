"use client";

import { useState } from "react";
import { PenTool, ZoomIn, ZoomOut, Move, Trash2, Undo2, Redo2, ChevronLeft, ChevronRight, Save, Square, MousePointer, Image, Tag, Hash, Grid3X3 } from "lucide-react";

const demoAnnotations = [
  { id: 1, className: "Clay Diya", x: 120, y: 85, w: 200, h: 180, conf: 1.0 },
  { id: 2, className: "Temple Bell", x: 380, y: 150, w: 150, h: 170, conf: 1.0 },
  { id: 3, className: "Incense Holder", x: 50, y: 300, w: 130, h: 100, conf: 1.0 },
];

const demoClasses = ["Clay Diya", "Brass Diya", "Hanging Diya", "Multi-wick Diya", "Kuthu Vilakku", "Temple Bell", "Incense Holder", "Ritual Plate"];
const classColors: Record<string, string> = { "Clay Diya": "#f59e0b", "Brass Diya": "#ef4444", "Hanging Diya": "#8b5cf6", "Multi-wick Diya": "#06b6d4", "Kuthu Vilakku": "#10b981", "Temple Bell": "#f97316", "Incense Holder": "#ec4899", "Ritual Plate": "#6366f1" };

export default function AnnotationPage() {
  const [selectedClass, setSelectedClass] = useState(demoClasses[0]);
  const [selectedTool, setSelectedTool] = useState<"select" | "draw">("draw");
  const [currentImage, setCurrentImage] = useState(1);
  const totalImages = 763;
  const [annotations, setAnnotations] = useState(demoAnnotations);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Annotation Studio</h1>
          <p className="text-sm text-[#94a3b8]">Draw bounding boxes and assign class labels</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] badge-info px-2 py-0.5 rounded">Image {currentImage} / {totalImages}</span>
          <button className="btn-secondary text-xs flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: 600 }}>
        {/* Left: Class Selector */}
        <div className="glass-card-solid p-3 space-y-2 overflow-auto">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">Classes</h3>
          {demoClasses.map(cls => (
            <button key={cls} onClick={() => setSelectedClass(cls)}
              className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs transition-colors ${
                selectedClass === cls ? "bg-blue-500/10 border border-blue-500/30 text-blue-400" : "hover:bg-[#111827] text-[#94a3b8]"
              }`}>
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: classColors[cls] }} />
              <span className="truncate">{cls}</span>
            </button>
          ))}
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
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Undo2 className="w-4 h-4" /></button>
            <button className="p-1.5 rounded text-[#64748b] hover:text-[#94a3b8]"><Redo2 className="w-4 h-4" /></button>
            <div className="flex-1" />
            <span className="text-[10px] text-[#64748b] font-mono">640 × 480</span>
          </div>

          {/* Canvas Area */}
          <div className="annotation-canvas relative" style={{ height: 520 }}>
            <svg className="w-full h-full" viewBox="0 0 640 480">
              {/* Placeholder image representation */}
              <rect x="0" y="0" width="640" height="480" fill="#111827" />
              <text x="320" y="240" textAnchor="middle" fill="#2a3550" fontSize="14">Image Canvas — {currentImage}</text>
              {/* Bounding boxes */}
              {annotations.map(ann => (
                <g key={ann.id}>
                  <rect x={ann.x} y={ann.y} width={ann.w} height={ann.h}
                    fill="none" stroke={classColors[ann.className] || "#3b82f6"} strokeWidth="2" strokeDasharray="5,3" />
                  <rect x={ann.x} y={ann.y - 18} width={ann.className.length * 7 + 12} height="18" rx="3"
                    fill={classColors[ann.className] || "#3b82f6"} />
                  <text x={ann.x + 6} y={ann.y - 5} fill="white" fontSize="10" fontFamily="monospace">{ann.className}</text>
                </g>
              ))}
            </svg>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between p-2 border-t border-[#2a3550] bg-[#0d1220]">
            <button onClick={() => setCurrentImage(Math.max(1, currentImage - 1))} className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Previous
            </button>
            <span className="text-[10px] text-[#64748b]">Press A/D for quick navigation</span>
            <button onClick={() => setCurrentImage(Math.min(totalImages, currentImage + 1))} className="btn-secondary text-[10px] px-3 py-1 flex items-center gap-1">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Annotation List */}
        <div className="glass-card-solid p-3 space-y-2 overflow-auto">
          <h3 className="text-xs font-semibold text-[#94a3b8] uppercase">Annotations ({annotations.length})</h3>
          {annotations.map(ann => (
            <div key={ann.id} className="p-2 rounded-lg bg-[#111827] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: classColors[ann.className] }} />
                  <span className="text-xs font-semibold">{ann.className}</span>
                </div>
                <button className="p-0.5 rounded hover:bg-rose-500/10"><Trash2 className="w-3 h-3 text-rose-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-[#64748b]">
                <span>x: {ann.x}</span><span>y: {ann.y}</span>
                <span>w: {ann.w}</span><span>h: {ann.h}</span>
              </div>
              <div className="text-[9px] text-[#475569]">
                norm: ({(ann.x / 640).toFixed(3)}, {(ann.y / 480).toFixed(3)}, {(ann.w / 640).toFixed(3)}, {(ann.h / 480).toFixed(3)})
              </div>
            </div>
          ))}

          <div className="border-t border-[#2a3550] pt-2 mt-2">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase mb-1">Validation</h3>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-1 text-emerald-400"><PenTool className="w-3 h-3" /> All boxes valid</div>
              <div className="flex items-center gap-1 text-emerald-400"><Tag className="w-3 h-3" /> All labels assigned</div>
              <div className="flex items-center gap-1 text-emerald-400"><Hash className="w-3 h-3" /> No overlapping boxes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
