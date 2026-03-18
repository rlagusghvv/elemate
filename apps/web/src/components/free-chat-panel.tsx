"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ElephantMascot } from "@/components/elephant-mascot";
import {
  approveTask,
  createChatSession,
  createTask,
  deleteChatSession,
  fetchChatSession,
  fetchChatSessions,
  fetchTask,
  rejectTask,
  sendChatMessage,
} from "@/lib/api";
import type { ChatSession, ChatSessionDetail, TaskDetail } from "@/lib/types";

interface FreeChatPanelProps {
  workspacePath: string;
  compact?: boolean;
}

type PortalBubbleTone = "default" | "status" | "error";

interface PortalBubble {
  id: string;
  role: "assistant" | "user";
  content: string;
  created_at: string;
  tone?: PortalBubbleTone;
}

const LOCAL_SUGGESTIONS = [
  "이 폴더에서 먼저 뭐부터 하면 좋을지 정리해줘.",
  "이 사이트 설정 절차를 쉽게 설명해줘.",
  "내일 해야 할 일 초안부터 잡아줘.",
];

const PORTAL_SUGGESTIONS = [
  "지금 이 장비로 할 수 있는 일을 알려줘.",
  "이메일 보내기 전까지 필요한 준비만 해줘.",
  "사이트 설정 방법을 먼저 조사해줘.",
];
const PORTAL_TASK_STORAGE_KEY = "elemate.portal.active-task-id";
const PORTAL_FEED_STORAGE_KEY = "elemate.portal.feed.v4";

function createPortalBubble(role: PortalBubble["role"], content: string, tone: PortalBubbleTone = "default"): PortalBubble {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    tone,
    created_at: new Date().toISOString(),
  };
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "시간 정보 없음";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function FreeChatPanel({ workspacePath, compact = false }: FreeChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSessionDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isApprovalPending, setIsApprovalPending] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskDetail | null>(null);
  const [portalFeed, setPortalFeed] = useState<PortalBubble[]>([]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTaskNarrativeRef = useRef<string | null>(null);
  const lastObservedTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!compact) {
      return;
    }
    const stored = window.localStorage.getItem(PORTAL_TASK_STORAGE_KEY);
    if (stored) {
      setActiveTaskId(stored);
    }
  }, [compact]);

  useEffect(() => {
    if (!compact) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(PORTAL_FEED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PortalBubble[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPortalFeed(parsed);
          return;
        }
      }
    } catch {
      // Ignore bad local state and seed a fresh conversation.
    }
    setPortalFeed([
      createPortalBubble(
        "assistant",
        "무엇을 맡기실 건가요? 편하게 보내시면 바로 움직입니다.",
      ),
    ]);
  }, [compact]);

  useEffect(() => {
    if (!compact) {
      return;
    }
    window.localStorage.setItem(PORTAL_FEED_STORAGE_KEY, JSON.stringify(portalFeed));
  }, [compact, portalFeed]);

  useEffect(() => {
    if (compact) {
      return;
    }
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const nextSessions = await fetchChatSessions();
        if (cancelled) {
          return;
        }
        setSessions(nextSessions);
        if (!activeSessionId && nextSessions[0]) {
          setActiveSessionId(nextSessions[0].id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "대화 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, compact]);

  useEffect(() => {
    if (compact) {
      setActiveSession(null);
      return;
    }
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }

    let cancelled = false;
    void fetchChatSession(activeSessionId)
      .then((payload) => {
        if (!cancelled) {
          setActiveSession(payload);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "대화 내용을 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, compact]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession, activeTask, isSending, isExecuting, portalFeed, isApprovalPending]);

  useEffect(() => {
    if (!compact || !activeTaskId) {
      setActiveTask(null);
      return;
    }

    const taskId = activeTaskId;
    let cancelled = false;
    const terminalStatuses = new Set(["COMPLETED", "FAILED", "REJECTED", "CANCELED"]);

    async function loadTask() {
      try {
        const nextTask = await fetchTask(taskId);
        if (cancelled) {
          return;
        }
        setActiveTask(nextTask);
        if (terminalStatuses.has(nextTask.status)) {
          return;
        }
        window.setTimeout(() => {
          if (!cancelled) {
            void loadTask();
          }
        }, 2500);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "실행 상태를 불러오지 못했습니다.");
        }
      }
    }

    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [activeTaskId, compact]);

  useEffect(() => {
    if (!compact) {
      return;
    }
    if (!activeTaskId) {
      lastObservedTaskIdRef.current = null;
      lastTaskNarrativeRef.current = null;
      return;
    }
    if (lastObservedTaskIdRef.current !== activeTaskId) {
      lastObservedTaskIdRef.current = activeTaskId;
      lastTaskNarrativeRef.current = null;
    }
  }, [activeTaskId, compact]);

  useEffect(() => {
    if (!compact || !activeTask) {
      return;
    }
    const pending = activeTask.approvals.find((item) => item.status === "PENDING") ?? null;
    const narrative =
      activeTask.status === "WAITING_APPROVAL" && pending
        ? `${pending.action_type} 단계에서 승인이 필요해요. 아래에서 계속 진행할지 정해주세요.`
        : activeTask.status === "COMPLETED"
          ? activeTask.final_report || "작업을 마쳤어요."
          : activeTask.status === "FAILED"
            ? activeTask.final_report || "작업이 실패했어요. 조건을 조금 바꿔서 다시 맡겨주세요."
            : activeTask.status === "REJECTED"
              ? "요청하신 작업은 승인 거절로 여기서 멈췄어요."
              : activeTask.status === "CANCELED"
                ? "작업이 취소됐어요."
                : null;
    const signature = narrative ? `${activeTask.id}:${activeTask.status}:${narrative}` : null;
    if (!narrative || signature === lastTaskNarrativeRef.current) {
      return;
    }
    setPortalFeed((current) => [...current, createPortalBubble("assistant", narrative, activeTask.status === "FAILED" ? "error" : "status")]);
    lastTaskNarrativeRef.current = signature;
  }, [activeTask, compact]);

  const suggestions = compact ? PORTAL_SUGGESTIONS : LOCAL_SUGGESTIONS;
  const workspaceLabel =
    activeSession?.workspace_path || workspacePath || (compact ? "장비 주인이 아직 폴더를 연결하지 않았습니다." : "아직 작업 폴더를 연결하지 않았습니다.");

  const latestReplyHint = useMemo(() => {
    if (compact) {
      return "내 비서에게 말하듯 보내면 바로 실행을 시작합니다.";
    }
    if (!activeSession?.messages.length) {
      return "정확한 파일 작업을 원하면 먼저 왼쪽에서 폴더를 연결하세요.";
    }
    return "바로 이어서 질문하거나 다음 일을 맡기면 됩니다.";
  }, [activeSession, compact]);

  async function ensureSession(): Promise<string> {
    if (activeSessionId) {
      return activeSessionId;
    }
    const created = await createChatSession({
      title: "새 대화",
      workspace_path: workspacePath,
    });
    setActiveSession(created);
    setActiveSessionId(created.id);
    setSessions(await fetchChatSessions());
    return created.id;
  }

  function submitDraft() {
    const nextDraft = draft.trim();
    if (!nextDraft) {
      return;
    }

    setIsSending(true);
    setError(null);
    void (async () => {
      try {
        const sessionId = await ensureSession();
        const updated = await sendChatMessage(sessionId, { content: nextDraft });
        setActiveSession(updated);
        setActiveSessionId(updated.id);
        setDraft("");
        setSessions(await fetchChatSessions());
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : "메시지 전송에 실패했습니다.");
      } finally {
        setIsSending(false);
      }
    })();
  }

  function deriveTaskTitle(content: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "새 실행 작업";
    }
    return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
  }

  function runDraftAsTask() {
    const nextDraft = draft.trim();
    if (!nextDraft) {
      return;
    }

    if (compact) {
      setPortalFeed((current) => [
        ...current,
        createPortalBubble("user", nextDraft),
      ]);
    }
    setIsExecuting(true);
    setError(null);
    void (async () => {
      try {
        const created = await createTask({
          title: deriveTaskTitle(nextDraft),
          goal: nextDraft,
          workspace_path: activeSession?.workspace_path || workspacePath || null,
          requested_by: compact ? "portal-user" : "local-user",
          risk_level: "MEDIUM",
        });
        if (compact) {
          setActiveTaskId(created.id);
          window.localStorage.setItem(PORTAL_TASK_STORAGE_KEY, created.id);
        }
        setActiveTask(created);
        setDraft("");
      } catch (taskError) {
        if (compact) {
          setPortalFeed((current) => [
            ...current,
            createPortalBubble(
              "assistant",
              taskError instanceof Error ? taskError.message : "실행 작업을 시작하지 못했습니다.",
              "error",
            ),
          ]);
        }
        setError(taskError instanceof Error ? taskError.message : "실행 작업을 시작하지 못했습니다.");
      } finally {
        setIsExecuting(false);
      }
    })();
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (compact) {
      runDraftAsTask();
      return;
    }
    submitDraft();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    if (event.nativeEvent.isComposing || isSending || isExecuting) {
      return;
    }
    event.preventDefault();
    if (compact) {
      runDraftAsTask();
      return;
    }
    submitDraft();
  }

  async function handleApproval(approved: boolean) {
    if (!activeTask) {
      return;
    }
    const pending = activeTask.approvals.find((item) => item.status === "PENDING");
    if (!pending) {
      return;
    }
    setIsApprovalPending(true);
    setError(null);
    try {
      if (approved) {
        await approveTask(activeTask.id, { decided_by: "portal-user" });
      } else {
        await rejectTask(activeTask.id, { decided_by: "portal-user" });
      }
      setActiveTask(await fetchTask(activeTask.id));
    } catch (approvalError) {
      if (compact) {
        setPortalFeed((current) => [
          ...current,
          createPortalBubble(
            "assistant",
            approvalError instanceof Error ? approvalError.message : "승인 상태를 업데이트하지 못했습니다.",
            "error",
          ),
        ]);
      }
      setError(approvalError instanceof Error ? approvalError.message : "승인 상태를 업데이트하지 못했습니다.");
    } finally {
      setIsApprovalPending(false);
    }
  }

  function handleNewChat() {
    setActiveSessionId(null);
    setActiveSession(null);
    setDraft("");
    setError(null);
    window.setTimeout(() => textareaRef.current?.focus(), 40);
  }

  function handleDeleteCurrentChat() {
    if (!activeSessionId) {
      return;
    }
    setError(null);
    void (async () => {
      try {
        await deleteChatSession(activeSessionId);
        const nextSessions = await fetchChatSessions();
        setSessions(nextSessions);
        setActiveSessionId(nextSessions[0]?.id ?? null);
        setActiveSession(null);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "대화 삭제에 실패했습니다.");
      }
    })();
  }

  function applySuggestion(value: string) {
    setDraft(value);
    textareaRef.current?.focus();
  }

  const pendingApproval = activeTask?.approvals.find((item) => item.status === "PENDING") ?? null;
  const showPortalTyping =
    compact &&
    !pendingApproval &&
    (isExecuting || (activeTask ? ["PENDING", "PLANNING", "RUNNING"].includes(activeTask.status) : false));
  return (
    <section className={`grid gap-5 ${compact ? "min-h-[680px]" : "xl:grid-cols-[250px_minmax(0,1fr)]"}`}>
      {!compact ? (
        <aside className="panel overflow-hidden px-4 py-4 sm:px-5">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.04] p-4">
            <p className="eyebrow">Chats</p>
            <p className="ui-copy-sm mt-3">필요한 대화를 다시 열고, 새 대화를 바로 시작할 수 있습니다.</p>
            <button
              type="button"
              onClick={handleNewChat}
              className="ui-button-primary mt-4 w-full"
            >
              새 대화
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading ? <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-steel">불러오는 중...</div> : null}
            {!isLoading && sessions.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-steel">
                아직 대화가 없습니다. 오른쪽 입력창에 바로 말을 걸면 첫 대화가 생성됩니다.
              </div>
            ) : null}
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                    active
                      ? "border-sky-300/28 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]"
                      : "border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.06]"
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">{session.title}</p>
                  <p className="mt-2 text-xs text-steel">{formatTime(session.updated_at)}</p>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}

      <section className="panel flex min-h-[700px] flex-col overflow-hidden">
        <div className="border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{compact ? "Assistant" : "Chat"}</p>
              <h2 className="mt-3 font-display text-[30px] font-semibold tracking-[-0.05em] text-ink">
                {compact ? "내 비서와 대화하듯 맡기면 됩니다." : "말로 맡기면 됩니다."}
              </h2>
              <p className="ui-copy-sm mt-3 max-w-2xl">{latestReplyHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!compact ? (
                <button
                  type="button"
                  onClick={handleDeleteCurrentChat}
                  disabled={!activeSessionId}
                  className="ui-button-tertiary disabled:cursor-not-allowed disabled:opacity-45"
                >
                  현재 대화 삭제
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="ui-chip px-3 py-1.5">
              연결된 폴더: {workspaceLabel}
            </span>
            <span className="ui-chip px-3 py-1.5">
              승인 필요 작업은 중간에 멈춥니다
            </span>
            {compact ? <span className="ui-chip px-3 py-1.5">말투는 편하게, 실행은 바로</span> : null}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-5 sm:px-6">
          {compact ? (
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
              <div className="space-y-4">
                {portalFeed.map((message) => {
                  const isAssistant = message.role === "assistant";
                  const isError = message.tone === "error";
                  const isStatus = message.tone === "status";
                  return (
                    <div key={message.id} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[94%] rounded-[28px] px-4 py-3.5 text-[15px] leading-7 shadow-[0_24px_50px_-42px_rgba(0,0,0,0.82)] sm:max-w-[80%] ${
                          isAssistant
                            ? isError
                              ? "border border-red-400/18 bg-red-500/12 text-ink"
                              : isStatus
                                ? "border border-white/10 bg-white/[0.05] text-ink"
                                : "border border-white/10 bg-white/[0.05] text-ink"
                            : "border border-sky-300/18 bg-[linear-gradient(180deg,rgba(94,117,179,0.98),rgba(41,58,96,0.96))] text-white"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={`mt-3 text-[11px] ${isAssistant ? "text-steel" : "text-white/72"}`}>{formatTime(message.created_at)}</p>
                      </div>
                    </div>
                  );
                })}

                {pendingApproval ? (
                  <div className="flex justify-start">
                    <div className="max-w-[94%] rounded-[26px] border border-amber-300/18 bg-amber-500/10 px-4 py-4 sm:max-w-[80%]">
                      <p className="text-sm font-semibold text-ink">승인 필요</p>
                      <p className="mt-2 text-sm leading-7 text-steel">
                        {pendingApproval.action_type} 작업이 대기 중입니다. 확인 후 계속 진행할지 선택하세요.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApproval(true)}
                          disabled={isApprovalPending}
                          className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {isApprovalPending ? "처리 중" : "승인"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApproval(false)}
                          disabled={isApprovalPending}
                          className="ui-button-secondary disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          거절
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {showPortalTyping ? (
                  <div className="flex justify-start">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-steel">
                      <div className="portal-typing-dots" aria-label="에이전트 입력중">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                ) : null}

                {!portalFeed.length ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-3xl text-center">
                      <div className="mx-auto w-[180px]">
                        <ElephantMascot className="w-full" caption="짧게 말해도 됩니다." />
                      </div>
                      <h3 className="ui-title-section mt-6">무엇을 도와드릴까요?</h3>
                    </div>
                  </div>
                ) : null}

                {portalFeed.length <= 1 && !activeTaskId ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {suggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => applySuggestion(item)}
                        className="ui-button-secondary px-4 py-2.5"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div ref={messageEndRef} />
              </div>
            </div>
          ) : activeSession?.messages.length ? (
            <div className="space-y-4">
              {activeSession.messages.map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <div key={message.id} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[94%] rounded-[24px] px-4 py-3.5 text-[15px] leading-7 shadow-[0_24px_50px_-42px_rgba(0,0,0,0.82)] sm:max-w-[76%] ${
                        isAssistant
                          ? "border border-white/10 bg-white/[0.05] text-ink"
                          : "border border-sky-300/18 bg-[linear-gradient(180deg,rgba(75,99,155,0.96),rgba(30,44,74,0.96))] text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p className={`mt-3 text-[11px] ${isAssistant ? "text-steel" : "text-white/72"}`}>{formatTime(message.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              {isSending ? (
                <div className="flex justify-start">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-steel">
                    <div className="portal-typing-dots" aria-label="에이전트 입력중">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              ) : null}
              <div ref={messageEndRef} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-3xl text-center">
                <div className="mx-auto w-[180px]">
                  <ElephantMascot className="w-full" caption="짧게 말해도 됩니다." />
                </div>
                <h3 className="ui-title-section mt-6">무엇을 도와드릴까요?</h3>
                <p className="ui-copy-sm mx-auto mt-3 max-w-2xl">
                  {compact
                    ? "편하게 보내면 바로 실행을 시작합니다. 위험한 단계만 중간에 확인받고 멈춥니다."
                    : "해야 할 일을 한 문장으로 적어도 됩니다. 정확한 파일 작업은 연결된 폴더를 기준으로, 위험한 작업은 승인 요청 후에 진행합니다."}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => applySuggestion(item)}
                      className="ui-button-secondary px-4 py-2.5"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="border-t border-white/8 px-4 py-4 sm:px-6">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                compact
                  ? "예: 이 폴더를 읽고, 오늘 해야 할 일을 정리한 뒤 바로 실행해줘."
                  : "예: 이 폴더를 먼저 읽고, 오늘 할 일을 쉬운 순서로 정리해줘."
              }
              className="h-28 w-full resize-none rounded-[22px] border border-white/8 bg-[#09101a] px-4 py-4 text-[15px] leading-7 text-ink outline-none transition placeholder:text-steel focus:border-sky-300/34"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-xs text-steel">{compact ? "Enter 실행, Shift+Enter 줄바꿈" : "Enter 전송, Shift+Enter 줄바꿈"}</p>
              <div className="flex flex-wrap items-center gap-2">
                {compact ? (
                  <button
                    type="submit"
                    disabled={isExecuting || !draft.trim()}
                    className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isExecuting ? "실행 중" : "실행하기"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isSending ? "보내는 중" : "보내기"}
                  </button>
                )}
              </div>
            </div>
          </div>
          {error ? <p className="mt-3 rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        </form>
      </section>
    </section>
  );
}
