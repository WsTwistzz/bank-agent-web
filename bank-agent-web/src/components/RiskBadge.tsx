import type { LucideIcon } from "lucide-react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import type { RiskLevel } from "../types";

const CONFIG: Record<
  RiskLevel,
  { label: string; icon: LucideIcon; className: string; dot: string }
> = {
  green: {
    label: "绿色 · 自动执行",
    icon: ShieldCheck,
    dot: "bg-safe-400",
    className:
      "border-safe-500/25 bg-safe-500/10 text-safe-400",
  },
  yellow: {
    label: "黄色 · 需要确认",
    icon: ShieldAlert,
    dot: "bg-warn-400",
    className:
      "border-warn-500/25 bg-warn-500/10 text-warn-400",
  },
  red: {
    label: "红色 · 强验证",
    icon: Shield,
    dot: "bg-risk-400",
    className:
      "border-risk-500/25 bg-risk-500/10 text-risk-400",
  },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { label, icon: Icon, className, dot } = CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse-ring`} />
      <Icon size={12} strokeWidth={2.4} />
      {label}
    </span>
  );
}
