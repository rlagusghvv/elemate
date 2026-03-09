"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ElephantMascot } from "@/components/elephant-mascot";
import { createChatSession, deleteChatSession, fetchChatSession, fetchChatSessions, sendChatMessage } from "@/lib/api";
import type { ChatSession, ChatSessionDetail } from "@/lib/types";

interface FreeChatPanelProps {
  workspacePath: string;
  compact?: boolean;
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
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
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
  }, [activeSessionId]);

  useEffect(() => {
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
  }, [activeSessionId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession, isSending]);

  const suggestions = compact ? PORTAL_SUGGESTIONS : LOCAL_SUGGESTIONS;
  const workspaceLabel =
    activeSession?.workspace_path || workspacePath || (compact ? "장비 주인이 아직 폴더를 연결하지 않았습니다." : "아직 작업 폴더를 연결하지 않았습니다.");

  const latestReplyHint = useMemo(() => {
    if (!activeSession?.messages.length) {
      return compact ? "휴대폰에서는 요청만 짧게 말하면 됩니다." : "정확한 파일 작업을 원하면 먼저 왼쪽에서 폴더를 연결하세요.";
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

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitDraft();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    if (event.nativeEvent.isComposing || isSending) {
      return;
    }
    event.preventDefault();
    submitDraft();
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
              <p className="eyebrow">{compact ? "Remote Chat" : "Chat"}</p>
              <h2 className="mt-3 font-display text-[30px] font-semibold tracking-[-0.05em] text-ink">말로 맡기면 됩니다.</h2>
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
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-5 sm:px-6">
          {activeSession?.messages.length ? (
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
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-steel">답변 작성 중...</div>
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
                  해야 할 일을 한 문장으로 적어도 됩니다. 정확한 파일 작업은 연결된 폴더를 기준으로, 위험한 작업은 승인 요청 후에 진행합니다.
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
              placeholder="예: 이 폴더를 먼저 읽고, 오늘 할 일을 쉬운 순서로 정리해줘."
              className="h-28 w-full resize-none rounded-[22px] border border-white/8 bg-[#09101a] px-4 py-4 text-[15px] leading-7 text-ink outline-none transition placeholder:text-steel focus:border-sky-300/34"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-xs text-steel">Enter 전송, Shift+Enter 줄바꿈</p>
              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSending ? "보내는 중" : "보내기"}
              </button>
            </div>
          </div>
          {error ? <p className="mt-3 rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        </form>
      </section>
    </section>
  );
}
