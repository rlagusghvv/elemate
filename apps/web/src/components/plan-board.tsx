"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { TaskPicker } from "@/components/task-picker";
import { fetchTask, fetchTaskLogs, fetchTasks } from "@/lib/api";
import { resolveActiveTaskId, writeActiveTaskId } from "@/lib/task-state";
import type { TaskDetail, TaskListItem, TaskLogs } from "@/lib/types";

export function PlanBoard() {
  const searchParams = useSearchParams();
  const explicitTaskId = searchParams.get("task");

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [logs, setLogs] = useState<TaskLogs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        const taskItems = await fetchTasks();
        if (cancelled) {
          return;
        }
        setTasks(taskItems);
        setActiveTaskId(resolveActiveTaskId(taskItems, explicitTaskId));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "작업 목록을 불러오지 못했습니다.");
        }
      }
    }

    void loadTasks();
    const interval = window.setInterval(() => {
      void loadTasks();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [explicitTaskId]);

  useEffect(() => {
    if (!activeTaskId) {
      setTask(null);
      setLogs(null);
      return;
    }

    const taskId = activeTaskId;
    writeActiveTaskId(taskId);
    let cancelled = false;

    async function loadTaskDetail() {
      try {
        const [taskPayload, logsPayload] = await Promise.all([fetchTask(taskId), fetchTaskLogs(taskId)]);
        if (!cancelled) {
          setTask(taskPayload);
          setLogs(logsPayload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "계획 데이터를 불러오지 못했습니다.");
        }
      }
    }

    void loadTaskDetail();
    const interval = window.setInterval(() => {
      void loadTaskDetail();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTaskId]);

  return (
    <section className="space-y-4">
      <article className="panel p-6">
        <p className="eyebrow">Execution Plan</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">실제 작업 계획과 단계 로그</h1>
            <p className="mt-2 text-sm text-steel">Planner 결과, 툴 실행 단계, trace 로그를 한 화면에서 확인합니다.</p>
          </div>
          {task && <StatusBadge status={task.status} />}
        </div>
        <div className="mt-5">
          <TaskPicker tasks={tasks} activeTaskId={activeTaskId} onSelect={setActiveTaskId} />
        </div>
      </article>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {task ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-steel">{task.title}</p>
                <p className="mt-1 text-sm leading-6 text-steel">{task.final_report}</p>
                <p className="mt-3 text-xs text-steel">
                  Workspace: <span className="font-mono text-ink">{task.workspace_path ?? "workspace not set"}</span>
                </p>
                <p className="mt-1 text-xs text-steel">
                  Profile: <span className="font-mono text-ink">{task.model_profile ?? "default"}</span>
                </p>
              </div>
              <span className="rounded-full border border-slate-300 px-3 py-1 text-xs uppercase tracking-[0.08em] text-steel">
                {task.risk_level}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {task.steps.map((step) => {
                const summary = typeof step.output?.summary === "string" ? step.output.summary : "요약 없음";
                const tone =
                  step.status === "SUCCESS"
                    ? "border-emerald-200 bg-emerald-50"
                    : step.status === "PENDING"
                      ? "border-rose-200 bg-rose-50"
                      : step.status === "RUNNING"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200 bg-white";

                return (
                  <article key={step.id} className={`rounded-3xl border p-4 ${tone}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-steel">Step {step.position}</p>
                        <h2 className="mt-1 text-lg font-semibold text-ink">{step.title}</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-steel">
                          {step.tool_name}
                        </span>
                        <StatusBadge status={step.status} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-steel">{summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-steel">
                      {step.duration_ms && <span>{step.duration_ms} ms</span>}
                      {step.requires_approval && <span>approval gate</span>}
                      {step.error_code && <span>error: {step.error_code}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="panel p-6">
            <p className="eyebrow">Trace Log</p>
            <p className="mt-2 text-xs text-steel">{logs?.events.length ?? 0} events captured</p>
            <div className="mt-4 space-y-3">
              {logs?.events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{event.message}</p>
                    <span className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-steel">
                      {event.source}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-steel">{event.trace_id}</p>
                  <p className="mt-2 text-xs leading-5 text-steel">
                    {event.metadata ? JSON.stringify(event.metadata) : "추가 메타데이터 없음"}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : (
        <article className="panel p-6 text-sm leading-6 text-steel">표시할 작업이 없습니다. 메인 화면에서 먼저 작업을 생성하세요.</article>
      )}
    </section>
  );
}
