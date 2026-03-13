import type { DesktopBridgeStatus, DesktopDaemonStatus, DesktopPermissionPane, DesktopWorkspaceAccessCheckResult } from "@/lib/types";

declare global {
  interface Window {
    elemateDesktop?: {
      getStatus: () => Promise<DesktopBridgeStatus>;
      installLocalRuntime: () => Promise<DesktopBridgeStatus>;
      restartLocalServices: () => Promise<DesktopBridgeStatus>;
      chooseDirectory: () => Promise<string | null>;
      checkWorkspaceAccess: (targetPath: string) => Promise<DesktopWorkspaceAccessCheckResult>;
      promptAccessibility: () => Promise<boolean>;
      promptScreenAccess: () => Promise<string>;
      openSystemPreferences: (pane: DesktopPermissionPane) => Promise<boolean>;
      openChatLogin: () => Promise<boolean>;
      openRemoteAccessApp: () => Promise<boolean>;
      startRemoteAccessFlow: () => Promise<boolean>;
      openExternalUrl: (url: string) => Promise<boolean>;
      relaunchApp: () => Promise<boolean>;
      installBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      uninstallBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      runTerminalCommand: (command: string) => Promise<boolean>;
      prepareTerminalCommand: (command: string) => Promise<string>;
    };
    forgeDesktop?: {
      getStatus: () => Promise<DesktopBridgeStatus>;
      installLocalRuntime: () => Promise<DesktopBridgeStatus>;
      restartLocalServices: () => Promise<DesktopBridgeStatus>;
      chooseDirectory: () => Promise<string | null>;
      checkWorkspaceAccess: (targetPath: string) => Promise<DesktopWorkspaceAccessCheckResult>;
      promptAccessibility: () => Promise<boolean>;
      promptScreenAccess: () => Promise<string>;
      openSystemPreferences: (pane: DesktopPermissionPane) => Promise<boolean>;
      openChatLogin: () => Promise<boolean>;
      openRemoteAccessApp: () => Promise<boolean>;
      startRemoteAccessFlow: () => Promise<boolean>;
      openExternalUrl: (url: string) => Promise<boolean>;
      relaunchApp: () => Promise<boolean>;
      installBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      uninstallBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      runTerminalCommand: (command: string) => Promise<boolean>;
      prepareTerminalCommand: (command: string) => Promise<string>;
    };
  }
}

export {};
