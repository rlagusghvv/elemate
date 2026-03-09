"use client";

import { useState } from "react";

import { API_BASE_URL, previewBrowserPage } from "@/lib/api";
import type { BrowserPreview } from "@/lib/types";

interface BrowserPreviewCardProps {
  enabled: boolean;
  onUseForTask: (url: string) => void;
}

export function BrowserPreviewCard({ enabled, onUseForTask }: BrowserPreviewCardProps) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<BrowserPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handlePreview() {
    if (!url.trim()) {
      setError("먼저 사이트 주소를 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setPreview(await previewBrowserPage({ url: url.trim() }));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "브라우저 미리보기에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article className="panel p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Browser Start</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-ink">사이트 먼저 읽어보기</h2>
          <p className="mt-2 text-sm leading-6 text-steel">주소만 넣으면 로컬 브라우저로 페이지를 읽고, 화면 요약과 주요 버튼 후보를 보여줍니다.</p>
        </div>
        <button
          type="button"
          onClick={() => onUseForTask(url)}
          disabled={!url.trim()}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          이 사이트 조사 맡기기
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="예: example.com/settings"
          className="h-12 flex-1 rounded-[22px] border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-slate-700"
        />
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={isLoading || !enabled}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? "읽는 중" : enabled ? "페이지 읽기" : "브라우저 사용 불가"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {preview && (
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <img
              src={`${API_BASE_URL}${preview.screenshot_path}`}
              alt={preview.title || preview.url}
              className="w-full rounded-[18px] border border-slate-200 object-cover"
            />
          </div>
          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">페이지 요약</p>
              <p className="mt-2 text-lg font-semibold text-ink">{preview.title || preview.url}</p>
              <p className="mt-2 break-all text-xs text-steel">{preview.url}</p>
              <p className="mt-4 text-sm leading-6 text-steel">{preview.text_excerpt || "추출된 본문이 없습니다."}</p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">눈에 띈 인터랙션</p>
              <div className="mt-3 space-y-2">
                {preview.interactive_elements.slice(0, 6).map((item, index) => (
                  <div key={`${preview.preview_id}-${index}`} className="rounded-[16px] bg-slate-50 px-3 py-3 text-sm text-steel">
                    <p className="font-medium text-ink">{String(item.text || item.selector || item.tag || "요소")}</p>
                    <p className="mt-1 text-xs">{String(item.selector || "")}</p>
                  </div>
                ))}
                {preview.interactive_elements.length === 0 && (
                  <p className="text-sm text-steel">버튼/입력 요소를 찾지 못했습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
