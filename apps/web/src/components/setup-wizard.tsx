"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { ElephantMascot } from "@/components/elephant-mascot";
import { buildPortalLink, resolvePortalLink } from "@/lib/portal-links";
import type {
  DesktopBridgeStatus,
  DesktopPermissionPane,
  DesktopWorkspaceAccessCheckResult,
  OnboardingStatus,
  Portal,
  TailscaleStatus,
} from "@/lib/types";

interface SetupWizardProps {
  onboarding: OnboardingStatus | null;
  workspacePath: string;
  portal: Portal | null;
  tailscaleStatus: TailscaleStatus | null;
  desktopStatus: DesktopBridgeStatus | null;
  isBusy: boolean;
  error: string | null;
  statusMessage: string | null;
  onRefresh: () => void;
  onOpenChatLogin: () => void;
  onOpenWorkspacePicker: () => void;
  onOpenRemoteAccessApp: () => void;
  onStartRemoteAccessFlow: () => void;
  onEnableRemoteAccess: () => void;
  onPromptAccessibility: () => void;
  onPromptScreenAccess: () => void;
  onCheckWorkspaceAccess: () => void;
  onOpenSystemPreferences: (pane: DesktopPermissionPane) => void;
  onRelaunchApp: () => void;
  onInstallBackgroundAgent: () => void;
  onInstallLocalRuntime: () => void;
  onRestartLocalServices: () => void;
  onSaveRemoteOrigin: (value: string) => void;
  workspaceAccessCheck: DesktopWorkspaceAccessCheckResult | null;
}

function statusLabel(done: boolean, pendingLabel = "다음 단계"): string {
  return done ? "완료" : pendingLabel;
}

function statusTone(done: boolean): string {
  return done ? "border-emerald-400/22 bg-emerald-400/12 text-emerald-100" : "border-white/10 bg-white/[0.04] text-steel";
}

function normalizeDeviceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTailnetDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
}

function splitRemoteOrigin(value: string | null | undefined): { deviceName: string; tailnetDomain: string } {
  if (!value) {
    return { deviceName: "", tailnetDomain: "" };
  }
  try {
    const hostname = new URL(value).hostname;
    const [deviceName, ...rest] = hostname.split(".");
    return {
      deviceName: deviceName || "",
      tailnetDomain: rest.join("."),
    };
  } catch {
    const normalized = normalizeTailnetDomain(value);
    const [deviceName, ...rest] = normalized.split(".");
    return {
      deviceName: deviceName || "",
      tailnetDomain: rest.join("."),
    };
  }
}

function extractRemoteHostname(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return new URL(value).hostname;
  } catch {
    return normalizeTailnetDomain(value);
  }
}

function buildRemoteOrigin(deviceName: string, tailnetDomain: string): string | null {
  const normalizedDevice = normalizeDeviceName(deviceName);
  const normalizedTailnet = normalizeTailnetDomain(tailnetDomain);
  if (!normalizedDevice || !normalizedTailnet) {
    return null;
  }
  return `https://${normalizedDevice}.${normalizedTailnet}`;
}

function buildRemoteOriginFromHost(hostname: string): string | null {
  const normalizedHost = normalizeTailnetDomain(hostname);
  if (!normalizedHost) {
    return null;
  }
  return `https://${normalizedHost}`;
}

export function SetupWizard({
  onboarding,
  workspacePath,
  portal,
  tailscaleStatus,
  desktopStatus,
  isBusy,
  error,
  statusMessage,
  onRefresh,
  onOpenChatLogin,
  onOpenWorkspacePicker,
  onOpenRemoteAccessApp,
  onStartRemoteAccessFlow,
  onEnableRemoteAccess,
  onPromptAccessibility,
  onPromptScreenAccess,
  onCheckWorkspaceAccess,
  onOpenSystemPreferences,
  onRelaunchApp,
  onInstallBackgroundAgent,
  onInstallLocalRuntime,
  onRestartLocalServices,
  onSaveRemoteOrigin,
  workspaceAccessCheck,
}: SetupWizardProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [mobileSetupQrDataUrl, setMobileSetupQrDataUrl] = useState<string | null>(null);
  const savedRemoteParts = splitRemoteOrigin(onboarding?.remote_origin || "");
  const savedRemoteHost = extractRemoteHostname(onboarding?.remote_origin || "");
  const suggestedDeviceName =
    tailscaleStatus?.suggested_device_name_source === "tailscale" ? tailscaleStatus?.suggested_device_name || "" : "";
  const hostnameHint =
    tailscaleStatus?.suggested_device_name_source === "hostname" ? tailscaleStatus?.suggested_device_name || "" : "";
  const [manualDeviceName, setManualDeviceName] = useState(savedRemoteParts.deviceName || suggestedDeviceName);
  const [manualRemoteHost, setManualRemoteHost] = useState(savedRemoteHost);

  const selectedWorkspace = workspacePath || onboarding?.workspace_path || "";
  const workspaceAccessReady = Boolean(onboarding?.workspace_access_ready);
  const workspacePermissionPane = workspaceAccessCheck?.suggested_pane || "files";
  const accessibilityGranted = desktopStatus?.permissions.accessibility === "granted";
  const screenGranted = desktopStatus?.permissions.screen === "granted";
  const linkValue = resolvePortalLink(portal, tailscaleStatus);
  const remoteLinkReady = Boolean(linkValue);
  const manualRemoteConfigured = Boolean(onboarding?.remote_origin);
  const computerUseReady = accessibilityGranted && screenGranted;
  const readyCount = [computerUseReady, onboarding?.auth_ready, workspaceAccessReady, remoteLinkReady].filter(Boolean).length;
  const optionalAlwaysOn = Boolean(desktopStatus?.daemon.loaded);
  const remoteReady = Boolean(tailscaleStatus?.serve_enabled);
  const remoteLoggedIn = Boolean(tailscaleStatus?.logged_in);
  const remoteRunning = Boolean(tailscaleStatus?.service_running);
  const remoteAppInstalled = Boolean(tailscaleStatus?.cli_available);
  const remoteStatusReadable = Boolean(tailscaleStatus?.status_readable);
  const manualRemoteSavedOnly = manualRemoteConfigured && !remoteStatusReadable;
  const bundledRuntime = desktopStatus?.runtime?.mode === "bundled" ? desktopStatus.runtime : null;
  const runtimeReady = !bundledRuntime || bundledRuntime.api.status === "ready";
  const runtimeBusy = bundledRuntime ? bundledRuntime.api.status === "installing" || bundledRuntime.api.status === "starting" : false;
  const authState = desktopStatus?.runtime?.auth;
  const workspaceName = selectedWorkspace.split("/").filter(Boolean).at(-1) || null;
  const currentTailnet = tailscaleStatus?.current_tailnet || "";
  const knownTailnetDomain = currentTailnet || savedRemoteParts.tailnetDomain;
  const canAutoAppendTailnet = Boolean(knownTailnetDomain);
  const builtRemoteOrigin = canAutoAppendTailnet
    ? buildRemoteOrigin(manualDeviceName, knownTailnetDomain)
    : buildRemoteOriginFromHost(manualRemoteHost);
  const previewPortalLink = builtRemoteOrigin ? buildPortalLink(builtRemoteOrigin, portal?.slug || null) : null;

  useEffect(() => {
    const nextParts = splitRemoteOrigin(onboarding?.remote_origin || "");
    const nextHost = extractRemoteHostname(onboarding?.remote_origin || "");
    setManualDeviceName(nextParts.deviceName || suggestedDeviceName);
    setManualRemoteHost(nextHost);
  }, [onboarding?.remote_origin, suggestedDeviceName]);

  useEffect(() => {
    if (!manualDeviceName && suggestedDeviceName) {
      setManualDeviceName(suggestedDeviceName);
    }
  }, [manualDeviceName, suggestedDeviceName]);

  useEffect(() => {
    let isMounted = true;
    if (!remoteLinkReady || !linkValue) {
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
  }, [linkValue, remoteLinkReady]);

  useEffect(() => {
    let isMounted = true;
    const mobileInstallUrl = tailscaleStatus?.mobile_install_url;
    if (!mobileInstallUrl || remoteLinkReady) {
      setMobileSetupQrDataUrl(null);
      return () => {
        isMounted = false;
      };
    }
    void QRCode.toDataURL(mobileInstallUrl, {
      margin: 0,
      width: 220,
      color: {
        dark: "#F5F7FB",
        light: "#00000000",
      },
    })
      .then((value) => {
        if (isMounted) {
          setMobileSetupQrDataUrl(value);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMobileSetupQrDataUrl(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [remoteLinkReady, tailscaleStatus?.mobile_install_url]);

  const heroText = useMemo(() => {
    if (!runtimeReady) {
      return "먼저 이 장비 안에 EleMate 로컬 엔진을 준비합니다.";
    }
    if (!computerUseReady) {
      return "먼저 이 컴퓨터를 실제로 움직일 수 있게 권한만 허용하면 됩니다.";
    }
    if (!onboarding?.auth_ready) {
      return "먼저 AI 연결만 끝내면 됩니다.";
    }
    if (!selectedWorkspace) {
      return "이제 내 파일이 들어 있는 폴더만 고르면 됩니다.";
    }
    if (!workspaceAccessReady) {
      return "폴더는 골랐습니다. 지금 이 자리에서 실제 접근 허용까지 끝내야 원격에서 막히지 않습니다.";
    }
    if (!remoteAppInstalled) {
      return "마지막으로 원격 연결 앱만 설치하면 됩니다.";
    }
    if (manualRemoteSavedOnly) {
      return "휴대폰 접속 주소는 저장됐지만, 아직 실제 연결 확인이 끝나지 않았습니다.";
    }
    if (!remoteLoggedIn) {
      return "마지막으로 원격 연결 로그인만 끝내면 됩니다.";
    }
    if (!remoteRunning) {
      return "원격 연결은 이미 계정이 연결돼 있습니다. 이제 연결만 다시 켜면 됩니다.";
    }
    if (!remoteReady) {
      return "마지막으로 휴대폰 접속만 켜면 설정이 끝납니다.";
    }
    return "준비가 끝났습니다. 이제 휴대폰에서 바로 맡기면 됩니다.";
  }, [computerUseReady, manualRemoteSavedOnly, onboarding?.auth_ready, remoteAppInstalled, remoteLoggedIn, remoteReady, remoteRunning, runtimeReady, selectedWorkspace, workspaceAccessReady]);

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
            네 단계면 충분합니다.
          </h1>
          <p className="ui-copy mt-4 max-w-2xl">{heroText}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="ui-chip">{readyCount}/4 완료</span>
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

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">01 컴퓨터 사용 승인</p>
              <p className="ui-title-card mt-3">{computerUseReady ? "컴퓨터 사용 준비 완료" : "먼저 컴퓨터 사용 권한 허용"}</p>
              <p className="ui-copy-sm mt-3">
                {computerUseReady
                  ? "이제 EleMate가 화면을 보고, 필요할 때 제어까지 요청할 수 있습니다."
                  : "처음 한 번만 허용하면 이후에는 모드 전환 없이 바로 실행형 채팅으로 쓸 수 있습니다. 화면 보기와 제어 권한을 먼저 끝내세요."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(accessibilityGranted)}`}>
                  제어 권한 {accessibilityGranted ? "허용됨" : "필요"}
                </span>
                <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(screenGranted)}`}>
                  화면 권한 {screenGranted ? "허용됨" : "필요"}
                </span>
              </div>
              {!computerUseReady ? (
                <p className="ui-copy-sm mt-3 text-white/62">
                  macOS 특성상 화면 권한은 허용 후 앱을 다시 켜야 반영될 수 있습니다. EleMate가 목록에 안 보이면 먼저 `화면 권한 요청`을 누른 뒤 설정 화면에서 허용하세요.
                </p>
              ) : null}
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(computerUseReady)}`}>
              {statusLabel(computerUseReady)}
            </span>
          </div>
          {!computerUseReady ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {!accessibilityGranted ? (
                <>
                  <button type="button" onClick={onPromptAccessibility} className="ui-button-secondary px-4 py-2.5">
                    제어 권한 요청
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSystemPreferences("accessibility")}
                    className="ui-button-secondary px-4 py-2.5"
                  >
                    접근성 설정 열기
                  </button>
                </>
              ) : null}
              {!screenGranted ? (
                <>
                  <button type="button" onClick={onPromptScreenAccess} className="ui-button-secondary px-4 py-2.5">
                    화면 권한 요청
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSystemPreferences("screen")}
                    className="ui-button-secondary px-4 py-2.5"
                  >
                    화면 권한 설정 열기
                  </button>
                  <button type="button" onClick={onRelaunchApp} className="ui-button-secondary px-4 py-2.5">
                    허용 후 앱 다시 시작
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">02 AI 연결</p>
              <p className="ui-title-card mt-3">{onboarding?.auth_ready ? "내 계정 연결 완료" : "AI 연결하기"}</p>
              <p className="ui-copy-sm mt-3">
                {onboarding?.auth_ready
                  ? onboarding.auth_account_email || "이 장비가 내 계정으로 답변합니다."
                  : authState?.status === "waiting_browser"
                    ? authState.message || "브라우저에서 로그인과 권한 확인을 끝내고 이 창으로 돌아오면 자동으로 연결 상태를 확인합니다."
                    : authState?.status === "starting"
                      ? authState.message || "브라우저 연결을 준비하고 있습니다."
                      : "버튼을 누르면 브라우저가 열립니다. 로그인 뒤 이 창으로 돌아오면 연결 완료 여부가 바로 반영됩니다."}
              </p>
              {onboarding?.auth_ready ? (
                <p className="ui-copy-sm mt-2 text-emerald-100/88">정상 연결되면 이 카드가 완료 상태로 바뀌고 계정 이메일이 표시됩니다.</p>
              ) : null}
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(Boolean(onboarding?.auth_ready))}`}>
              {statusLabel(Boolean(onboarding?.auth_ready))}
            </span>
          </div>
          {!onboarding?.auth_ready ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={onOpenChatLogin} className="ui-button-primary px-4 py-2.5">
                {authState?.status === "waiting_browser" ? "브라우저 다시 열기" : "AI 연결 시작"}
              </button>
              <button type="button" onClick={onRefresh} className="ui-button-secondary px-4 py-2.5">
                연결 상태 다시 확인
              </button>
            </div>
          ) : null}
        </article>

        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">03 내 폴더</p>
              <p className="ui-title-card mt-3">
                {!selectedWorkspace ? "폴더 선택하기" : workspaceAccessReady ? "폴더 연결 완료" : "폴더 접근 허용 필요"}
              </p>
              <p className="ui-copy-sm mt-3 break-all">
                {!selectedWorkspace
                  ? "문서가 들어 있는 폴더 하나만 고르면 충분합니다."
                  : workspaceAccessReady
                    ? selectedWorkspace
                    : workspaceAccessCheck?.detail || `${selectedWorkspace} · 폴더는 골랐지만 실제 접근 허용 확인이 아직 끝나지 않았습니다.`}
              </p>
              {selectedWorkspace ? (
                <p className="ui-copy-sm mt-2 text-white/78">
                  현재 선택된 폴더: <span className="font-semibold text-white">{workspaceName}</span>
                </p>
              ) : null}
              {selectedWorkspace && !workspaceAccessReady ? (
                <p className="ui-copy-sm mt-2 text-amber-200/78">
                  이 단계는 폴더 고르기에서 끝나지 않습니다. 지금 이 Mac에서 접근 허용까지 끝내야, 나중에 휴대폰으로만 접속했을 때 중간에 막히지 않습니다.
                </p>
              ) : null}
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(workspaceAccessReady)}`}>
              {statusLabel(workspaceAccessReady, selectedWorkspace ? "권한 필요" : "다음 단계")}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onOpenWorkspacePicker} className="ui-button-secondary px-4 py-2.5">
              {selectedWorkspace ? "폴더 바꾸기" : "폴더 선택"}
            </button>
            {selectedWorkspace && !workspaceAccessReady ? (
              <>
                <button type="button" onClick={onCheckWorkspaceAccess} className="ui-button-primary px-4 py-2.5">
                  폴더 접근 다시 확인
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSystemPreferences(workspacePermissionPane)}
                  className="ui-button-secondary px-4 py-2.5"
                >
                  {workspacePermissionPane === "all-files" ? "전체 디스크 접근 열기" : "파일 및 폴더 권한 열기"}
                </button>
              </>
            ) : null}
          </div>
        </article>

        <article className="ui-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">04 휴대폰 연결</p>
              <p className="ui-title-card mt-3">
                {!remoteAppInstalled
                  ? "원격 연결 앱 설치"
                  : !remoteStatusReadable
                  ? "원격 연결 앱 오류"
                  : !remoteLoggedIn
                  ? "원격 연결 로그인"
                  : !remoteRunning
                    ? "원격 연결 다시 켜기"
                  : remoteLinkReady
                    ? "휴대폰 링크 준비 완료"
                    : "휴대폰 접속 켜기"}
              </p>
              <p className="ui-copy-sm mt-3 break-all">
                {!remoteAppInstalled
                  ? "이 장비에 Tailscale이 아직 없습니다. 버튼을 누르면 설치 페이지를 열고, 설치 후 다시 확인하면 됩니다."
                  : !remoteStatusReadable
                  ? "이 Mac에서 Tailscale 상태를 아직 제대로 읽지 못했습니다. 메뉴바의 Tailscale 앱이 로그인된 상태인지 먼저 확인한 뒤 다시 확인하세요."
                  : manualRemoteSavedOnly
                  ? "휴대폰에서 열 주소는 저장했지만, 실제로 연결이 켜졌는지는 아직 확인되지 않았습니다."
                  : !remoteLoggedIn
                  ? "로그인 버튼을 누르면 Tailscale 로그인 화면이 열립니다. 이 Mac에서 먼저 로그인한 뒤, 여기로 돌아와 다시 확인하세요."
                  : !remoteRunning
                    ? "이 Mac의 Tailscale 연결이 지금 꺼져 있습니다. 버튼을 누르면 다시 켭니다."
                  : remoteLinkReady
                    ? linkValue || "개인 링크가 준비되었습니다."
                    : "거의 끝났습니다. 마지막으로 휴대폰 접속 켜기를 눌러 휴대폰 링크를 만드세요. 처음 한 번은 Tailscale 승인 페이지가 열릴 수 있습니다."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(remoteAppInstalled)}`}>
                  Mac 앱 {remoteAppInstalled ? "설치됨" : "설치 필요"}
                </span>
                <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(remoteLoggedIn)}`}>
                  계정 연결 {remoteLoggedIn ? "완료" : "필요"}
                </span>
                <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(remoteReady)}`}>
                  휴대폰 링크 {remoteReady ? "켜짐" : "꺼짐"}
                </span>
              </div>
              {!remoteLinkReady ? (
                <p className="ui-copy-sm mt-3 text-white/62">
                  휴대폰에도 Tailscale 앱이 있어야 합니다. 아래 QR을 휴대폰으로 찍어 설치하고, 이 Mac과 같은 계정으로 로그인하세요.
                </p>
              ) : null}
              {!remoteLinkReady ? (
                <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="ui-copy-sm text-white/78">
                    {canAutoAppendTailnet
                      ? "자동으로 안 잡히면 Tailscale에 보이는 이 Mac의 이름만 넣으면 됩니다."
                      : "자동으로 안 잡히면 Tailscale에서 이 Mac의 전체 주소를 한 번만 복사해 넣으면 됩니다."}
                  </p>
                  <p className="ui-copy-sm mt-2 text-white/58">
                    {canAutoAppendTailnet ? (
                      <>
                        1. Mac 메뉴바에서 Tailscale 아이콘을 누릅니다.
                        <br />
                        2. <span className="font-semibold text-white/82">This Device: macbookpro-1</span> 같은 줄에서 이름만 봅니다.
                        <br />
                        3. 그 이름만 아래 칸에 넣으면 EleMate가 <span className="font-mono text-white/82">{knownTailnetDomain}</span> 를 자동으로 붙여 주소를 만듭니다.
                      </>
                    ) : (
                      <>
                        1. <span className="font-semibold text-white/82">Tailscale 관리 화면</span>을 엽니다.
                        <br />
                        2. <span className="font-semibold text-white/82">Machines</span>에서 이 Mac을 누릅니다.
                        <br />
                        3. <span className="font-semibold text-white/82">Full domain name</span> 을 그대로 복사합니다.
                        <br />
                        4. 예: <span className="font-mono text-white/82">macmini.tail4fbf54.ts.net</span>
                      </>
                    )}
                  </p>
                  {hostnameHint && canAutoAppendTailnet ? (
                    <p className="ui-copy-sm mt-2 text-amber-200/78">
                      참고: 이 Mac 이름으로는 <span className="font-mono text-white/82">{hostnameHint}</span> 이 보이지만, 실제 Tailscale 기기 이름과 다를 수 있어 자동 입력하지 않았습니다.
                    </p>
                  ) : null}
                  <p className="ui-copy-sm mt-2 text-white/58">
                    {canAutoAppendTailnet
                      ? "이름만 맞으면 EleMate가 휴대폰 링크와 QR을 바로 만듭니다."
                      : "이 값을 붙여 넣으면 EleMate가 휴대폰 링크와 QR을 바로 만듭니다."}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-1">
                    <input
                      type="text"
                      value={canAutoAppendTailnet ? manualDeviceName : manualRemoteHost}
                      onChange={(event) => (canAutoAppendTailnet ? setManualDeviceName(event.target.value) : setManualRemoteHost(event.target.value))}
                      placeholder={canAutoAppendTailnet ? suggestedDeviceName || "macbookpro-1" : "macmini.tail4fbf54.ts.net"}
                      className="min-h-11 flex-1 rounded-full border border-white/12 bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-white/35"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canAutoAppendTailnet && suggestedDeviceName ? (
                      <button
                        type="button"
                        onClick={() => setManualDeviceName(suggestedDeviceName)}
                        className="ui-button-secondary px-4 py-2.5"
                      >
                        자동 감지 이름 불러오기
                      </button>
                    ) : null}
                    {!canAutoAppendTailnet ? (
                      <>
                        <button
                          type="button"
                          onClick={() => window.open("https://login.tailscale.com/admin/machines", "_blank", "noopener,noreferrer")}
                          className="ui-button-secondary px-4 py-2.5"
                        >
                          Tailscale 기기 주소 찾기
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open("https://login.tailscale.com/admin/dns", "_blank", "noopener,noreferrer")}
                          className="ui-button-secondary px-4 py-2.5"
                        >
                          DNS 페이지 열기
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => builtRemoteOrigin && onSaveRemoteOrigin(builtRemoteOrigin)}
                      disabled={!builtRemoteOrigin || isBusy}
                      className="ui-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      링크 만들기
                    </button>
                  </div>
                  <p className="ui-copy-sm mt-3 break-all text-white/72">
                    {builtRemoteOrigin ? (
                      <>
                        미리보기: <span className="font-mono text-white/88">{builtRemoteOrigin}</span>
                      </>
                    ) : (
                      canAutoAppendTailnet
                        ? "이름만 넣으면 EleMate가 휴대폰 링크를 자동으로 만듭니다."
                        : "기기 전체 주소를 붙여 넣으면 EleMate가 휴대폰 링크를 자동으로 만듭니다."
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            <span className={`ui-chip px-3 py-1.5 text-[11px] font-semibold ${statusTone(remoteLinkReady)}`}>
              {statusLabel(
                remoteLinkReady,
                !remoteAppInstalled ? "설치 필요" : !remoteStatusReadable ? "앱 오류" : !tailscaleStatus?.logged_in ? "로그인 필요" : "설정 필요",
              )}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onOpenRemoteAccessApp} className="ui-button-secondary px-4 py-2.5">
              {remoteAppInstalled ? "원격 연결 앱 열기" : "원격 연결 앱 설치"}
            </button>
            {remoteAppInstalled && remoteStatusReadable && !remoteLoggedIn ? (
              <button type="button" onClick={onStartRemoteAccessFlow} className="ui-button-secondary px-4 py-2.5">
                원격 연결 로그인 시작
              </button>
            ) : null}
            {remoteAppInstalled && remoteStatusReadable && remoteLoggedIn && !remoteRunning ? (
              <button type="button" onClick={onStartRemoteAccessFlow} className="ui-button-secondary px-4 py-2.5">
                원격 연결 다시 켜기
              </button>
            ) : null}
            {!remoteLinkReady ? (
              <button type="button" onClick={onRefresh} className="ui-button-secondary px-4 py-2.5">
                허용/연결 후 다시 확인
              </button>
            ) : null}
            {remoteAppInstalled && !remoteLinkReady ? (
              <button
                type="button"
                onClick={onEnableRemoteAccess}
                disabled={isBusy}
                className="ui-button-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                휴대폰 접속 켜기
              </button>
            ) : null}
            {!remoteLinkReady && tailscaleStatus?.mobile_install_url ? (
              <button
                type="button"
                onClick={() => void copyValue(tailscaleStatus.mobile_install_url, "휴대폰용 설치 링크를 복사했습니다.")}
                className="ui-button-secondary px-4 py-2.5"
              >
                휴대폰 설치 링크 복사
              </button>
            ) : null}
            {remoteLinkReady && linkValue ? (
              <button
                type="button"
                onClick={() => void copyValue(linkValue, "내 접속 링크를 복사했습니다.")}
                className="ui-button-primary px-4 py-2.5"
              >
                접속 링크 복사
              </button>
            ) : null}
          </div>
          {remoteLinkReady && linkValue && qrDataUrl ? (
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <img src={qrDataUrl} alt="EleMate phone access QR code" className="h-[180px] w-[180px]" />
                <p className="ui-copy-sm max-w-[28ch] text-white/72">휴대폰 카메라로 스캔하면 바로 내 에이전트 대화창이 열립니다.</p>
              </div>
            </div>
          ) : null}
          {!remoteLinkReady && previewPortalLink ? (
            <div className="mt-5 rounded-[22px] border border-amber-400/18 bg-amber-500/8 px-4 py-4">
              <p className="ui-copy-sm text-amber-50/88">
                아래 주소는 아직 예상 주소입니다. 지금은 휴대폰에서 바로 열리지 않을 수 있습니다. 먼저
                <span className="font-semibold text-amber-50"> 휴대폰 접속 켜기</span>
                를 눌러 실제 링크를 켜세요. 그 다음 최종 링크와 QR이 생성됩니다.
              </p>
              <p className="ui-copy-sm mt-3 break-all text-amber-50/72">
                예상 주소: <span className="font-mono text-amber-50/90">{previewPortalLink}</span>
              </p>
            </div>
          ) : null}
          {!remoteLinkReady && mobileSetupQrDataUrl ? (
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <img src={mobileSetupQrDataUrl} alt="Tailscale mobile install QR code" className="h-[180px] w-[180px]" />
                <p className="ui-copy-sm max-w-[30ch] text-white/72">
                  휴대폰으로 스캔해 Tailscale을 설치하고, 이 Mac과 같은 계정으로 로그인한 뒤 다시 돌아오세요.
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
      {statusMessage ? <p className="mt-4 rounded-[20px] border border-emerald-400/22 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">{statusMessage}</p> : null}
      {error ? <p className="mt-4 rounded-[20px] border border-rose-400/22 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
    </section>
  );
}
