"use client";

import { useEffect, useState } from "react";

import {
  enableTailscaleServe,
  fetchOnboardingStatus,
  fetchPortalMe,
  fetchTailscaleStatus,
  resetTailscaleServe,
  updateOnboardingStatus,
  updatePortalMe,
} from "@/lib/api";
import { BrowserOperatorPanel } from "@/components/browser-operator-panel";
import { DeviceStatusPanel } from "@/components/device-status-panel";
import { ElephantMascot } from "@/components/elephant-mascot";
import { FreeChatPanel } from "@/components/free-chat-panel";
import { SetupWizard } from "@/components/setup-wizard";
import { WorkspaceBrowser } from "@/components/workspace-browser";
import { BRAND_CATEGORY, BRAND_NAME } from "@/lib/brand";
import type { DesktopBridgeStatus, OnboardingStatus, Portal, TailscaleStatus } from "@/lib/types";

interface ChatDashboardProps {
  variant?: "local" | "portal";
}

const DEFAULT_WORKSPACE = "";
const WORKSPACE_STORAGE_KEY = "elemate.workspace-path";
const LEGACY_WORKSPACE_STORAGE_KEY = "forge-agent.workspace-path";

export function ChatDashboard({ variant = "local" }: ChatDashboardProps) {
  const [workspacePath, setWorkspacePath] = useState(DEFAULT_WORKSPACE);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<DesktopBridgeStatus | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showBrowserHelper, setShowBrowserHelper] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (savedWorkspace) {
      setWorkspacePath(savedWorkspace);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, savedWorkspace);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    void refreshDesktopStatus();
  }, []);

  async function refreshDashboard() {
    setError(null);
    try {
      const [nextOnboarding, nextPortal, nextTailscale] = await Promise.all([
        fetchOnboardingStatus(),
        fetchPortalMe(),
        fetchTailscaleStatus(),
      ]);
      setOnboarding(nextOnboarding);
      setPortal(nextPortal);
      setTailscaleStatus(nextTailscale);
      const effectiveWorkspace = nextPortal.workspace_path || nextOnboarding.workspace_path;
      if (effectiveWorkspace) {
        setWorkspacePath(effectiveWorkspace);
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, effectiveWorkspace);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "상태를 불러오지 못했습니다.");
    }
  }

  async function refreshDesktopStatus() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      setDesktopStatus(await desktopBridge.getStatus());
    } catch {
      setDesktopStatus(null);
    }
  }

  async function handleWorkspacePick(path: string) {
    setIsBusy(true);
    setError(null);
    try {
      const nextPortal = await updatePortalMe({ workspace_path: path });
      setPortal(nextPortal);
      if (nextPortal.source !== "tailscale") {
        setOnboarding(await updateOnboardingStatus({ workspace_path: path }));
      }
      setWorkspacePath(nextPortal.workspace_path ?? path);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextPortal.workspace_path ?? path);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "폴더를 저장하지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEnableTailscaleServe() {
    setIsBusy(true);
    setError(null);
    try {
      await enableTailscaleServe();
      setTailscaleStatus(await fetchTailscaleStatus());
      setPortal(await fetchPortalMe());
    } catch (serveError) {
      setError(serveError instanceof Error ? serveError.message : "휴대폰 접속을 켜지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResetTailscaleServe() {
    setIsBusy(true);
    setError(null);
    try {
      await resetTailscaleServe();
      setTailscaleStatus(await fetchTailscaleStatus());
      setPortal(await fetchPortalMe());
    } catch (serveError) {
      setError(serveError instanceof Error ? serveError.message : "접속 설정을 다시 맞추지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenWorkspacePicker() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (desktopBridge) {
      try {
        const selected = await desktopBridge.chooseDirectory();
        if (selected) {
          await handleWorkspacePick(selected);
        }
        return;
      } catch (desktopError) {
        setError(desktopError instanceof Error ? desktopError.message : "폴더 선택에 실패했습니다.");
      }
    }
    setPickerOpen(true);
  }

  async function handlePromptAccessibility() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.promptAccessibility();
      await refreshDesktopStatus();
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "제어 권한 요청에 실패했습니다.");
    }
  }

  async function handleOpenSystemPreferences(pane: "accessibility" | "screen") {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.openSystemPreferences(pane);
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "시스템 설정을 열지 못했습니다.");
    }
  }

  async function handleOpenChatLogin() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.openChatLogin();
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "AI 연결 창을 열지 못했습니다.");
    }
  }

  async function handleOpenRemoteAccessApp() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.openRemoteAccessApp();
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "원격 연결 앱을 열지 못했습니다.");
    }
  }

  async function handleInstallBackgroundAgent() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const nextStatus = await desktopBridge.installBackgroundAgent();
      setDesktopStatus((current) => (current ? { ...current, daemon: nextStatus } : null));
      await refreshDesktopStatus();
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "항상 켜짐 설정에 실패했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUninstallBackgroundAgent() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const nextStatus = await desktopBridge.uninstallBackgroundAgent();
      setDesktopStatus((current) => (current ? { ...current, daemon: nextStatus } : null));
      await refreshDesktopStatus();
    } catch (desktopError) {
      setError(desktopError instanceof Error ? desktopError.message : "항상 켜짐 해제에 실패했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  if (variant === "portal") {
    return (
      <section className="space-y-4 pb-6">
        <section className="panel overflow-hidden px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">My Agent</p>
              <h1 className="mt-3 font-display text-[32px] font-semibold tracking-[-0.05em] text-ink">
                {portal?.user_name || "내 에이전트"}와 대화
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">필요한 일을 짧게 말하면 됩니다. 위험한 동작은 중간에 확인을 요청합니다.</p>
            </div>
            <div className="hidden w-[112px] sm:block">
              <ElephantMascot className="w-full" />
            </div>
          </div>
        </section>
        <FreeChatPanel workspacePath={workspacePath} compact />
      </section>
    );
  }

  const setupReady = Boolean(onboarding?.auth_ready && workspacePath && tailscaleStatus?.serve_enabled);

  return (
    <section className="space-y-5 pb-8">
      <section className="panel overflow-hidden px-6 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <p className="eyebrow">{BRAND_CATEGORY}</p>
            <h1 className="ui-title-main mt-4 max-w-4xl">
              이 컴퓨터의
              <br />
              {BRAND_NAME} 콘솔
            </h1>
            <p className="ui-copy mt-4 max-w-2xl">
              이 화면은 설치된 장비에서만 열립니다. 왼쪽에서는 장비 연결만 끝내고, 대부분의 일은 오른쪽 채팅에서 바로 요청하면 됩니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="ui-chip">
                {onboarding?.auth_ready ? "AI 연결됨" : "AI 연결 필요"}
              </span>
              <span className="ui-chip">
                {workspacePath ? "폴더 연결됨" : "폴더 선택 필요"}
              </span>
              <span className="ui-chip">
                {tailscaleStatus?.serve_enabled ? "휴대폰 접속 가능" : "휴대폰 접속 준비 중"}
              </span>
            </div>
          </div>
          <div className="mx-auto hidden w-full max-w-[240px] lg:block">
            <ElephantMascot className="w-full" caption="설치된 장비 전용 콘솔" />
          </div>
        </div>
      </section>

      {!setupReady ? (
        <>
          <SetupWizard
            onboarding={onboarding}
            workspacePath={workspacePath}
            portal={portal}
            tailscaleStatus={tailscaleStatus}
            desktopStatus={desktopStatus}
            isBusy={isBusy}
            error={error}
            onRefresh={() => void refreshDashboard()}
            onOpenChatLogin={() => void handleOpenChatLogin()}
            onOpenWorkspacePicker={() => void handleOpenWorkspacePicker()}
            onOpenRemoteAccessApp={() => void handleOpenRemoteAccessApp()}
            onEnableRemoteAccess={() => void handleEnableTailscaleServe()}
            onInstallBackgroundAgent={() => void handleInstallBackgroundAgent()}
          />

          <section className="panel overflow-hidden px-6 py-6 sm:px-8 sm:py-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center">
              <div>
                <p className="eyebrow">After Setup</p>
                <h2 className="ui-title-section mt-4">설정이 끝나면 대화가 시작됩니다.</h2>
                <p className="ui-copy mt-4 max-w-2xl">
                  첫 연결만 끝나면 이후에는 휴대폰 링크에서 주로 대화하면 됩니다. 이 컴퓨터 화면은 점검이나 폴더 변경이 필요할 때만 열면 됩니다.
                </p>
              </div>
              <div className="mx-auto hidden w-full max-w-[190px] lg:block">
                <ElephantMascot className="w-full" caption="설정이 끝나면 바로 대화합니다." />
              </div>
            </div>
          </section>
        </>
      ) : null}

      {setupReady ? (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <DeviceStatusPanel
            onboarding={onboarding}
            workspacePath={workspacePath}
            portal={portal}
            tailscaleStatus={tailscaleStatus}
            desktopStatus={desktopStatus}
            isBusy={isBusy}
            error={error}
            onOpenWorkspacePicker={() => void handleOpenWorkspacePicker()}
            onOpenRemoteAccessApp={() => void handleOpenRemoteAccessApp()}
            onResetRemoteAccess={() => void handleResetTailscaleServe()}
            onInstallBackgroundAgent={() => void handleInstallBackgroundAgent()}
            onUninstallBackgroundAgent={() => void handleUninstallBackgroundAgent()}
            onPromptAccessibility={() => void handlePromptAccessibility()}
            onOpenSystemPreferences={(pane) => void handleOpenSystemPreferences(pane)}
          />

          <section className="panel px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Site Helper</p>
                <h2 className="ui-title-card mt-3">사이트 도우미</h2>
                <p className="ui-copy-sm mt-3">브라우저를 직접 열어 확인해야 할 때만 여는 보조 패널입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBrowserHelper((value) => !value)}
                className="ui-button-tertiary min-h-9 px-3.5 py-2 text-xs"
              >
                {showBrowserHelper ? "닫기" : "열기"}
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <FreeChatPanel workspacePath={workspacePath} />
          {showBrowserHelper && <BrowserOperatorPanel compact />}
        </div>
        </section>
      ) : null}

      <WorkspaceBrowser
        open={pickerOpen}
        selectedPath={workspacePath || onboarding?.workspace_root || ""}
        onPick={(path) => void handleWorkspacePick(path)}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  );
}
