"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { ElephantMascot } from "@/components/elephant-mascot";
import { resolvePortalLink } from "@/lib/portal-links";
import type { DesktopBridgeStatus, OnboardingStatus, Portal, TailscaleStatus } from "@/lib/types";

interface DeviceStatusPanelProps {
  onboarding: OnboardingStatus | null;
  workspacePath: string;
  portal: Portal | null;
  tailscaleStatus: TailscaleStatus | null;
  desktopStatus: DesktopBridgeStatus | null;
  isBusy: boolean;
  error: string | null;
  onOpenWorkspacePicker: () => void;
  onOpenRemoteAccessApp: () => void;
  onStartRemoteAccessFlow: () => void;
  onEnableRemoteAccess: () => void;
  onResetRemoteAccess: () => void;
  onInstallBackgroundAgent: () => void;
  onUninstallBackgroundAgent: () => void;
  onPromptAccessibility: () => void;
  onOpenSystemPreferences: (pane: "accessibility" | "screen") => void;
}

function tone(ready: boolean): string {
  return ready ? "border-emerald-400/22 bg-emerald-400/12 text-emerald-100" : "border-white/10 bg-white/[0.04] text-steel";
}

export function DeviceStatusPanel({
  onboarding,
  workspacePath,
  portal,
  tailscaleStatus,
  desktopStatus,
  isBusy,
  error,
  onOpenWorkspacePicker,
  onOpenRemoteAccessApp,
  onStartRemoteAccessFlow,
  onEnableRemoteAccess,
  onResetRemoteAccess,
  onInstallBackgroundAgent,
  onUninstallBackgroundAgent,
  onPromptAccessibility,
  onOpenSystemPreferences,
}: DeviceStatusPanelProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const selectedWorkspace = workspacePath || onboarding?.workspace_path || "";
  const linkValue = resolvePortalLink(portal, tailscaleStatus);
  const remoteLinkReady = Boolean(linkValue);
  const daemonReady = Boolean(desktopStatus?.daemon.loaded);

  useEffect(() => {
    let isMounted = true;
    if (!linkValue) {
      setQrDataUrl(null);
      return () => {
        isMounted = false;
      };
    }
    void QRCode.toDataURL(linkValue, {
      margin: 0,
      width: 220,
      color: {
        dark: "#F5F7FB",
        light: "#00000000",
      },
    })
      .then((value) => {
        if (isMounted) {
          setQrDataUrl(value);
        }
      })
      .catch(() => {
        if (isMounted) {
          setQrDataUrl(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [linkValue]);

  async function copyValue(value: string | null | undefined) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage("접속 링크를 복사했습니다.");
      window.setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("복사에 실패했습니다.");
      window.setTimeout(() => setCopyMessage(null), 2000);
    }
  }

  async function openLink(value: string | null | undefined) {
    if (!value) {
      return;
    }
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (desktopBridge?.openExternalUrl) {
      await desktopBridge.openExternalUrl(value);
      return;
    }
    window.open(value, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="panel overflow-hidden px-5 py-5 sm:px-6">
      <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">This Device</p>
            <h2 className="ui-title-section mt-3">내 장비는 준비됐습니다.</h2>
            <p className="ui-copy-sm mt-3">이제 주로 오른쪽 채팅이나 휴대폰 링크에서 말을 걸면 됩니다. 이 화면은 상태 점검과 기본 설정 변경에만 씁니다.</p>
          </div>
          <div className="hidden w-[104px] sm:block">
            <ElephantMascot className="w-full" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`ui-chip ${tone(Boolean(onboarding?.auth_ready))}`}>AI 연결됨</span>
          <span className={`ui-chip ${tone(Boolean(selectedWorkspace))}`}>폴더 연결됨</span>
          <span className={`ui-chip ${tone(remoteLinkReady)}`}>휴대폰 접속 가능</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <p className="eyebrow">내 계정</p>
          <p className="ui-copy-sm mt-3">{onboarding?.auth_account_email || "연결된 계정을 확인하지 못했습니다."}</p>
        </article>

        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <p className="eyebrow">작업 폴더</p>
          <p className="ui-copy-sm mt-3 break-all">{selectedWorkspace || "아직 폴더가 연결되지 않았습니다."}</p>
          <div className="mt-4">
            <button type="button" onClick={onOpenWorkspacePicker} className="ui-button-secondary px-4 py-2.5">
              폴더 바꾸기
            </button>
          </div>
        </article>

        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <p className="eyebrow">휴대폰 링크</p>
          <p className="ui-copy-sm mt-3 break-all">{linkValue || "휴대폰 접속 링크를 아직 불러오지 못했습니다."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyValue(linkValue)} className="ui-button-primary px-4 py-2.5" disabled={!linkValue}>
              접속 링크 복사
            </button>
            <button type="button" onClick={onOpenRemoteAccessApp} className="ui-button-secondary px-4 py-2.5">
              원격 연결 앱 열기
            </button>
            {tailscaleStatus?.status_readable && !tailscaleStatus?.logged_in ? (
              <button type="button" onClick={onStartRemoteAccessFlow} className="ui-button-secondary px-4 py-2.5">
                원격 연결 로그인 시작
              </button>
            ) : null}
            {tailscaleStatus?.status_readable && tailscaleStatus?.logged_in && !tailscaleStatus?.service_running ? (
              <button type="button" onClick={onStartRemoteAccessFlow} className="ui-button-secondary px-4 py-2.5">
                원격 연결 다시 켜기
              </button>
            ) : null}
            <button
              type="button"
              onClick={onEnableRemoteAccess}
              disabled={isBusy}
              className="ui-button-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              휴대폰 접속 켜기
            </button>
            <button
              type="button"
              onClick={onResetRemoteAccess}
              disabled={isBusy}
              className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              링크 다시 설정
            </button>
            <button
              type="button"
              onClick={() => void openLink(linkValue)}
              disabled={!linkValue}
              className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              링크 테스트 열기
            </button>
          </div>
          {linkValue && qrDataUrl ? (
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <img src={qrDataUrl} alt="EleMate phone access QR code" className="h-[180px] w-[180px]" />
                <p className="ui-copy-sm max-w-[30ch] text-white/72">
                  휴대폰 카메라로 스캔하면 바로 내 에이전트 대화창으로 들어갑니다.
                </p>
              </div>
            </div>
          ) : null}
        </article>

        <article className="soft-card rounded-[24px] bg-white/[0.03] px-4 py-4">
          <p className="eyebrow">항상 켜짐</p>
          <p className="ui-copy-sm mt-3">
            {desktopStatus?.daemon.summary || "앱을 닫아도 계속 대기하게 만들 수 있습니다."}
          </p>
          {desktopStatus?.daemon.available ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {!daemonReady ? (
                <button
                  type="button"
                  onClick={onInstallBackgroundAgent}
                  disabled={isBusy}
                  className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  항상 켜짐 설정
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
          <p className="eyebrow">권한</p>
          <p className="ui-copy-sm mt-3">화면 보기나 제어가 막힐 때만 씁니다.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onPromptAccessibility} className="ui-button-secondary px-4 py-2.5">
              제어 권한 요청
            </button>
            <button type="button" onClick={() => onOpenSystemPreferences("screen")} className="ui-button-secondary px-4 py-2.5">
              화면 권한 열기
            </button>
          </div>
        </article>
      </div>

      {copyMessage ? <p className="mt-4 text-sm text-sky-100">{copyMessage}</p> : null}
      {error ? <p className="mt-4 rounded-[20px] border border-rose-400/22 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
    </section>
  );
}
