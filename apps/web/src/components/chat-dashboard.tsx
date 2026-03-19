"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearApiKey,
  enableTailscaleServe,
  fetchOnboardingStatus,
  fetchPortalMe,
  fetchTailscaleStatus,
  resetTailscaleServe,
  saveApiKey,
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
import { WEB_APP_VERSION } from "@/lib/build-info";
import { resolvePortalLink } from "@/lib/portal-links";
import type {
  DesktopBridgeStatus,
  DesktopPermissionPane,
  DesktopWorkspaceAccessCheckResult,
  OnboardingStatus,
  Portal,
  TailscaleStatus,
} from "@/lib/types";

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
  const [workspaceAccessCheck, setWorkspaceAccessCheck] = useState<DesktopWorkspaceAccessCheckResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showBrowserHelper, setShowBrowserHelper] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previousAuthReady = useRef<boolean>(false);
  const previousRemoteReady = useRef<boolean>(false);
  const statusTimerRef = useRef<number | null>(null);
  const pendingRemoteSetupRef = useRef<boolean>(false);
  const remoteAutoEnableBusyRef = useRef<boolean>(false);
  const serveApprovalPromptedRef = useRef<boolean>(false);
  const workspaceAccessProbeRef = useRef<string | null>(null);

  function showStatus(message: string) {
    setStatusMessage(message);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
    }, 3200);
  }

  useEffect(() => {
    const savedWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (savedWorkspace) {
      setWorkspacePath(savedWorkspace);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, savedWorkspace);
    }
  }, []);

  useEffect(() => {
    const authReady = Boolean(onboarding?.auth_ready);
    if (authReady && !previousAuthReady.current) {
      showStatus(
        onboarding?.api_key_ready && !onboarding?.chatgpt_login_ready
          ? "API 키 연결이 완료되었습니다."
          : onboarding?.auth_account_email
            ? `AI 연결 완료: ${onboarding.auth_account_email}`
            : "AI 연결이 완료되었습니다.",
      );
    }
    previousAuthReady.current = authReady;
  }, [onboarding?.api_key_ready, onboarding?.chatgpt_login_ready, onboarding?.auth_account_email, onboarding?.auth_ready]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const remoteReady = Boolean(resolvePortalLink(portal, tailscaleStatus));
    if (remoteReady && !previousRemoteReady.current) {
      showStatus("휴대폰 접속 링크가 준비되었습니다.");
    }
    previousRemoteReady.current = remoteReady;
  }, [onboarding, portal, tailscaleStatus]);

  const runtimeBuildLabel = `web v${WEB_APP_VERSION}${
    desktopStatus
      ? ` · app v${desktopStatus.runtime.app_version} · runtime ${
          desktopStatus.runtime.runtime_generated_at
            ? new Date(desktopStatus.runtime.runtime_generated_at).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "unknown"
        }`
      : ""
  }`;

  useEffect(() => {
    if (variant !== "local") {
      return;
    }
    if (!pendingRemoteSetupRef.current || remoteAutoEnableBusyRef.current) {
      return;
    }
    const serveReady = Boolean(tailscaleStatus?.serve_enabled && tailscaleStatus?.serve_matches_runtime);
    if (!tailscaleStatus?.logged_in || serveReady) {
      if (serveReady) {
        pendingRemoteSetupRef.current = false;
      }
      return;
    }

    remoteAutoEnableBusyRef.current = true;
    pendingRemoteSetupRef.current = false;
    void (async () => {
      try {
        await enableTailscaleServe();
        setTailscaleStatus(await fetchTailscaleStatus());
        setPortal(await fetchPortalMe());
        showStatus("원격 연결 로그인이 확인되어 휴대폰 접속을 바로 켰습니다.");
      } catch (serveError) {
        setError(serveError instanceof Error ? serveError.message : "휴대폰 접속을 켜지 못했습니다.");
      } finally {
        remoteAutoEnableBusyRef.current = false;
      }
    })();
  }, [tailscaleStatus?.logged_in, tailscaleStatus?.serve_enabled, tailscaleStatus?.serve_matches_runtime, variant]);

  function formatDesktopErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) {
      return fallback;
    }
    const normalized = error.message.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/u, "").trim() || fallback;
    if (
      normalized.includes("Tailscale GUI failed to start") ||
      normalized.includes("Failed to load preferences") ||
      normalized.includes("Tailscale.CLIError")
    ) {
      return "Tailscale 앱은 설치돼 있지만 현재 이 Mac에서 정상적으로 시작되지 않았습니다. EleMate 문제가 아니라 Tailscale 앱 상태 문제입니다. Tailscale 앱을 직접 열어 로그인 상태를 확인하거나, 필요하면 Tailscale을 다시 시작한 뒤 다시 확인하세요.";
    }
    return normalized;
  }

  const refreshDashboard = useCallback(async () => {
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
      const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
      if (desktopBridge) {
        try {
          const status = await desktopBridge.getStatus();
          setDesktopStatus(status);
          if (status.runtime.mode === "bundled" && status.runtime.api.status !== "ready") {
            return;
          }
        } catch {
          // Keep the original API error if runtime status cannot be loaded.
        }
      }
      setError(loadError instanceof Error ? loadError.message : "상태를 불러오지 못했습니다.");
    }
  }, []);

  const refreshDesktopStatus = useCallback(async () => {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      setDesktopStatus(await desktopBridge.getStatus());
    } catch {
      setDesktopStatus(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshDesktopStatus();
    await refreshDashboard();
  }, [refreshDashboard, refreshDesktopStatus]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (variant !== "local") {
      return;
    }
    const runtimeStatus = desktopStatus?.runtime?.api.status;
    const authStatus = desktopStatus?.runtime?.auth.status;
    const shouldPollRuntime = Boolean(runtimeStatus && ["installing", "starting"].includes(runtimeStatus));
    const shouldPollAuth = Boolean(authStatus && ["starting", "waiting_browser"].includes(authStatus));
    if (!shouldPollRuntime && !shouldPollAuth) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshAll();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [desktopStatus?.runtime?.api.status, desktopStatus?.runtime?.auth.status, refreshAll, variant]);

  useEffect(() => {
    if (variant !== "local") {
      return;
    }
    const handleWake = () => {
      void refreshAll();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleWake();
      }
    };
    window.addEventListener("focus", handleWake);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWake);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshAll, variant]);

  const handleOpenSystemPreferences = useCallback(async (pane: DesktopPermissionPane) => {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.openSystemPreferences(pane);
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "시스템 설정을 열지 못했습니다."));
    }
  }, []);

  const handleCheckWorkspaceAccess = useCallback(async (
    targetPath?: string,
    options?: { autoOpenPreferences?: boolean; quietSuccess?: boolean },
  ) => {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    const pathToCheck = targetPath || workspacePath || onboarding?.workspace_path || portal?.workspace_path || "";

    if (!desktopBridge?.checkWorkspaceAccess || !pathToCheck) {
      return false;
    }

    try {
      const result = await desktopBridge.checkWorkspaceAccess(pathToCheck);
      setWorkspaceAccessCheck(result);
      setOnboarding(await updateOnboardingStatus({ workspace_access_ready: result.granted }));
      if (result.granted) {
        if (!options?.quietSuccess) {
          showStatus("폴더 접근이 확인되었습니다. 원격에서도 이 폴더 기준으로 바로 작업할 수 있습니다.");
        }
        return true;
      }

      setError(result.detail);
      if (options?.autoOpenPreferences && result.suggested_pane) {
        await handleOpenSystemPreferences(result.suggested_pane);
      }
    } catch (workspaceError) {
      setError(formatDesktopErrorMessage(workspaceError, "폴더 접근을 확인하지 못했습니다."));
    }

    return false;
  }, [handleOpenSystemPreferences, onboarding?.workspace_path, portal?.workspace_path, workspacePath]);

  async function handleWorkspacePick(path: string) {
    setIsBusy(true);
    setError(null);
    try {
      const nextPortal = await updatePortalMe({ workspace_path: path });
      setPortal(nextPortal);
      if (nextPortal.source !== "tailscale") {
        setOnboarding(await updateOnboardingStatus({ workspace_path: path, workspace_access_ready: false }));
      }
      const finalPath = nextPortal.workspace_path ?? path;
      workspaceAccessProbeRef.current = null;
      setWorkspaceAccessCheck(null);
      setWorkspacePath(finalPath);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, finalPath);
      const accessReady = await handleCheckWorkspaceAccess(finalPath, { autoOpenPreferences: true });
      if (accessReady) {
        showStatus(`폴더 연결 완료: ${finalPath.split("/").filter(Boolean).at(-1) || finalPath}`);
      }
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
      const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
      const approvalUrl = tailscaleStatus?.self_id ? `https://login.tailscale.com/f/serve?node=${tailscaleStatus.self_id}` : null;

      if (desktopBridge?.runTerminalCommand && tailscaleStatus?.recommended_command) {
        if (!tailscaleStatus?.serve_enabled && approvalUrl && !serveApprovalPromptedRef.current) {
          serveApprovalPromptedRef.current = true;
          if (desktopBridge.openExternalUrl) {
            await desktopBridge.openExternalUrl(approvalUrl);
          } else {
            window.open(approvalUrl, "_blank", "noopener,noreferrer");
          }
          showStatus("Tailscale Serve 승인 페이지를 열었습니다. 허용한 뒤 다시 한 번 '휴대폰 접속 켜기'를 누르세요.");
          return;
        }

        const prepared = desktopBridge.prepareTerminalCommand
          ? await desktopBridge.prepareTerminalCommand(tailscaleStatus.recommended_command)
          : tailscaleStatus.recommended_command;
        await desktopBridge.runTerminalCommand(prepared);
        showStatus("터미널에서 휴대폰 접속 명령을 열었습니다. 명령이 끝나면 다시 확인하세요.");
        return;
      }

      const result = await enableTailscaleServe();
      setTailscaleStatus(await fetchTailscaleStatus());
      setPortal(await fetchPortalMe());
      if (!result.success) {
        if (result.approval_url) {
          const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
          if (desktopBridge?.openExternalUrl) {
            await desktopBridge.openExternalUrl(result.approval_url);
          } else {
            window.open(result.approval_url, "_blank", "noopener,noreferrer");
          }
          showStatus("Tailscale Serve 승인 페이지를 열었습니다. 허용한 뒤 다시 확인하세요.");
          return;
        }
        setError(result.message);
        return;
      }
      showStatus("휴대폰 접속을 켰습니다. 링크가 준비되면 바로 사용할 수 있습니다.");
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
        setError(formatDesktopErrorMessage(desktopError, "폴더 선택에 실패했습니다."));
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
      setError(formatDesktopErrorMessage(desktopError, "제어 권한 요청에 실패했습니다."));
    }
  }

  useEffect(() => {
    if (variant !== "local") {
      return;
    }
    const selectedPath = workspacePath || onboarding?.workspace_path || portal?.workspace_path || "";
    if (!selectedPath || onboarding?.workspace_access_ready) {
      return;
    }
    if (workspaceAccessProbeRef.current === selectedPath) {
      return;
    }

    workspaceAccessProbeRef.current = selectedPath;
    void handleCheckWorkspaceAccess(selectedPath, { quietSuccess: true });
  }, [handleCheckWorkspaceAccess, onboarding?.workspace_access_ready, onboarding?.workspace_path, portal?.workspace_path, variant, workspacePath]);

  async function handlePromptScreenAccess() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      const nextStatus = await desktopBridge.promptScreenAccess();
      await refreshDesktopStatus();
      if (nextStatus === "granted") {
        showStatus("화면 권한이 확인되었습니다.");
      } else {
        showStatus("화면 권한 요청을 시도했습니다. 시스템 설정이 열리면 EleMate를 허용하고 앱을 다시 시작하세요.");
      }
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "화면 권한 요청에 실패했습니다."));
    }
  }

  async function handleOpenChatLogin() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      setError(null);
      await desktopBridge.openChatLogin();
      showStatus("브라우저를 열었습니다. 로그인 후 이 창으로 돌아오면 자동으로 다시 확인합니다.");
      await refreshDesktopStatus();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "AI 연결을 시작하지 못했습니다."));
      await refreshDesktopStatus();
    }
  }

  async function handleSaveApiKey(value: string) {
    setIsBusy(true);
    setError(null);
    try {
      await saveApiKey({ api_key: value });
      await refreshAll();
      showStatus("API 키를 저장했습니다.");
    } catch (apiKeyError) {
      setError(apiKeyError instanceof Error ? apiKeyError.message : "API 키를 저장하지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearApiKey() {
    setIsBusy(true);
    setError(null);
    try {
      await clearApiKey();
      await refreshAll();
      showStatus("API 키를 제거했습니다.");
    } catch (apiKeyError) {
      setError(apiKeyError instanceof Error ? apiKeyError.message : "API 키를 제거하지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenRemoteAccessApp() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.openRemoteAccessApp();
      showStatus("원격 연결 앱을 열었습니다. 상태를 확인하거나 로그인 뒤 이 창으로 돌아오면 다시 확인합니다.");
      await refreshDashboard();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "원격 연결 앱을 열지 못했습니다."));
    }
  }

  async function handleStartRemoteAccessFlow() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge?.startRemoteAccessFlow) {
      await handleOpenRemoteAccessApp();
      return;
    }
    try {
      pendingRemoteSetupRef.current = true;
      await desktopBridge.startRemoteAccessFlow();
      showStatus("원격 연결 로그인/연결을 시작했습니다. 완료 뒤 이 창으로 돌아오면 상태를 다시 확인합니다.");
      await refreshDashboard();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "원격 연결 로그인/연결을 시작하지 못했습니다."));
    }
  }

  async function handleRelaunchApp() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    try {
      await desktopBridge.relaunchApp();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "앱을 다시 시작하지 못했습니다."));
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
      setError(formatDesktopErrorMessage(desktopError, "항상 켜짐 설정에 실패했습니다."));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInstallLocalRuntime() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      setDesktopStatus(await desktopBridge.installLocalRuntime());
      await refreshDashboard();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "앱 준비에 실패했습니다."));
      await refreshDesktopStatus();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRestartLocalServices() {
    const desktopBridge = window.elemateDesktop ?? window.forgeDesktop;
    if (!desktopBridge) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      setDesktopStatus(await desktopBridge.restartLocalServices());
      await refreshDashboard();
    } catch (desktopError) {
      setError(formatDesktopErrorMessage(desktopError, "로컬 서비스를 다시 시작하지 못했습니다."));
      await refreshDesktopStatus();
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

  async function handleSaveRemoteOrigin(value: string) {
    setIsBusy(true);
    setError(null);
    try {
      const nextOnboarding = await updateOnboardingStatus({ remote_origin: value });
      setOnboarding(nextOnboarding);
      setPortal(await fetchPortalMe());
      showStatus("휴대폰 접속 주소를 저장했습니다.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "원격 접속 주소를 저장하지 못했습니다.");
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
              {runtimeBuildLabel ? <p className="mt-3 text-xs text-steel/80">{runtimeBuildLabel}</p> : null}
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

  const remoteLinkReady = Boolean(resolvePortalLink(portal, tailscaleStatus));
  const setupReady = Boolean(onboarding?.auth_ready && workspacePath && onboarding?.workspace_access_ready && remoteLinkReady);

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
                {workspacePath && onboarding?.workspace_access_ready ? "폴더 접근 확인됨" : workspacePath ? "폴더 접근 확인 필요" : "폴더 선택 필요"}
              </span>
              <span className="ui-chip">
                {remoteLinkReady ? "휴대폰 접속 가능" : "휴대폰 접속 준비 중"}
              </span>
            </div>
            {runtimeBuildLabel ? <p className="mt-4 text-xs text-steel/80">{runtimeBuildLabel}</p> : null}
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
            statusMessage={statusMessage}
            onRefresh={() => void refreshAll()}
            onOpenChatLogin={() => void handleOpenChatLogin()}
            onSaveApiKey={(value) => void handleSaveApiKey(value)}
            onClearApiKey={() => void handleClearApiKey()}
            onOpenWorkspacePicker={() => void handleOpenWorkspacePicker()}
            onOpenRemoteAccessApp={() => void handleOpenRemoteAccessApp()}
            onStartRemoteAccessFlow={() => void handleStartRemoteAccessFlow()}
            onEnableRemoteAccess={() => void handleEnableTailscaleServe()}
            onPromptAccessibility={() => void handlePromptAccessibility()}
            onPromptScreenAccess={() => void handlePromptScreenAccess()}
            onCheckWorkspaceAccess={() => void handleCheckWorkspaceAccess(undefined, { autoOpenPreferences: true })}
            onOpenSystemPreferences={(pane) => void handleOpenSystemPreferences(pane)}
            onRelaunchApp={() => void handleRelaunchApp()}
            onInstallBackgroundAgent={() => void handleInstallBackgroundAgent()}
            onInstallLocalRuntime={() => void handleInstallLocalRuntime()}
            onRestartLocalServices={() => void handleRestartLocalServices()}
            onSaveRemoteOrigin={(value) => void handleSaveRemoteOrigin(value)}
            workspaceAccessCheck={workspaceAccessCheck}
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
            onStartRemoteAccessFlow={() => void handleStartRemoteAccessFlow()}
            onEnableRemoteAccess={() => void handleEnableTailscaleServe()}
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
