"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Database, Camera, PenTool, ShieldCheck, BarChart3,
  Brain, FlaskConical, Target, ScanSearch, AlertTriangle, Box, FileText,
  BookOpen, Settings, Trophy, ChevronDown, Zap
} from "lucide-react";
import { useState } from "react";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/competition", icon: Trophy, label: "Competition Mode" },
    ],
  },
  {
    label: "Dataset Engineering",
    items: [
      { href: "/datasets", icon: Database, label: "Dataset Studio" },
      { href: "/capture", icon: Camera, label: "Capture" },
      { href: "/annotation", icon: PenTool, label: "Annotation" },
      { href: "/quality", icon: ShieldCheck, label: "Quality Control" },
      { href: "/analytics", icon: BarChart3, label: "Dataset Analytics" },
    ],
  },
  {
    label: "AI & Training",
    items: [
      { href: "/training", icon: Brain, label: "Training Lab" },
      { href: "/experiments", icon: FlaskConical, label: "Experiments" },
      { href: "/evaluation", icon: Target, label: "Evaluation" },
      { href: "/inference", icon: ScanSearch, label: "Inference Studio" },
      { href: "/errors", icon: AlertTriangle, label: "Error Analysis" },
    ],
  },
  {
    label: "Registry & Reports",
    items: [
      { href: "/models", icon: Box, label: "Model Registry" },
      { href: "/reports", icon: FileText, label: "Reports" },
      { href: "/docs", icon: BookOpen, label: "Documentation" },
      { href: "/system", icon: Settings, label: "System" },
    ],
  },
  {
    label: "Publication",
    items: [
      { href: "/kaggle", icon: Trophy, label: "Kaggle Publication" },
    ],
  },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Overview: true, "Dataset Engineering": true, "AI & Training": true, "Registry & Reports": true, "Publication": true,
  });

  const toggleSection = (label: string) => {
    setExpandedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex min-h-screen grid-bg">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-64"} flex-shrink-0 bg-[#0d1220] border-r border-[#1a2540] flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="p-4 border-b border-[#1a2540]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-sm font-bold gradient-text">VISIONBHARAT</h1>
                <p className="text-[10px] text-[#64748b]">DataGenesis 2026</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navSections.map(section => (
            <div key={section.label} className="mb-2">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="flex items-center justify-between w-full px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748b] hover:text-[#94a3b8]"
                >
                  <span>{section.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedSections[section.label] ? "rotate-180" : ""}`} />
                </button>
              )}
              {collapsed && <div className="my-2 mx-auto w-6 h-px bg-[#1a2540]" />}
              {(expandedSections[section.label] || collapsed) && (
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link ${isActive ? "active" : ""} ${collapsed ? "justify-center px-2" : ""}`}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-[#1a2540]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="sidebar-link w-full justify-center"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`} />
          </button>
        </div>

        {/* Credit */}
        {!collapsed && (
          <div className="p-3 border-t border-[#1a2540]">
            <p className="text-[10px] text-[#475569]">Built by Arul Maria Agnes</p>
            <p className="text-[10px] text-[#475569]">Ramco Institute of Technology</p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 bg-[#0a0e17]/80 backdrop-blur-lg border-b border-[#1a2540] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold">
              {navSections.flatMap(s => s.items).find(i => i.href === pathname)?.label || "VisionBharat"}
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded badge-info font-mono">v1.0.0</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] px-2 py-0.5 rounded badge-success">REAL MODE</span>
            <span className="text-[10px] px-2 py-0.5 rounded badge-success">OFFLINE</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </header>

        <div className="p-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
