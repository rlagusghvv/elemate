"use client";

import { useEffect, useState } from "react";

import { browseWorkspaces } from "@/lib/api";
import type { WorkspaceBrowse } from "@/lib/types";

interface WorkspaceBrowserProps {
  open: boolean;
  selectedPath: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

export function WorkspaceBrowser({ open, selectedPath, onPick, onClose }: WorkspaceBrowserProps) {
  const [payload, setPayload] = useState<WorkspaceBrowse | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(selectedPath);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextPath = selectedPath || undefined;
    setCurrentPath(selectedPath);
    setIsLoading(true);
    setError(null);
    void browseWorkspaces(nextPath)
      .then((response) => {
        setPayload(response);
        setCurrentPath(response.current_path);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "폴더 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, selectedPath]);

  async function moveTo(path?: string | null) {
    setIsLoading(true);
    setError(null);
    try {
      const response = await browseWorkspaces(path ?? undefined);
      setPayload(response);
      setCurrentPath(response.current_path);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "폴더 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/62 px-4 py-6 backdrop-blur-md">
      <div className="panel max-h-[88vh] w-full max-w-4xl overflow-hidden border-white/10 bg-[rgba(7,10,17,0.96)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <p className="eyebrow">Workspace Picker</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-ink">작업 폴더 선택</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09]"
          >
            닫기
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.34fr_0.66fr]">
          <aside className="border-b border-white/8 bg-white/[0.03] p-5 lg:border-b-0 lg:border-r lg:border-white/8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">자주 쓰는 시작점</p>
            <div className="mt-4 space-y-2">
              {payload?.roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  onClick={() => void moveTo(root)}
                  className="block w-full rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm text-ink transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  {root}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-[20px] border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">현재 선택</p>
              <p className="mt-3 break-all text-sm leading-6 text-ink">{currentPath || "폴더를 선택해 주세요."}</p>
              <button
                type="button"
                onClick={() => {
                  onPick(currentPath);
                  onClose();
                }}
                disabled={!currentPath}
                className="mt-4 rounded-full border border-sky-400/26 bg-sky-400/12 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/18 disabled:cursor-not-allowed disabled:opacity-45"
              >
                이 폴더 사용
              </button>
            </div>
          </aside>

          <section className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void moveTo(payload?.parent_path)}
                disabled={!payload?.parent_path || isLoading}
                className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
              >
                상위 폴더
              </button>
              <button
                type="button"
                onClick={() => void moveTo(currentPath)}
                disabled={isLoading}
                className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
              >
                새로고침
              </button>
            </div>

            <p className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-steel">{payload?.current_path ?? currentPath}</p>

            {error && <p className="mt-4 rounded-[18px] border border-rose-400/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">{error}</p>}

            <div className="mt-4 grid max-h-[54vh] gap-3 overflow-auto pr-1">
              {isLoading && <div className="rounded-[18px] border border-white/8 bg-white/[0.04] p-4 text-sm text-steel">불러오는 중...</div>}

              {!isLoading && payload?.entries.length === 0 && (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-steel">표시할 하위 폴더가 없습니다.</div>
              )}

              {!isLoading &&
                payload?.entries.map((entry) => (
                  <div key={entry.path} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.04] p-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{entry.name}</p>
                      <p className="mt-1 break-all text-xs text-steel">{entry.path}</p>
                      {entry.is_project && <p className="mt-2 text-xs font-semibold text-emerald-100">프로젝트 폴더로 보입니다</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void moveTo(entry.path)}
                        className="rounded-full border border-white/12 px-3 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        열기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(entry.path);
                          onClose();
                        }}
                        className="rounded-full border border-sky-400/26 bg-sky-400/12 px-3 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/18"
                      >
                        선택
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
