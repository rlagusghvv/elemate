const { contextBridge, ipcRenderer } = require("electron");

const desktopBridge = {
  getStatus: () => ipcRenderer.invoke("desktop:get-status"),
  chooseDirectory: () => ipcRenderer.invoke("desktop:choose-directory"),
  promptAccessibility: () => ipcRenderer.invoke("desktop:prompt-accessibility"),
  openSystemPreferences: (pane) => ipcRenderer.invoke("desktop:open-system-preferences", pane),
  openChatLogin: () => ipcRenderer.invoke("desktop:open-chatgpt-login"),
  openRemoteAccessApp: () => ipcRenderer.invoke("desktop:open-remote-access-app"),
  installBackgroundAgent: () => ipcRenderer.invoke("desktop:install-background-agent"),
  uninstallBackgroundAgent: () => ipcRenderer.invoke("desktop:uninstall-background-agent"),
  runTerminalCommand: (command) => ipcRenderer.invoke("desktop:run-terminal-command", command),
  prepareTerminalCommand: (command) => ipcRenderer.invoke("desktop:prepare-terminal-command", command),
};

contextBridge.exposeInMainWorld("elemateDesktop", desktopBridge);
contextBridge.exposeInMainWorld("forgeDesktop", desktopBridge);
