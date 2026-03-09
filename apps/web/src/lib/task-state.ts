import type { TaskListItem } from "@/lib/types";

const ACTIVE_TASK_STORAGE_KEY = "elemate.activeTaskId";
const LEGACY_ACTIVE_TASK_STORAGE_KEY = "forge-agent.activeTaskId";

export function deriveTaskTitle(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "Untitled task";
  }
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

export function readActiveTaskId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const current = window.localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
  if (current) {
    return current;
  }
  const legacy = window.localStorage.getItem(LEGACY_ACTIVE_TASK_STORAGE_KEY);
  if (legacy) {
    window.localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, legacy);
  }
  return legacy;
}

export function writeActiveTaskId(taskId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, taskId);
}

export function resolveActiveTaskId(tasks: TaskListItem[], explicitTaskId: string | null): string | null {
  if (explicitTaskId) {
    return explicitTaskId;
  }

  const stored = readActiveTaskId();
  if (stored && tasks.some((task) => task.id === stored)) {
    return stored;
  }

  return tasks[0]?.id ?? null;
}
