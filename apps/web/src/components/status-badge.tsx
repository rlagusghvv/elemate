import type { ApprovalStatus, StepStatus, TaskStatus } from "@/lib/types";

type StatusValue = TaskStatus | StepStatus | ApprovalStatus;

const STATUS_STYLES: Record<StatusValue, string> = {
  PENDING: "border-slate-300 bg-white text-slate-700",
  PLANNING: "border-cyan-300 bg-cyan-50 text-cyan-900",
  RUNNING: "border-amber-300 bg-amber-50 text-amber-900",
  WAITING_APPROVAL: "border-rose-300 bg-rose-50 text-rose-900",
  COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  FAILED: "border-red-300 bg-red-50 text-red-900",
  REJECTED: "border-red-300 bg-red-50 text-red-900",
  CANCELED: "border-slate-400 bg-slate-100 text-slate-800",
  SUCCESS: "border-emerald-300 bg-emerald-50 text-emerald-900",
  SKIPPED: "border-slate-300 bg-slate-100 text-slate-700",
  APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

export function StatusBadge({ status }: { status: StatusValue }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLES[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
