"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { TaskPicker } from "@/components/task-picker";
import { API_BASE_URL, fetchTask, fetchTaskLogs, fetchTaskReplay, fetchTasks } from "@/lib/api";
import { resolveActiveTaskId, writeActiveTaskId } from "@/lib/task-state";
import type { Artifact, TaskDetail, TaskListItem, TaskLogs, TaskReplay } from "@/lib/types";

function artifactLabel(artifact: Artifact): string {
  if (typeof artifact.metadata?.label === "string") {
    return artifact.metadata.label;
  }
  return artifact.type;
}

function passthroughLoader({ src }: ImageLoaderProps): string {
  return src;
}

export function ReplayBoard() {
  const searchParams = useSearchParams();
  const explicitTaskId = searchParams.get("task");

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [logs, setLogs] = useState<TaskLogs | null>(null);
  const [replay, setReplay] = useState<TaskReplay | null>(null);
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
          setError(loadError instanceof Error ? loadError.message : "리플레이 목록을 불러오지 못했습니다.");
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
      setReplay(null);
      return;
    }

    const taskId = activeTaskId;
    writeActiveTaskId(taskId);
    let cancelled = false;

    async function loadReplay() {
      try {
        const [taskPayload, logPayload, replayPayload] = await Promise.all([
          fetchTask(taskId),
          fetchTaskLogs(taskId),
          fetchTaskReplay(taskId),
        ]);

        if (!cancelled) {
          setTask(taskPayload);
          setLogs(logPayload);
          setReplay(replayPayload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "리플레이 데이터를 불러오지 못했습니다.");
        }
      }
    }

    void loadReplay();
    const interval = window.setInterval(() => {
      void loadReplay();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTaskId]);

  const screenshotArtifacts = replay?.artifacts.filter((artifact) => artifact.type === "screenshot") ?? [];
  const actionArtifacts = replay?.artifacts.filter((artifact) => artifact.type === "action") ?? [];

  return (
    <section className="space-y-4">
      <article className="panel p-6">
        <p className="eyebrow">Replay</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">데스크탑 제어 리플레이</h1>
            <p className="mt-2 text-sm text-steel">브라우저/데스크탑 액션, 스크린샷, JSON 액션 로그를 함께 봅니다.</p>
          </div>
          {task && <StatusBadge status={task.status} />}
        </div>
        <div className="mt-5">
          <TaskPicker tasks={tasks} activeTaskId={activeTaskId} onSelect={setActiveTaskId} />
        </div>
      </article>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {task ? (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-steel">{task.title}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">스크린샷 타임라인</h2>
                <p className="mt-3 text-xs text-steel">
                  Workspace: <span className="font-mono text-ink">{task.workspace_path ?? "workspace not set"}</span>
                </p>
                <p className="mt-1 text-xs text-steel">
                  Profile: <span className="font-mono text-ink">{task.model_profile ?? "default"}</span>
                </p>
              </div>
              <span className="rounded-full border border-slate-300 px-3 py-1 text-xs uppercase tracking-[0.08em] text-steel">
                {screenshotArtifacts.length} captures
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {screenshotArtifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-3xl border border-slate-200 bg-white/85 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{artifactLabel(artifact)}</p>
                    <a
                      href={`${API_BASE_URL}${artifact.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-steel transition hover:border-ink hover:text-ink"
                    >
                      raw artifact
                    </a>
                  </div>
                  <Image
                    loader={passthroughLoader}
                    unoptimized
                    src={`${API_BASE_URL}${artifact.path}`}
                    alt={artifactLabel(artifact)}
                    width={1440}
                    height={900}
                    className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-950/5"
                  />
                  <p className="mt-3 text-xs text-steel">
                    viewport {typeof artifact.metadata?.viewport === "string" ? artifact.metadata.viewport : "unknown"}
                  </p>
                </div>
              ))}
              {screenshotArtifacts.length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm leading-6 text-steel">
                  아직 캡처된 화면이 없습니다.
                </div>
              )}
            </div>
          </article>

          <article className="panel p-6">
            <p className="eyebrow">Action Trace</p>
            <div className="mt-4 space-y-3">
              {logs?.events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{event.message}</p>
                    <span className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-steel">
                      {event.source}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-steel">
                    {event.metadata ? JSON.stringify(event.metadata) : "추가 메타데이터 없음"}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-steel">Action Artifacts</p>
              <div className="mt-3 space-y-2">
                {actionArtifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={`${API_BASE_URL}${artifact.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-ink"
                  >
                    <span>{artifactLabel(artifact)}</span>
                    <span className="font-mono text-xs text-steel">{artifact.mime_type}</span>
                  </a>
                ))}
                {actionArtifacts.length === 0 && <p className="text-sm text-steel">저장된 액션 아티팩트가 없습니다.</p>}
              </div>
            </div>
          </article>
        </div>
      ) : (
        <article className="panel p-6 text-sm leading-6 text-steel">리플레이할 작업이 없습니다. 먼저 작업을 생성하세요.</article>
      )}
    </section>
  );
}
