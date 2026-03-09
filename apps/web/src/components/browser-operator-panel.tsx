"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createBrowserSession,
  deleteBrowserSession,
  executeBrowserSessionAction,
  fetchBrowserSession,
  fetchBrowserSessions,
  resolveApiUrl,
} from "@/lib/api";
import type { BrowserSession, BrowserSessionActionType } from "@/lib/types";

function formatTime(value: string): string {
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

export function BrowserOperatorPanel({ compact = false }: { compact?: boolean }) {
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<BrowserSession | null>(null);
  const [urlDraft, setUrlDraft] = useState("https://example.com");
  const [selectorDraft, setSelectorDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("Enter");
  const [scrollDraft, setScrollDraft] = useState("600");
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const refreshSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextSessions = await fetchBrowserSessions();
      setSessions(nextSessions);
      if (!activeSessionId && nextSessions[0]) {
        setActiveSessionId(nextSessions[0].session_id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "브라우저 세션 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }
    void fetchBrowserSession(activeSessionId)
      .then((session) => {
        setActiveSession(session);
        if (typeof session.last_extract?.text === "string") {
          setExtractResult(session.last_extract.text);
        }
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "브라우저 세션을 불러오지 못했습니다.");
      });
  }, [activeSessionId]);

  async function handleOpenSession() {
    setIsActing(true);
    setError(null);
    try {
      const session = await createBrowserSession({ url: urlDraft });
      setActiveSession(session);
      setActiveSessionId(session.session_id);
      setExtractResult(null);
      setSessions(await fetchBrowserSessions());
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "브라우저 세션을 열지 못했습니다.");
    } finally {
      setIsActing(false);
    }
  }

  async function runAction(action: "goto" | "click" | "type" | "press" | "scroll" | "snapshot" | "extract") {
    if (!activeSessionId) {
      return;
    }
    setIsActing(true);
    setError(null);
    try {
      const session = await executeBrowserSessionAction(activeSessionId, {
        action,
        url: action === "goto" ? urlDraft : undefined,
        selector: action === "click" || action === "type" || action === "extract" ? selectorDraft : undefined,
        text: action === "type" ? textDraft : undefined,
        key: action === "press" ? keyDraft : undefined,
        delta_y: action === "scroll" ? Number(scrollDraft) || 600 : undefined,
      });
      setActiveSession(session);
      setSessions(await fetchBrowserSessions());
      setExtractResult(typeof session.last_extract?.text === "string" ? session.last_extract.text : null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "브라우저 액션 실행에 실패했습니다.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleCloseSession() {
    if (!activeSessionId) {
      return;
    }
    setIsActing(true);
    setError(null);
    try {
      await deleteBrowserSession(activeSessionId);
      const nextSessions = await fetchBrowserSessions();
      setSessions(nextSessions);
      setActiveSessionId(nextSessions[0]?.session_id ?? null);
      setActiveSession(nextSessions[0] ?? null);
      setExtractResult(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "브라우저 세션 종료에 실패했습니다.");
    } finally {
      setIsActing(false);
    }
  }

  const screenshotUrl = useMemo(() => {
    if (!activeSession?.screenshot_path) {
      return null;
    }
    return resolveApiUrl(activeSession.screenshot_path);
  }, [activeSession]);

  return (
    <section className="panel overflow-hidden border-white/10 bg-[rgba(9,12,20,0.94)]">
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Site Helper</p>
            <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.03em] text-ink">사이트 도우미</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-steel">
              채팅만으로 부족할 때 직접 사이트를 열고 화면을 보면서 다음 동작을 시험할 수 있는 보조 도구입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshSessions()}
              className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09]"
            >
              목록 새로고침
            </button>
            <button
              type="button"
              onClick={() => void handleCloseSession()}
              disabled={!activeSessionId || isActing}
              className="rounded-full border border-rose-400/28 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/14 disabled:cursor-not-allowed disabled:opacity-45"
            >
              현재 사이트 닫기
            </button>
          </div>
        </div>
      </div>

      <div className={`grid gap-5 px-5 py-5 sm:px-6 ${compact ? "xl:grid-cols-[280px_minmax(0,1fr)]" : "xl:grid-cols-[320px_minmax(0,1fr)]"}`}>
        <aside className="space-y-4">
          <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">새 사이트 열기</p>
            <input
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              className="mt-3 w-full rounded-[18px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
              placeholder="https://example.com"
            />
            <button
              type="button"
              onClick={() => void handleOpenSession()}
              disabled={isActing}
              className="mt-3 w-full rounded-full border border-sky-400/26 bg-sky-400/12 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/18 disabled:cursor-not-allowed disabled:opacity-45"
            >
              사이트 열기
            </button>
          </div>

          <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">최근 사이트</p>
            <div className="mt-3 space-y-2">
              {isLoading && <p className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-steel">불러오는 중...</p>}
              {!isLoading && sessions.length === 0 && (
                <p className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-steel">
                  아직 연 사이트가 없습니다.
                </p>
              )}
              {sessions.map((session) => {
                const active = session.session_id === activeSessionId;
                return (
                  <button
                    key={session.session_id}
                    type="button"
                    onClick={() => setActiveSessionId(session.session_id)}
                    className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-sky-400/28 bg-sky-400/10"
                        : "border-white/8 bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.07]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{session.title || session.url}</p>
                    <p className="mt-1 text-xs text-steel">{session.url}</p>
                    <p className="mt-2 text-xs text-steel">{formatTime(session.updated_at)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="rounded-[20px] border border-rose-400/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">{error}</p>}
        </aside>

        <section className="space-y-4">
          <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
            <div className="grid gap-3 xl:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">사이트 주소</p>
                <input
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">클릭 위치(CSS 선택자)</p>
                <input
                  value={selectorDraft}
                  onChange={(event) => setSelectorDraft(event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
                  placeholder="button[type='submit']"
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">입력할 내용</p>
                <input
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
                  placeholder="입력할 값"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">키보드 키</p>
                  <input
                    value={keyDraft}
                    onChange={(event) => setKeyDraft(event.target.value)}
                    className="mt-2 w-full rounded-[16px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">스크롤 거리</p>
                  <input
                    value={scrollDraft}
                    onChange={(event) => setScrollDraft(event.target.value)}
                    className="mt-2 w-full rounded-[16px] border border-white/10 bg-[#0d1320] px-4 py-3 text-sm text-ink outline-none transition focus:border-sky-400/32"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["goto", "페이지 열기"],
                ["click", "선택자 클릭"],
                ["type", "텍스트 입력"],
                ["press", "키 입력"],
                ["scroll", "스크롤"],
                ["snapshot", "스냅샷"],
                ["extract", "내용 추출"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void runAction(action as BrowserSessionActionType)}
                  disabled={!activeSessionId || isActing}
                  className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">현재 화면</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{activeSession?.title || "브라우저 세션을 열어 주세요."}</p>
                  <p className="mt-2 text-sm leading-6 text-steel">{activeSession?.url}</p>
                </div>
                {activeSession && (
                  <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-steel">
                    {activeSession.last_action}
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-white/8 bg-[#0d1320]">
                {screenshotUrl ? (
                  <div
                    className="min-h-[420px] bg-contain bg-top bg-no-repeat"
                    style={{ backgroundImage: `url(${screenshotUrl})` }}
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center px-6 text-sm text-steel">아직 불러온 화면이 없습니다.</div>
                )}
              </div>

              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">읽어온 요약</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">
                  {activeSession?.text_excerpt || "페이지를 열면 본문 요약이 여기에 표시됩니다."}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">클릭 후보</p>
                <div className="mt-3 space-y-2">
                  {!activeSession?.interactive_elements.length && (
                    <p className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-steel">
                      페이지를 열면 버튼과 입력칸 후보가 표시됩니다.
                    </p>
                  )}
                  {activeSession?.interactive_elements.map((element, index) => {
                    const selector = typeof element.selector === "string" ? element.selector : "";
                    return (
                      <button
                        key={`${selector}-${index}`}
                        type="button"
                        onClick={() => setSelectorDraft(selector)}
                        className="w-full rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-left transition hover:border-white/16 hover:bg-white/[0.07]"
                      >
                        <p className="text-sm font-semibold text-ink">{String(element.text || element.tag || "element") || "element"}</p>
                        <p className="mt-2 break-all text-xs text-steel">{selector}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="soft-card rounded-[24px] bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">선택해서 읽어온 내용</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">
                  {extractResult || "선택자를 넣고 `내용 추출`을 누르면 결과가 여기에 표시됩니다."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
