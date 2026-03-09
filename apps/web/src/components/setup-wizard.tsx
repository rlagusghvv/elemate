"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { ElephantMascot } from "@/components/elephant-mascot";
import type { DesktopBridgeStatus, OnboardingStatus, Portal, TailscaleStatus } from "@/lib/types";

interface SetupWizardProps {
  onboarding: OnboardingStatus | null;
  workspacePath: string;
  portal: Portal | null;
  tailscaleStatus: TailscaleStatus | null;
  desktopStatus: DesktopBridgeStatus | null;
  isBusy: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenChatLogin: () => void;
  onOpenWorkspacePicker: () => void;
  onOpenRemoteAccessApp: () => void;
  onEnableRemoteAccess: () => void;
  onInstallBackgroundAgent: () => void;
  onInstallLocalRuntime: () => void;
  onRestartLocalServices: () => void;
}

function statusLabel(done: boolean, pendingLabel = "다음 단계"): string {
  return done ? "완료" : pendingLabel;
}

function statusTone(done: boolean): string {
  return done ? "border-emerald-400/22 bg-emerald-400/12 text-emerald-100" : "border-white/10 bg-white/[0.04] text-steel";
}

export function SetupWizard({
  onboarding,
  workspacePath,
  portal,
  tailscaleStatus,
  desktopStatus,
  isBusy,
  error,
  onRefresh,
  onOpenChatLogin,
  onOpenWorkspacePicker,
  onOpenRemoteAccessApp,
  onEnableRemoteAccess,
  onInstallBackgroundAgent,
  onInstallLocalRuntime,
  onRestartLocalServices,
}: SetupWizardProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const selectedWorkspace = workspacePath || onboarding?.workspace_path || "";
  const linkValue = portal?.portal_url || tailscaleStatus?.serve_url || null;
  const readyCount = [onboarding?.auth_ready, Boolean(selectedWorkspace), Boolean(tailscaleStatus?.serve_enabled)].filter(Boolean).length;
  const optionalAlwaysOn = Boolean(desktopStatus?.daemon.loaded);
  const remoteReady = Boolean(tailscaleStatus?.serve_enabled);
  const bundledRuntime = desktopStatus?.runtime?.mode === "bundled" ? desktopStatus.runtime : null;
  const runtimeReady = !bundledRuntime || bundledRuntime.api.status === "ready";
  const runtimeBusy = bundledRuntime ? bundledRuntime.api.status === "installing" || bundledRuntime.api.status === "starting" : false;

  useEffect(() => {
    let isMounted = true;
    if (!linkValue || !remoteReady) {
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
  }, [linkValue, remoteReady]);

  const heroText = useMemo(() => {
    if (!runtimeReady) {
      return "먼저 이 장비 안에 EleMate 로컬 엔진을 준비합니다.";
    }
    if (!onboarding?.auth_ready) {
      return "먼저 AI 연결만 끝내면 됩니다.";
    }
    if (!selectedWorkspace) {
      return "이제 내 파일이 들어 있는 폴더만 고르면 됩니다.";
    }
    if (!remoteReady) {
      return "마지막으로 휴대폰 접속만 켜면 설정이 끝납니다.";
    }
    return "준비가 끝났습니다. 이제 휴대폰에서 바로 말을 걸면 됩니다.";
  }, [onboarding?.auth_ready, remoteReady, runtimeReady, selectedWorkspace]);

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
    <section className="panel overflow-hidden px-6 py-6 sm:px-8 sm:py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
        <div>
          <p className="eyebrow">First Run</p>
          <h1 className="ui-title-main mt-4 max-w-4xl">
            처음 설정은
            <br />
            세 단계면 충분합니다.
          </h1>
          <p className="ui-copy mt-4 max-w-2xl">{heroText}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="ui-chip">{readyCount}/3 완료</span>
            <span className={`ui-chip ${statusTone(optionalAlwaysOn)}`}>
              항상 켜짐 {statusLabel(optionalAlwaysOn, "선택")}
            </span>
            <button type="button" onClick={onRefresh} className="ui-button-tertiary min-h-9 px-3.5 py-2 text-xs">
              다시 확인
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[240px]">
          <ElephantMascot className="w-full" caption="내 장비를 내 개인 에이전트로 설정합니다." />
        </div>
      </div>

      {!runtimeReady ? (
        <article className="ui-card mt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Local Engine</p>
              <p className="ui-title-card mt-3">
                {runtimeBusy ? "로컬 엔진을 준비하고 있습니다." : "앱 안에 로컬 엔진을 먼저 준비합니다."}
              </p>
              <p className="ui-copy-sm mt-3">
                {bundledRuntime?.api.message ||
                  "처음 한 번만 준비하면 이후에는 앱을 열 때 자동으로 엔진이 함께 시작됩니다."}
              </p>
              {bundledRuntime?.data_dir ? <p className="ui-copy-sm mt-2 break-all text-white/52">데이터 위치: {bundledRuntime.data_dir}</p> : null}
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(runtimeReady)}`}>
              {runtimeBusy ? "준비 중" : bundledRuntime?.api.status === "needs-python" ? "Python 필요" : "준비 필요"}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onInstallLocalRuntime}
              disabled={isBusy || runtimeBusy}
              className="ui-button-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {bundledRuntime?.api.status === "needs-python" ? "앱 준비 다시 시도" : "앱 준비 시작"}
            </button>
            <button
              type="button"
              onClick={onRestartLocalServices}
              disabled={isBusy || runtimeBusy}
              className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              로컬 서비스 다시 시작
            </button>
          </div>
        </article>
      ) : null}

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">01 AI 연결</p>
              <p className="ui-title-card mt-3">{onboarding?.auth_ready ? "내 계정 연결 완료" : "AI 연결하기"}</p>
              <p className="ui-copy-sm mt-3">
                {onboarding?.auth_ready
                  ? onboarding.auth_account_email || "이 장비가 내 계정으로 답변합니다."
                  : "버튼만 누르면 연결이 시작됩니다. 필요한 도구가 없으면 설치 페이지를 바로 엽니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(onboarding?.auth_ready))}`}>
              {statusLabel(Boolean(onboarding?.auth_ready))}
            </span>
          </div>
          {!onboarding?.auth_ready ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={onOpenChatLogin} className="ui-button-primary px-4 py-2.5">
                ChatGPT 연결 열기
              </button>
              <button type="button" onClick={onRefresh} className="ui-button-secondary px-4 py-2.5">
                로그인 후 다시 확인
              </button>
            </div>
          ) : null}
        </article>

        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">02 내 폴더</p>
              <p className="ui-title-card mt-3">{selectedWorkspace ? "폴더 연결 완료" : "폴더 선택하기"}</p>
              <p className="ui-copy-sm mt-3 break-all">
                {selectedWorkspace ? selectedWorkspace : "문서가 들어 있는 폴더 하나만 고르면 충분합니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(selectedWorkspace))}`}>
              {statusLabel(Boolean(selectedWorkspace))}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onOpenWorkspacePicker} className="ui-button-secondary px-4 py-2.5">
              {selectedWorkspace ? "폴더 바꾸기" : "폴더 선택"}
            </button>
          </div>
        </article>

        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">03 휴대폰 연결</p>
              <p className="ui-title-card mt-3">
                {!tailscaleStatus?.logged_in
                  ? "원격 연결 로그인"
                  : remoteReady
                    ? "휴대폰 링크 준비 완료"
                    : "휴대폰 접속 켜기"}
              </p>
              <p className="ui-copy-sm mt-3 break-all">
                {!tailscaleStatus?.logged_in
                  ? "원격 연결 앱을 열고 로그인하면 됩니다. 앱이 없으면 설치 페이지를 바로 엽니다."
                  : remoteReady
                    ? linkValue || "개인 링크가 준비되었습니다."
                    : "한 번만 켜 두면 앞으로는 휴대폰에서 바로 접속할 수 있습니다."}
              </p>
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(remoteReady)}`}>
              {statusLabel(remoteReady, !tailscaleStatus?.logged_in ? "로그인 필요" : "설정 필요")}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {!tailscaleStatus?.logged_in ? (
              <button type="button" onClick={onOpenRemoteAccessApp} className="ui-button-secondary px-4 py-2.5">
                원격 연결 앱 열기
              </button>
            ) : null}
            {!tailscaleStatus?.logged_in ? (
              <button type="button" onClick={onRefresh} className="ui-button-secondary px-4 py-2.5">
                로그인 후 다시 확인
              </button>
            ) : null}
            {tailscaleStatus?.logged_in && !remoteReady ? (
              <button
                type="button"
                onClick={onEnableRemoteAccess}
                disabled={isBusy}
                className="ui-button-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                휴대폰 접속 켜기
              </button>
            ) : null}
            {remoteReady ? (
              <button type="button" onClick={() => void copyValue(linkValue, "내 접속 링크를 복사했습니다.")} className="ui-button-primary px-4 py-2.5">
                접속 링크 복사
              </button>
            ) : null}
          </div>
          {remoteReady && qrDataUrl ? (
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <img src={qrDataUrl} alt="EleMate phone access QR code" className="h-[180px] w-[180px]" />
                <p className="ui-copy-sm max-w-[28ch] text-white/72">
                  휴대폰 카메라로 스캔하면 바로 내 에이전트 대화창이 열립니다.
                </p>
              </div>
            </div>
          ) : null}
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="soft-card rounded-[24px] bg-white/[0.03] px-5 py-5">
          <p className="eyebrow">Optional</p>
          <p className="ui-title-card mt-3">앱을 닫아도 계속 대기시키기</p>
          <p className="ui-copy-sm mt-3">
            {optionalAlwaysOn
              ? "이미 항상 켜짐이 설정되어 있습니다."
              : "집에 있는 장비를 계속 켜 두고 쓰고 싶다면 한 번만 설정하면 됩니다."}
          </p>
          {!optionalAlwaysOn && desktopStatus?.daemon.available ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={onInstallBackgroundAgent}
                disabled={isBusy}
                className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                항상 켜짐 설정
              </button>
            </div>
          ) : null}
        </article>

        <article className="soft-card rounded-[24px] bg-white/[0.03] px-5 py-5">
          <p className="eyebrow">After Setup</p>
          <p className="ui-title-card mt-3">그 다음에는</p>
          <p className="ui-copy-sm mt-3">
            설정이 끝나면 주로 휴대폰 링크에서 대화하면 됩니다. 이 컴퓨터 화면은 점검이나 폴더 변경이 필요할 때만 열면 됩니다.
          </p>
        </article>
      </div>

      {copyMessage ? <p className="mt-4 text-sm text-sky-100">{copyMessage}</p> : null}
      {error ? <p className="mt-4 rounded-[20px] border border-rose-400/22 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
    </section>
  );
}
