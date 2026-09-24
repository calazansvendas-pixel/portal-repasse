import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-surface-green text-brand-primaryDark dark:bg-white/5 dark:text-white/80",
    success: "bg-status-success/10 text-status-success",
    warning: "bg-status-warning/10 text-status-warning",
    danger: "bg-status-danger/10 text-status-danger",
  };

  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-secondary dark:text-white/60">{label}</p>
        <p className="text-xl font-bold tabular-nums text-ink-primary dark:text-white">{value}</p>
      </div>
    </div>
  );
}
