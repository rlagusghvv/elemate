const { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function envFirst(...names) {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return null;
}

const repoRootEnv = envFirst("ELEMATE_REPO_ROOT", "FORGE_REPO_ROOT");
const SOURCE_REPO_ROOT = repoRootEnv ? path.resolve(repoRootEnv) : path.resolve(__dirname, "..", "..");
const REPO_ROOT = app.isPackaged ? (repoRootEnv ? SOURCE_REPO_ROOT : null) : SOURCE_REPO_ROOT;
const WEB_DIR = REPO_ROOT ? path.join(REPO_ROOT, "apps", "web") : null;
const API_DIR = REPO_ROOT ? path.join(REPO_ROOT, "apps", "api") : null;
const WEB_URL = envFirst("ELEMATE_DESKTOP_WEB_URL", "FORGE_DESKTOP_WEB_URL") || "http://127.0.0.1:3000";
const API_URL = envFirst("ELEMATE_DESKTOP_API_URL", "FORGE_DESKTOP_API_URL") || "http://127.0.0.1:8000";
const DAEMON_LABEL = "com.elemate.agent.daemon";
const PYTHON_DOWNLOAD_URL = "https://www.python.org/downloads/macos/";
const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";
const CODEX_INSTALL_URL = "https://developers.openai.com/codex/cli";
const TAILSCALE_DOWNLOAD_URL = "https://tailscale.com/download";

let mainWindow = null;
let apiProcess = null;
let webProcess = null;

function getPythonCommand() {
  if (!API_DIR) {
    return "python3";
  }
  const venvPython = path.join(API_DIR, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

async function ensureService(url, commandFactory, name) {
  if (await isHealthy(url)) {
    return null;
  }
  const child = commandFactory();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited before becoming healthy.`);
    }
    if (await isHealthy(url)) {
      return child;
    }
    await sleep(1000);
  }
  throw new Error(`${name} did not become ready in time.`);
}

async function isHealthy(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnApiServer() {
  if (!API_DIR) {
    throw new Error("API workspace is unavailable in packaged mode. Set ELEMATE_REPO_ROOT or start the API separately.");
  }
  if (!fs.existsSync(getPythonCommand()) && !findExecutable("python3")) {
    throw new Error(
      "EleMate를 열려면 먼저 기본 실행 도구가 필요합니다.\n\nPython 3를 설치한 뒤 다시 시도하세요.\n" + PYTHON_DOWNLOAD_URL,
    );
  }
  return spawn(getPythonCommand(), ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: API_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });
}

async function ensureWebBuild() {
  if (!WEB_DIR) {
    return;
  }
  if (!findExecutable("npm")) {
    throw new Error(
      "EleMate 화면을 준비하려면 먼저 앱 설치 도구가 필요합니다.\n\nNode.js를 설치한 뒤 다시 시도하세요.\n" + NODE_DOWNLOAD_URL,
    );
  }
  const buildIdPath = path.join(WEB_DIR, ".next", "BUILD_ID");
  if (fs.existsSync(buildIdPath)) {
    return;
  }
  await runCommand("npm", ["run", "build"], WEB_DIR, "web build");
}

function spawnWebServer() {
  if (!WEB_DIR) {
    throw new Error("Web workspace is unavailable in packaged mode. Set ELEMATE_REPO_ROOT or start the web app separately.");
  }
  if (!findExecutable("npm")) {
    throw new Error(
      "EleMate 화면을 열려면 먼저 앱 설치 도구가 필요합니다.\n\nNode.js를 설치한 뒤 다시 시도하세요.\n" + NODE_DOWNLOAD_URL,
    );
  }
  return spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });
}

function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env },
    });
    child.once("error", (error) => {
      reject(mapSpawnError(command, label, error));
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findExecutable(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout.trim() || null;
  }
  return null;
}

function mapSpawnError(command, label, error) {
  if (error && error.code === "ENOENT") {
    if (command === "npm") {
      return new Error(`EleMate ${label}를 계속하려면 Node.js가 필요합니다.\n\n설치 페이지:\n${NODE_DOWNLOAD_URL}`);
    }
    if (command === "python3" || command.endsWith("/python")) {
      return new Error(`EleMate ${label}를 계속하려면 Python 3가 필요합니다.\n\n설치 페이지:\n${PYTHON_DOWNLOAD_URL}`);
    }
  }
  return error;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 1040,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: "#070b13",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(WEB_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getPermissionStatus(kind) {
  if (process.platform !== "darwin") {
    return "unsupported";
  }
  try {
    return systemPreferences.getMediaAccessStatus(kind);
  } catch {
    return "unknown";
  }
}

function getDesktopStatus() {
  return {
    is_desktop_app: true,
    platform: process.platform,
    permissions: {
      accessibility:
        process.platform === "darwin" ? (systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "not-granted") : "unsupported",
      screen: getPermissionStatus("screen"),
      microphone: getPermissionStatus("microphone"),
      camera: getPermissionStatus("camera"),
    },
    daemon: getDaemonStatus(),
  };
}

function getDaemonContext() {
  if (process.platform !== "darwin" || !REPO_ROOT) {
    return null;
  }
  const homeDir = app.getPath("home");
  return {
    label: DAEMON_LABEL,
    plistPath: path.join(homeDir, "Library", "LaunchAgents", `${DAEMON_LABEL}.plist`),
    stdoutPath: path.join(REPO_ROOT, "logs", "launchd.stdout.log"),
    stderrPath: path.join(REPO_ROOT, "logs", "launchd.stderr.log"),
    installScriptPath: path.join(REPO_ROOT, "scripts", "install_elemate_launch_agent.sh"),
    uninstallScriptPath: path.join(REPO_ROOT, "scripts", "uninstall_elemate_launch_agent.sh"),
  };
}

function getDaemonStatus() {
  const context = getDaemonContext();
  if (!context) {
    return {
      available: false,
      installed: false,
      loaded: false,
      label: null,
      plist_path: null,
      stdout_path: null,
      stderr_path: null,
      summary: "macOS 데스크탑 앱에서만 항상 켜짐 모드를 설정할 수 있습니다.",
    };
  }

  const installed = fs.existsSync(context.plistPath);
  let loaded = false;
  if (installed && typeof process.getuid === "function") {
    const result = spawnSync("launchctl", ["print", `gui/${process.getuid()}/${context.label}`], {
      encoding: "utf8",
    });
    loaded = result.status === 0;
  }

  const summary = loaded
    ? "앱을 닫아도 이 장비가 계속 대기합니다."
    : installed
      ? "항상 켜짐은 설치되었지만 현재는 다시 시작이 필요합니다."
      : "앱을 닫으면 이 장비도 함께 멈춥니다.";

  return {
    available: true,
    installed,
    loaded,
    label: context.label,
    plist_path: context.plistPath,
    stdout_path: context.stdoutPath,
    stderr_path: context.stderrPath,
    summary,
  };
}

function openCommandInTerminal(command) {
  if (process.platform !== "darwin") {
    return false;
  }
  const lines = [
    'tell application "Terminal" to activate',
    `tell application "Terminal" to do script ${JSON.stringify(command)}`,
  ];
  const args = lines.flatMap((line) => ["-e", line]);
  const result = spawnSync("osascript", args, { encoding: "utf8" });
  if (result.status === 0) {
    return true;
  }
  const detail = result.stderr || result.stdout || "Terminal을 열지 못했습니다.";
  throw new Error(detail.trim());
}

function normalizeTerminalCommand(command) {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("실행할 명령이 없습니다.");
  }
  const normalized = command.trim();
  if (!REPO_ROOT) {
    return normalized;
  }
  if (normalized.startsWith("./") || normalized.startsWith("scripts/") || normalized.startsWith("npm ")) {
    return `cd ${JSON.stringify(REPO_ROOT)} && ${normalized}`;
  }
  return normalized;
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:get-status", async () => getDesktopStatus());

  ipcMain.handle("desktop:choose-directory", async () => {
    if (!mainWindow) {
      return null;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("desktop:prompt-accessibility", async () => {
    if (process.platform !== "darwin") {
      return false;
    }
    return systemPreferences.isTrustedAccessibilityClient(true);
  });

  ipcMain.handle("desktop:open-system-preferences", async (_event, pane) => {
    if (process.platform !== "darwin") {
      return false;
    }
    const targets = {
      accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    };
    const target = targets[pane] || targets.accessibility;
    await shell.openExternal(target);
    return true;
  });

  ipcMain.handle("desktop:open-chatgpt-login", async () => {
    if (!findExecutable("codex")) {
      await shell.openExternal(CODEX_INSTALL_URL);
      throw new Error(
        "AI 연결을 시작하려면 먼저 Codex 도구가 필요합니다.\n\n설치 안내 페이지를 열었습니다. 설치가 끝나면 다시 `AI 연결 시작`을 누르세요.",
      );
    }
    const baseCommand = REPO_ROOT ? `cd ${JSON.stringify(REPO_ROOT)} && codex login` : "codex login";
    return openCommandInTerminal(baseCommand);
  });

  ipcMain.handle("desktop:open-remote-access-app", async () => {
    const candidates = [
      "/Applications/Tailscale.app",
      path.join(app.getPath("home"), "Applications", "Tailscale.app"),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      const result = await shell.openPath(candidate);
      if (!result) {
        return true;
      }
    }
    await shell.openExternal(TAILSCALE_DOWNLOAD_URL);
    return true;
  });

  ipcMain.handle("desktop:run-terminal-command", async (_event, command) => {
    return openCommandInTerminal(normalizeTerminalCommand(command));
  });

  ipcMain.handle("desktop:prepare-terminal-command", async (_event, command) => {
    return normalizeTerminalCommand(command);
  });

  ipcMain.handle("desktop:install-background-agent", async () => {
    const context = getDaemonContext();
    if (!context) {
      throw new Error("현재 환경에서는 항상 켜짐 모드를 설치할 수 없습니다.");
    }
    await runCommand("/bin/zsh", [context.installScriptPath], REPO_ROOT, "background agent install");
    return getDaemonStatus();
  });

  ipcMain.handle("desktop:uninstall-background-agent", async () => {
    const context = getDaemonContext();
    if (!context) {
      throw new Error("현재 환경에서는 항상 켜짐 모드를 제거할 수 없습니다.");
    }
    await runCommand("/bin/zsh", [context.uninstallScriptPath], REPO_ROOT, "background agent uninstall");
    return getDaemonStatus();
  });
}

async function startApp() {
  registerIpcHandlers();

  if (REPO_ROOT && WEB_DIR && API_DIR) {
    apiProcess = await ensureService(`${API_URL}/health`, spawnApiServer, "API server");
    await ensureWebBuild();
    webProcess = await ensureService(WEB_URL, spawnWebServer, "web server");
  } else {
    const [apiHealthy, webHealthy] = await Promise.all([isHealthy(`${API_URL}/health`), isHealthy(WEB_URL)]);
    if (!apiHealthy || !webHealthy) {
      throw new Error(
        "Packaged desktop shell could not find a source workspace. Set ELEMATE_REPO_ROOT to your repo path or start the local API/Web services first.",
      );
    }
  }

  createWindow();
}

function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
}

app.whenReady().then(startApp).catch((error) => {
  dialog.showErrorBox("EleMate 시작 실패", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopChild(apiProcess);
  stopChild(webProcess);
});
