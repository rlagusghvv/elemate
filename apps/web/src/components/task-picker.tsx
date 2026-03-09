"use client";

import { StatusBadge } from "@/components/status-badge";
import type { TaskListItem } from "@/lib/types";

interface TaskPickerProps {
  tasks: TaskListItem[];
  activeTaskId: string | null;
  onSelect: (taskId: string) => void;
}

export function TaskPicker({ tasks, activeTaskId, onSelect }: TaskPickerProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-steel">
        아직 생성된 작업이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tasks.map((task) => {
        const active = task.id === activeTaskId;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            className={`rounded-[22px] border p-4 text-left transition ${
              active
                ? "border-ink bg-slate-900 text-white"
                : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-400"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`max-w-52 truncate text-sm font-semibold ${active ? "text-white" : "text-ink"}`}>{task.title}</p>
              <StatusBadge status={task.status} />
            </div>
            <p className={`mt-2 text-xs ${active ? "text-slate-300" : "text-steel"}`}>{task.risk_level} risk</p>
            <p className={`mt-2 max-w-full truncate text-xs ${active ? "text-slate-300" : "text-steel"}`}>{task.workspace_path ?? "workspace not set"}</p>
          </button>
        );
      })}
    </div>
  );
}
