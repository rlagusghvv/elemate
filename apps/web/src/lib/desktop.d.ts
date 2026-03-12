import type { DesktopBridgeStatus, DesktopDaemonStatus } from "@/lib/types";

declare global {
  interface Window {
    elemateDesktop?: {
      getStatus: () => Promise<DesktopBridgeStatus>;
      installLocalRuntime: () => Promise<DesktopBridgeStatus>;
      restartLocalServices: () => Promise<DesktopBridgeStatus>;
      chooseDirectory: () => Promise<string | null>;
      promptAccessibility: () => Promise<boolean>;
      promptScreenAccess: () => Promise<string>;
      openSystemPreferences: (pane: "accessibility" | "screen") => Promise<boolean>;
      openChatLogin: () => Promise<boolean>;
      openRemoteAccessApp: () => Promise<boolean>;
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
      promptAccessibility: () => Promise<boolean>;
      promptScreenAccess: () => Promise<string>;
      openSystemPreferences: (pane: "accessibility" | "screen") => Promise<boolean>;
      openChatLogin: () => Promise<boolean>;
      openRemoteAccessApp: () => Promise<boolean>;
      installBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      uninstallBackgroundAgent: () => Promise<DesktopDaemonStatus>;
      runTerminalCommand: (command: string) => Promise<boolean>;
      prepareTerminalCommand: (command: string) => Promise<string>;
    };
  }
}

export {};
