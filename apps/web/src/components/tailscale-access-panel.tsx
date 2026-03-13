"use client";

import { useState } from "react";

import { resolvePortalLink } from "@/lib/portal-links";
import type { Portal, TailscaleStatus } from "@/lib/types";

interface TailscaleAccessPanelProps {
  portal: Portal | null;
  tailscaleStatus: TailscaleStatus | null;
  error: string | null;
  isBusy: boolean;
  onEnableServe: () => void;
  onResetServe: () => void;
}

export function TailscaleAccessPanel({
  portal,
  tailscaleStatus,
  error,
  isBusy,
  onEnableServe,
  onResetServe,
}: TailscaleAccessPanelProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const portalLink = resolvePortalLink(portal, tailscaleStatus);

  async function copyValue(value: string | null | undefined, successMessage: string) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(successMessage);
      window.setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("복사에 실패했습니다.");
      window.setTimeout(() => setCopyMessage(null), 2000);
    }
  }

  return (
    <section className="panel overflow-hidden border-white/10 bg-[rgba(7,10,17,0.94)]">
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <p className="eyebrow">Tailscale Access</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">개인 원격 창구</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-steel">
              Tailscale identity를 그대로 사용자 식별자로 사용합니다. 접속한 사람마다 자기 전용 포털과 채팅 세션이 자동으로 분리됩니다.
            </p>
          </div>
          <div className="hero-pill text-sm text-ink">
            {tailscaleStatus?.serve_enabled ? "실시간 접속 준비됨" : "Serve 세팅 필요"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="soft-card rounded-[22px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Portal User</p>
            <p className="mt-3 text-base font-semibold text-ink">{portal?.user_name || portal?.user_login || "로컬 사용자"}</p>
            <p className="mt-2 text-sm leading-6 text-steel">{portal?.source === "tailscale" ? "Tailscale identity" : "로컬 개발 모드"}</p>
          </div>
          <div className="soft-card rounded-[22px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Portal URL</p>
            <p className="mt-3 break-all text-sm font-semibold leading-6 text-ink">{portalLink || "Serve 활성화 후 자동 생성"}</p>
            <p className="mt-2 text-sm leading-6 text-steel">{portal ? `${portal.session_count}개의 개인 대화 세션` : "포털 생성 전"}</p>
          </div>
          <div className="soft-card rounded-[22px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Serve URL</p>
            <p className="mt-3 break-all text-sm font-semibold leading-6 text-ink">{tailscaleStatus?.serve_url || "아직 비활성화"}</p>
            <p className="mt-2 text-sm leading-6 text-steel">
              {tailscaleStatus?.self_dns_name ? `DNS: ${tailscaleStatus.self_dns_name}` : "Tailscale 로그인 상태를 확인하세요."}
            </p>
          </div>
          <div className="soft-card rounded-[22px] bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Device State</p>
            <p className="mt-3 text-base font-semibold text-ink">
              {tailscaleStatus?.logged_in ? tailscaleStatus.current_tailnet || "Tailscale 연결됨" : "Tailscale 로그인 필요"}
            </p>
            <p className="mt-2 text-sm leading-6 text-steel">{tailscaleStatus?.backend_state || "CLI 상태를 확인하지 못했습니다."}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEnableServe}
              disabled={isBusy || !tailscaleStatus?.cli_available}
              className="rounded-full border border-sky-400/26 bg-sky-400/12 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/18 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Tailscale Serve 켜기
            </button>
            <button
              type="button"
              onClick={onResetServe}
              disabled={isBusy || !tailscaleStatus?.cli_available}
              className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Serve 리셋
            </button>
            <button
              type="button"
              onClick={() => void copyValue(portalLink, "포털 URL을 복사했습니다.")}
              disabled={!portalLink}
              className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
            >
              내 창구 URL 복사
            </button>
            <button
              type="button"
              onClick={() => void copyValue(tailscaleStatus?.recommended_command, "Serve 명령을 복사했습니다.")}
              disabled={!tailscaleStatus?.recommended_command}
              className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-medium text-ink transition hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Serve 명령 복사
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Recommended Command</p>
              <p className="mt-3 font-mono text-sm text-ink">{tailscaleStatus?.recommended_command || "tailscale serve --bg 3000"}</p>
              <p className="mt-2 text-sm leading-6 text-steel">웹과 API는 same-origin 프록시로 묶여 있으니 3000 포트만 열면 됩니다.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Bootstrap Script</p>
              <p className="mt-3 break-all font-mono text-sm text-ink">{tailscaleStatus?.recommended_script_path || "스크립트 경로 없음"}</p>
              <p className="mt-2 text-sm leading-6 text-steel">한 번 실행하면 현재 장치의 Serve 구성을 맞춰 줍니다.</p>
            </div>
          </div>
        </div>

        {copyMessage && <p className="text-sm text-sky-100">{copyMessage}</p>}
        {error && <p className="rounded-[20px] border border-rose-400/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">{error}</p>}
      </div>
    </section>
  );
}
