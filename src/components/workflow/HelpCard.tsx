"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

interface HelpCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function HelpCard({ title, children, defaultOpen = false }: HelpCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass-card-solid border-[#2a3550]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-[#94a3b8]">What&apos;s this?</span>
          <span className="text-[10px] text-[#64748b]">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#64748b]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#64748b]" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-[#94a3b8] leading-relaxed border-t border-[#2a3550] pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
      <div className="w-16 h-16 rounded-2xl bg-[#111827] border border-[#2a3550] flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 opacity-50" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-wider">{title}</p>
      {description && <p className="text-xs text-[#64748b] mt-1 text-center max-w-sm">{description}</p>}
      {action && (
        <a href={action.href} className="btn-primary text-xs mt-4">
          {action.label}
        </a>
      )}
    </div>
  );
}

interface InfoBarProps {
  type: "info" | "warning" | "success" | "error";
  children: React.ReactNode;
}

export function InfoBar({ type, children }: InfoBarProps) {
  const styles = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-300",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
    error: "bg-rose-500/10 border-rose-500/20 text-rose-300",
  };

  return (
    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${styles[type]}`}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  step?: number;
  totalSteps?: number;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, step, totalSteps, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex items-center gap-3 mt-1">
          {subtitle && <p className="text-sm text-[#94a3b8]">{subtitle}</p>}
          {step && totalSteps && (
            <span className="text-[10px] px-2 py-0.5 rounded badge-info font-mono">
              Step {step} of {totalSteps}
            </span>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
