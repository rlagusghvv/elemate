"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { TaskPicker } from "@/components/task-picker";
import { approveTask, fetchTask, fetchTasks, rejectTask } from "@/lib/api";
import { resolveActiveTaskId, writeActiveTaskId } from "@/lib/task-state";
import type { Approval, TaskDetail, TaskListItem } from "@/lib/types";

function findPendingApproval(task: TaskDetail | null): Approval | null {
  if (!task) {
    return null;
  }
  return task.approvals.find((approval) => approval.status === "PENDING") ?? null;
}

export function ApprovalBoard() {
  const searchParams = useSearchParams();
  const explicitTaskId = searchParams.get("task");

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        const taskItems = await fetchTasks();
        if (cancelled) {
          return;
        }

        setTasks(taskItems);
        const pendingTask = taskItems.find((item) => item.pending_approval_count > 0);
        setActiveTaskId(resolveActiveTaskId(taskItems, explicitTaskId ?? pendingTask?.id ?? null));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "승인 목록을 불러오지 못했습니다.");
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
      return;
    }

    const taskId = activeTaskId;
    writeActiveTaskId(taskId);
    let cancelled = false;

    async function loadTask() {
      try {
        const payload = await fetchTask(taskId);
        if (!cancelled) {
          setTask(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "승인 대상을 불러오지 못했습니다.");
        }
      }
    }

    void loadTask();
    const interval = window.setInterval(() => {
      void loadTask();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTaskId]);

  const pendingApproval = findPendingApproval(task);
  const guardedStep = task?.steps.find((step) => step.requires_approval) ?? null;

  function submitDecision(approve: boolean) {
    if (!task) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    void (async () => {
      try {
        if (approve) {
          await approveTask(task.id, { decided_by: "local-user", reason: note || "approved from dashboard" });
        } else {
          await rejectTask(task.id, { decided_by: "local-user", reason: note || "rejected from dashboard" });
        }

        const [taskItems, nextTask] = await Promise.all([fetchTasks(), fetchTask(task.id)]);
        setTasks(taskItems);
        setTask(nextTask);
        setNote("");
      } catch (decisionError) {
        setError(decisionError instanceof Error ? decisionError.message : "승인 처리에 실패했습니다.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <section className="space-y-4">
      <article className="panel p-6">
        <p className="eyebrow">Approval Gate</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">위험 작업 승인 큐</h1>
            <p className="mt-2 text-sm text-steel">원격 반영, 제출, 결제, 삭제, 배포 같은 액션은 여기서 멈춥니다.</p>
          </div>
          {task && <StatusBadge status={task.status} />}
        </div>
        <div className="mt-5">
          <TaskPicker tasks={tasks} activeTaskId={activeTaskId} onSelect={setActiveTaskId} />
        </div>
      </article>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {task ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <article className="panel p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-steel">{task.title}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{pendingApproval ? "승인 대기 중" : "대기 중인 승인 없음"}</h2>
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

            {pendingApproval ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
                  <p className="text-xs uppercase tracking-[0.08em] text-rose-700">Blocked Action</p>
                  <p className="mt-2 text-2xl font-semibold text-rose-950">{pendingApproval.action_type}</p>
                  <p className="mt-3 text-sm leading-6 text-rose-900">
                    {typeof pendingApproval.payload?.why_blocked === "string" ? pendingApproval.payload.why_blocked : "승인 정책에 의해 차단되었습니다."}
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white/85 p-5">
                  <p className="text-xs uppercase tracking-[0.08em] text-steel">Preview</p>
                  <p className="mt-3 font-mono text-sm text-ink">
                    {typeof pendingApproval.payload?.preview === "string" ? pendingApproval.payload.preview : "미리보기 없음"}
                  </p>
                  {guardedStep && <p className="mt-4 text-sm text-steel">관련 단계: {guardedStep.title}</p>}
                </div>

                <label className="block text-sm font-medium text-ink">
                  결정 메모
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="예: 배포는 아직 안 되고, 원격 푸시는 승인"
                    className="mt-2 h-28 w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm outline-none ring-mint/40 transition focus:ring"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => submitDecision(true)}
                    disabled={isSubmitting}
                    className="rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    승인 후 계속
                  </button>
                  <button
                    type="button"
                    onClick={() => submitDecision(false)}
                    disabled={isSubmitting}
                    className="rounded-2xl border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    거절하고 중단
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
                현재 이 작업에는 보류 중인 위험 액션이 없습니다. 승인 이력이 있거나, 안전 단계까지만 완료된 상태일 수 있습니다.
              </div>
            )}
          </article>

          <article className="panel p-6">
            <p className="eyebrow">Prepared Steps</p>
            <div className="mt-4 space-y-3">
              {task.steps.map((step) => (
                <div key={step.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{step.title}</p>
                    <StatusBadge status={step.status} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-steel">
                    {typeof step.output?.summary === "string" ? step.output.summary : "요약 없음"}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : (
        <article className="panel p-6 text-sm leading-6 text-steel">승인할 작업이 없습니다. 위험 액션이 포함된 작업을 먼저 생성하세요.</article>
      )}
    </section>
  );
}
