const { contextBridge, ipcRenderer } = require("electron");

const desktopBridge = {
  getStatus: () => ipcRenderer.invoke("desktop:get-status"),
  installLocalRuntime: () => ipcRenderer.invoke("desktop:install-local-runtime"),
  restartLocalServices: () => ipcRenderer.invoke("desktop:restart-local-services"),
  chooseDirectory: () => ipcRenderer.invoke("desktop:choose-directory"),
  checkWorkspaceAccess: (targetPath) => ipcRenderer.invoke("desktop:check-workspace-access", targetPath),
  promptAccessibility: () => ipcRenderer.invoke("desktop:prompt-accessibility"),
  promptScreenAccess: () => ipcRenderer.invoke("desktop:prompt-screen-access"),
  openSystemPreferences: (pane) => ipcRenderer.invoke("desktop:open-system-preferences", pane),
  openChatLogin: () => ipcRenderer.invoke("desktop:open-chatgpt-login"),
  openRemoteAccessApp: () => ipcRenderer.invoke("desktop:open-remote-access-app"),
  startRemoteAccessFlow: () => ipcRenderer.invoke("desktop:start-remote-access-flow"),
  openExternalUrl: (url) => ipcRenderer.invoke("desktop:open-external-url", url),
  relaunchApp: () => ipcRenderer.invoke("desktop:relaunch-app"),
  installBackgroundAgent: () => ipcRenderer.invoke("desktop:install-background-agent"),
  uninstallBackgroundAgent: () => ipcRenderer.invoke("desktop:uninstall-background-agent"),
  runTerminalCommand: (command) => ipcRenderer.invoke("desktop:run-terminal-command", command),
  prepareTerminalCommand: (command) => ipcRenderer.invoke("desktop:prepare-terminal-command", command),
};

contextBridge.exposeInMainWorld("elemateDesktop", desktopBridge);
contextBridge.exposeInMainWorld("forgeDesktop", desktopBridge);
