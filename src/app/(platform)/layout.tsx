"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Database, Camera, PenTool, ShieldCheck, BarChart3,
  Brain, FlaskConical, Target, ScanSearch, AlertTriangle, Box, FileText,
  BookOpen, Settings, Trophy, ChevronDown, Zap, Menu, X
} from "lucide-react";
import { useState, useEffect } from "react";
import { WorkflowStepper } from "@/components/workflow";
import { useWorkflowState } from "@/lib/useWorkflowState";
import { useApi } from "@/lib/hooks";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/competition", icon: Trophy, label: "Competition" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/datasets", icon: Database, label: "Dataset Studio" },
      { href: "/capture", icon: Camera, label: "Capture" },
      { href: "/annotation", icon: PenTool, label: "Annotation" },
      { href: "/quality", icon: ShieldCheck, label: "Quality" },
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/training", icon: Brain, label: "Training" },
      { href: "/experiments", icon: FlaskConical, label: "Experiments" },
      { href: "/evaluation", icon: Target, label: "Evaluation" },
      { href: "/inference", icon: ScanSearch, label: "Inference" },
      { href: "/errors", icon: AlertTriangle, label: "Errors" },
    ],
  },
  {
    label: "Registry",
    items: [
      { href: "/models", icon: Box, label: "Models" },
      { href: "/reports", icon: FileText, label: "Reports" },
      { href: "/docs", icon: BookOpen, label: "Docs" },
      { href: "/system", icon: Settings, label: "System" },
    ],
  },
  {
    label: "Publish",
    items: [
      { href: "/kaggle", icon: Trophy, label: "Kaggle" },
    ],
  },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Overview: true, Data: true, AI: true, Registry: true, Publish: true,
  });
  const { state: workflowState } = useWorkflowState();
  const { data: healthData } = useApi<{ mode: string; database: string; storage: string }>("/api/health");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSection = (label: string) => {
    setExpandedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const pageTitle = navSections.flatMap(s => s.items).find(i => i.href === pathname)?.label || "VisionBharat";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen
        ${collapsed ? "w-16" : "w-60"}
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        flex-shrink-0 bg-[#0d1220] border-r border-[#1a2540] flex flex-col
        transition-all duration-200
      `}>
        {/* Logo */}
        <div className="p-3 border-b border-[#1a2540] flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold gradient-text truncate">VISIONBHARAT</h1>
              <p className="text-[9px] text-[#64748b] truncate">DataGenesis 2026</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {navSections.map(section => (
            <div key={section.label} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#64748b] hover:text-[#94a3b8]"
                >
                  <span>{section.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedSections[section.label] ? "rotate-180" : ""}`} />
                </button>
              )}
              {collapsed && <div className="my-1 mx-auto w-6 h-px bg-[#1a2540]" />}
              {(expandedSections[section.label] || collapsed) && (
                <div className="space-y-px">
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
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t border-[#1a2540] hidden lg:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="sidebar-link w-full justify-center"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`} />
          </button>
        </div>

        {/* Credit */}
        {!collapsed && (
          <div className="p-2 border-t border-[#1a2540] hidden lg:block">
            <p className="text-[9px] text-[#475569] leading-tight">Built by Arul Maria Agnes</p>
            <p className="text-[9px] text-[#475569] leading-tight">Ramco Institute of Technology</p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-[#1a2540]">
          <div className="flex items-center gap-3 px-4 py-2">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-[#1a2540] text-[#94a3b8]"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Page title */}
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-sm font-semibold truncate">{pageTitle}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded badge-info font-mono flex-shrink-0">v1.0.0</span>
            </div>

            <div className="flex-1" />

            {/* Status */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded ${healthData?.mode === "DEGRADED" ? "badge-warning" : "badge-success"}`}>
                {healthData?.mode ?? "CHECKING"}
              </span>
              <div className={`w-2 h-2 rounded-full ${healthData?.database === "healthy" && healthData?.storage === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            </div>
          </div>

          {/* Workflow stepper — compact, only on desktop */}
          {workflowState && (
            <div className="hidden md:block px-4 pb-2">
              <WorkflowStepper
                currentStep={workflowState.currentStep}
                completedSteps={workflowState.completedSteps}
                compact
              />
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
