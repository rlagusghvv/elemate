"use client";

import { useMemo, useState } from "react";

import { ElephantMascot } from "@/components/elephant-mascot";
import type { DesktopBridgeStatus, OnboardingStatus, Portal, TailscaleStatus } from "@/lib/types";

interface OnboardingConsoleProps {
  onboarding: OnboardingStatus | null;
  workspacePath: string;
  portal: Portal | null;
  tailscaleStatus: TailscaleStatus | null;
  error: string | null;
  isBusy: boolean;
  desktopStatus: DesktopBridgeStatus | null;
  onOpenWorkspacePicker: () => void;
  onRefresh: () => void;
  onPromptAccessibility: () => void;
  onOpenSystemPreferences: (pane: "accessibility" | "screen") => void;
  onEnableRemoteAccess: () => void;
  onResetRemoteAccess: () => void;
  onOpenChatLogin: () => void;
  onOpenRemoteAccessApp: () => void;
  onInstallBackgroundAgent: () => void;
  onUninstallBackgroundAgent: () => void;
}

function statusChip(ready: boolean, idleLabel = "선택"): string {
  return ready ? "준비됨" : idleLabel;
}

function statusTone(ready: boolean): string {
  return ready ? "border-emerald-400/22 bg-emerald-400/12 text-emerald-100" : "border-white/10 bg-white/[0.04] text-steel";
}

export function OnboardingConsole({
  onboarding,
  workspacePath,
  portal,
  tailscaleStatus,
  error,
  isBusy,
  desktopStatus,
  onOpenWorkspacePicker,
  onRefresh,
  onPromptAccessibility,
  onOpenSystemPreferences,
  onEnableRemoteAccess,
  onResetRemoteAccess,
  onOpenChatLogin,
  onOpenRemoteAccessApp,
  onInstallBackgroundAgent,
  onUninstallBackgroundAgent,
}: OnboardingConsoleProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const selectedWorkspace = workspacePath || onboarding?.workspace_path || "";
  const linkValue = portal?.portal_url || tailscaleStatus?.serve_url || null;
  const readyCount = [onboarding?.auth_ready, Boolean(selectedWorkspace), Boolean(tailscaleStatus?.serve_enabled)].filter(Boolean).length;
  const daemonReady = Boolean(desktopStatus?.daemon.loaded);

  const summary = useMemo(() => {
    if (!onboarding?.auth_ready) {
      return "먼저 AI 연결만 끝내면 이 장비가 실제로 대화를 시작합니다.";
    }
    if (!selectedWorkspace) {
      return "다음으로 폴더 하나를 고르면 파일 작업 요청을 바로 받을 수 있습니다.";
    }
    if (!tailscaleStatus?.serve_enabled) {
      return "마지막으로 휴대폰 접속만 켜면 밖에서도 바로 말을 걸 수 있습니다.";
    }
    return "준비가 끝났습니다. 이제 오른쪽에서 하고 싶은 일을 그냥 말하면 됩니다.";
  }, [onboarding?.auth_ready, selectedWorkspace, tailscaleStatus?.serve_enabled]);

  async function copyValue(value: string | null | undefined, message: string) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(message);
      window.setTimeout(() => setCopyMessage(null), 2200);
    } catch {
      setCopyMessage("복사에 실패했습니다.");
      window.setTimeout(() => setCopyMessage(null), 2200);
    }
  }

  return (
    <section className="panel overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
      <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">This Device</p>
            <h2 className="ui-title-section mt-3">내 장비 준비</h2>
            <p className="ui-copy-sm mt-3 max-w-sm">{summary}</p>
          </div>
          <div className="hidden sm:block sm:w-[110px]">
            <ElephantMascot className="w-full" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="ui-chip px-3 py-1.5">{readyCount}/3 연결 완료</span>
          <span className={`ui-chip px-3 py-1.5 ${statusTone(daemonReady)}`}>
            항상 켜짐 {statusChip(daemonReady, "선택")}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="ui-button-tertiary min-h-9 px-3 py-1.5 text-xs"
          >
            상태 새로고침
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <article className="soft-card rounded-[26px] bg-white/[0.03] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">01 AI 연결</p>
              <p className="mt-2 text-base font-semibold text-ink">
                {onboarding?.auth_ready ? onboarding.auth_account_email || "연결됨" : "ChatGPT 계정 연결이 필요합니다."}
              </p>
              <p className="ui-copy-sm mt-2">
                {onboarding?.auth_ready
                  ? onboarding.auth_plan_type || "이 장비가 내 계정으로 답변합니다."
                  : "처음 한 번만 연결하면 됩니다. 준비가 부족하면 필요한 설치 페이지를 바로 엽니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(onboarding?.auth_ready))}`}>
              {statusChip(Boolean(onboarding?.auth_ready))}
            </span>
          </div>
          {!onboarding?.auth_ready ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={desktopStatus?.is_desktop_app ? onOpenChatLogin : () => void copyValue(onboarding?.login_command, "연결 명령을 복사했습니다.")}
                className="ui-button-primary px-4 py-2.5"
              >
                {desktopStatus?.is_desktop_app ? "AI 연결 시작" : "연결 명령 복사"}
              </button>
            </div>
          ) : null}
        </article>

        <article className="soft-card rounded-[26px] bg-white/[0.03] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">02 작업 폴더</p>
              <p className="mt-2 break-all text-base font-semibold text-ink">{selectedWorkspace || "아직 폴더를 고르지 않았습니다."}</p>
              <p className="ui-copy-sm mt-2">
                {selectedWorkspace ? "문서와 파일 작업은 이 폴더를 기준으로 진행합니다." : "보통 문서 폴더나 프로젝트 폴더 하나를 연결하면 충분합니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(selectedWorkspace))}`}>
              {statusChip(Boolean(selectedWorkspace))}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenWorkspacePicker}
              className="ui-button-secondary px-4 py-2.5"
            >
              {selectedWorkspace ? "폴더 바꾸기" : "폴더 선택"}
            </button>
          </div>
        </article>

        <article className="soft-card rounded-[26px] bg-white/[0.03] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">03 휴대폰 접속</p>
              <p className="mt-2 text-base font-semibold text-ink">
                {!tailscaleStatus?.logged_in
                  ? "원격 연결 로그인이 필요합니다."
                  : tailscaleStatus.serve_enabled
                    ? "개인 접속 링크가 준비됐습니다."
                    : "휴대폰용 링크를 아직 열지 않았습니다."}
              </p>
              <p className="ui-copy-sm mt-2 break-all">
                {!tailscaleStatus?.logged_in
                  ? "원격 연결 앱에서 로그인만 끝내면 됩니다. 앱이 없으면 설치 페이지를 바로 엽니다."
                  : tailscaleStatus.serve_enabled
                    ? linkValue || "링크가 준비되었습니다."
                    : "버튼 한 번으로 내 휴대폰 접속을 켤 수 있습니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(tailscaleStatus?.serve_enabled))}`}>
              {statusChip(Boolean(tailscaleStatus?.serve_enabled), !tailscaleStatus?.logged_in ? "로그인 필요" : "설정 필요")}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!tailscaleStatus?.logged_in && desktopStatus?.is_desktop_app ? (
              <button
                type="button"
                onClick={onOpenRemoteAccessApp}
                className="ui-button-secondary px-4 py-2.5"
              >
                원격 연결 앱 열기
              </button>
            ) : null}
            {tailscaleStatus?.logged_in && !tailscaleStatus.serve_enabled ? (
              <button
                type="button"
                onClick={onEnableRemoteAccess}
                disabled={isBusy}
                className="ui-button-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                휴대폰 접속 켜기
              </button>
            ) : null}
            {tailscaleStatus?.serve_enabled ? (
              <>
                <button
                  type="button"
                  onClick={() => void copyValue(linkValue, "내 접속 링크를 복사했습니다.")}
                  className="ui-button-primary px-4 py-2.5"
                >
                  접속 링크 복사
                </button>
                <button
                  type="button"
                  onClick={onResetRemoteAccess}
                  disabled={isBusy}
                  className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  다시 설정
                </button>
              </>
            ) : null}
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">항상 켜짐</p>
              <p className="ui-copy-sm mt-2">
                {desktopStatus?.daemon.summary || "앱을 닫아도 이 장비가 계속 대기하게 만들 수 있습니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(daemonReady)}`}>
              {statusChip(daemonReady, "선택")}
            </span>
          </div>
          {desktopStatus?.daemon.available ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {!daemonReady ? (
                <button
                  type="button"
                  onClick={onInstallBackgroundAgent}
                  disabled={isBusy}
                  className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  항상 켜두기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onUninstallBackgroundAgent}
                  disabled={isBusy}
                  className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  항상 켜짐 해제
                </button>
              )}
            </div>
          ) : null}
        </article>

        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">권한</p>
          <p className="ui-copy-sm mt-2">화면 보기나 제어가 막힐 때만 이 항목을 사용하면 됩니다.</p>
          {desktopStatus?.is_desktop_app ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPromptAccessibility}
                className="ui-button-secondary px-4 py-2.5"
              >
                제어 권한 요청
              </button>
              <button
                type="button"
                onClick={() => onOpenSystemPreferences("screen")}
                className="ui-button-secondary px-4 py-2.5"
              >
                화면 권한 열기
              </button>
            </div>
          ) : null}
        </article>
      </div>

      {copyMessage ? <p className="mt-4 text-sm text-sky-100">{copyMessage}</p> : null}
      {error ? <p className="mt-4 rounded-[20px] border border-rose-400/22 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
    </section>
  );
}
