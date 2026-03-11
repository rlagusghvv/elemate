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
const PACKAGED_RUNTIME_ROOT = app.isPackaged ? path.join(process.resourcesPath, "runtime") : null;
const PACKAGED_MANIFEST_PATH = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "manifest.json") : null;
const PACKAGED_WEB_ARCHIVE_PATH = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "web-runtime.tar.gz") : null;
const PACKAGED_API_DIR = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "api") : null;
const PACKAGED_PYTHON_ARCHIVE_PATH = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "python-runtime.tar.gz") : null;
const PACKAGED_PYTHON_MANIFEST_PATH = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "python-runtime.json") : null;
const PACKAGED_SCRIPTS_DIR = PACKAGED_RUNTIME_ROOT ? path.join(PACKAGED_RUNTIME_ROOT, "scripts") : null;
const WEB_DIR = REPO_ROOT ? path.join(REPO_ROOT, "apps", "web") : null;
const API_DIR = REPO_ROOT ? path.join(REPO_ROOT, "apps", "api") : null;
const WEB_URL = envFirst("ELEMATE_DESKTOP_WEB_URL", "FORGE_DESKTOP_WEB_URL") || "http://127.0.0.1:3000";
const API_URL = envFirst("ELEMATE_DESKTOP_API_URL", "FORGE_DESKTOP_API_URL") || "http://127.0.0.1:8000";
const DAEMON_LABEL = "com.elemate.agent.daemon";
const PYTHON_DOWNLOAD_URL = "https://www.python.org/downloads/macos/";
const CODEX_INSTALL_URL = "https://developers.openai.com/codex/cli";
const TAILSCALE_DOWNLOAD_URL = "https://tailscale.com/download";

function getDesktopAppUrl() {
  try {
    return new URL("/app", WEB_URL).toString();
  } catch {
    return `${WEB_URL.replace(/\/$/, "")}/app`;
  }
}

let mainWindow = null;
let apiProcess = null;
let webProcess = null;
let authLoginProcess = null;
let startingApiPromise = null;
let runtimeState = {
  mode: app.isPackaged ? "bundled" : REPO_ROOT ? "source" : "external",
  support_dir: null,
  data_dir: null,
  logs_dir: null,
  auth: {
    status: "idle",
    message: null,
    browser_url: null,
    cli_available: Boolean(findExecutable("codex")),
    install_url: CODEX_INSTALL_URL,
  },
  web: {
    status: "idle",
    message: null,
    url: WEB_URL,
    bundled: Boolean(PACKAGED_WEB_ARCHIVE_PATH),
  },
  api: {
    status: app.isPackaged ? "idle" : REPO_ROOT ? "idle" : "external",
    message: null,
    url: API_URL,
    bundled: Boolean(PACKAGED_API_DIR),
    python_path: null,
    install_url: PYTHON_DOWNLOAD_URL,
    last_installed_at: null,
    bundled_python_available: Boolean(PACKAGED_PYTHON_ARCHIVE_PATH),
    bundled_python_version: null,
  },
};

function getPackagedPaths() {
  const root = path.join(app.getPath("userData"), "local-runtime");
  return {
    root,
    dataDir: path.join(root, "data"),
    logsDir: path.join(root, "logs"),
    authLogPath: path.join(root, "logs", "auth-login.log"),
    apiLogPath: path.join(root, "logs", "api-server.log"),
    webLogPath: path.join(root, "logs", "web-server.log"),
    artifactsDir: path.join(root, "artifacts"),
    venvDir: path.join(root, "python"),
    webDir: path.join(root, "web"),
    webArchivePath: PACKAGED_WEB_ARCHIVE_PATH,
    packagedManifestPath: PACKAGED_MANIFEST_PATH,
    webManifestPath: path.join(root, "web", ".elemate-web-runtime.json"),
    bootstrapPath: path.join(root, "bootstrap.json"),
    bootstrapLogPath: path.join(root, "logs", "api-bootstrap.log"),
    webServerScript: path.join(root, "web", "apps", "web", "server.js"),
    webCwd: path.join(root, "web", "apps", "web"),
    apiDir: PACKAGED_API_DIR,
    pythonDir: path.join(root, "python"),
    pythonArchivePath: PACKAGED_PYTHON_ARCHIVE_PATH,
    packagedPythonManifestPath: PACKAGED_PYTHON_MANIFEST_PATH,
    pythonManifestPath: path.join(root, "python", ".elemate-python-runtime.json"),
    scriptsDir: PACKAGED_SCRIPTS_DIR,
  };
}

function refreshRuntimePaths() {
  if (!app.isPackaged) {
    return;
  }
  const paths = getPackagedPaths();
  const bootstrap = readJsonFile(paths.bootstrapPath);
  const bundledPython = getPackagedPythonCommand(paths);
  const bundledPythonManifest = readJsonFile(paths.pythonManifestPath) || readJsonFile(paths.packagedPythonManifestPath);
  runtimeState = {
    ...runtimeState,
    support_dir: paths.root,
    data_dir: paths.dataDir,
    logs_dir: paths.logsDir,
    auth: {
      ...runtimeState.auth,
      cli_available: Boolean(findExecutable("codex")),
      install_url: CODEX_INSTALL_URL,
    },
    api: {
      ...runtimeState.api,
      python_path: bootstrap?.python_path || bundledPython || runtimeState.api.python_path,
      last_installed_at: bootstrap?.installed_at || runtimeState.api.last_installed_at,
      bundled_python_available: Boolean(
        bundledPython || (paths.pythonArchivePath && fs.existsSync(paths.pythonArchivePath)),
      ),
      bundled_python_version: bundledPythonManifest?.python_version || null,
    },
  };
}

function setRuntimeSection(section, patch) {
  runtimeState = {
    ...runtimeState,
    [section]: {
      ...runtimeState[section],
      ...patch,
    },
  };
}

function setAuthState(patch) {
  runtimeState = {
    ...runtimeState,
    auth: {
      ...runtimeState.auth,
      ...patch,
    },
  };
}

function ensurePackagedDirectories() {
  const paths = getPackagedPaths();
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.mkdirSync(paths.artifactsDir, { recursive: true });
  return paths;
}

function appendLog(filePath, message) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, message, "utf8");
}

function attachChildLogs(child, logFile) {
  if (!logFile) {
    return;
  }
  appendLog(logFile, `\n[${new Date().toISOString()}] Starting process pid=${child.pid ?? "unknown"}\n`);
  if (child.stdout) {
    child.stdout.on("data", (chunk) => appendLog(logFile, String(chunk)));
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => appendLog(logFile, String(chunk)));
  }
  child.once("exit", (code, signal) => {
    appendLog(
      logFile,
      `\n[${new Date().toISOString()}] Process exited code=${code ?? "null"} signal=${signal ?? "null"}\n`,
    );
  });
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getAuthLogPath() {
  if (app.isPackaged) {
    return ensurePackagedDirectories().authLogPath;
  }
  if (REPO_ROOT) {
    return path.join(REPO_ROOT, "logs", "auth-login.log");
  }
  return path.join(app.getPath("userData"), "auth-login.log");
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

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

function getSystemPythonCommand() {
  const candidates = [
    envFirst("ELEMATE_PYTHON", "FORGE_PYTHON"),
    "python3",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = candidate.includes("/") ? candidate : findExecutable(candidate);
    if (!resolved || !fs.existsSync(resolved)) {
      continue;
    }

    const version = spawnSync(resolved, ["-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"], { encoding: "utf8" });
    if (version.status !== 0) {
      continue;
    }
    const [major, minor] = (version.stdout || "").trim().split(".").map((value) => Number.parseInt(value, 10));
    if (major > 3 || (major === 3 && minor >= 11)) {
      return resolved;
    }
  }

  return null;
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

function packagedApiEnvironment(paths) {
  return {
    ...process.env,
    DATABASE_URL: `sqlite:///${path.join(paths.dataDir, "elemate.db")}`,
    ELEMATE_BASE_DIR: paths.root,
    ELEMATE_DATA_DIR: paths.dataDir,
    ELEMATE_ARTIFACTS_DIR: paths.artifactsDir,
    ELEMATE_LOGS_DIR: paths.logsDir,
    ELEMATE_SCRIPTS_DIR: paths.scriptsDir || "",
    ELEMATE_WORKSPACE_ROOT: app.getPath("home"),
    ELEMATE_PACKAGED_RUNTIME: "1",
  };
}

function getPackagedPythonCommand(paths) {
  if (!paths.pythonDir) {
    return null;
  }
  const candidates = [
    path.join(paths.pythonDir, "bin", "python3.11"),
    path.join(paths.pythonDir, "bin", "python3"),
    path.join(paths.pythonDir, "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function ensurePackagedPythonRuntime(paths) {
  const packagedManifest = readJsonFile(paths.packagedPythonManifestPath);
  const extractedManifest = readJsonFile(paths.pythonManifestPath);
  const extractedPython = getPackagedPythonCommand(paths);
  const archiveAvailable = Boolean(paths.pythonArchivePath && fs.existsSync(paths.pythonArchivePath));
  const manifestMatches =
    !packagedManifest ||
    (extractedManifest && extractedManifest.generated_at === packagedManifest.generated_at);

  if (extractedPython && manifestMatches) {
    return {
      python: extractedPython,
      manifest: extractedManifest || packagedManifest,
      extracted: false,
    };
  }

  if (!archiveAvailable) {
    return {
      python: extractedPython,
      manifest: extractedManifest || packagedManifest,
      extracted: false,
    };
  }

  fs.rmSync(paths.pythonDir, { recursive: true, force: true });
  fs.mkdirSync(paths.pythonDir, { recursive: true });
  appendLog(paths.bootstrapLogPath, `\n[${new Date().toISOString()}] Extracting bundled Python runtime\n`);
  await runCommand(
    "/usr/bin/tar",
    ["-xzf", paths.pythonArchivePath, "-C", paths.pythonDir],
    paths.root,
    "bundled python extract",
    {
      env: { ...process.env },
      logFile: paths.bootstrapLogPath,
    },
  );

  const python = getPackagedPythonCommand(paths);
  if (!python) {
    throw new Error("앱 안에 포함된 로컬 엔진을 풀었지만 Python 실행 파일을 찾지 못했습니다. 최신 설치 파일로 다시 설치하세요.");
  }

  return {
    python,
    manifest: readJsonFile(paths.pythonManifestPath) || packagedManifest,
    extracted: true,
  };
}

async function ensurePackagedWebRuntime(paths) {
  const packagedManifest = readJsonFile(paths.packagedManifestPath);
  const extractedManifest = readJsonFile(paths.webManifestPath);
  const extractedReady = fs.existsSync(paths.webServerScript);
  const archiveAvailable = Boolean(paths.webArchivePath && fs.existsSync(paths.webArchivePath));
  const manifestMatches =
    !packagedManifest ||
    (extractedManifest && extractedManifest.generated_at === packagedManifest.generated_at);

  if (extractedReady && manifestMatches) {
    return paths.webServerScript;
  }

  if (!archiveAvailable) {
    if (extractedReady) {
      return paths.webServerScript;
    }
    throw new Error("패키지 안에 EleMate 웹 번들이 없습니다. 최신 설치 파일로 다시 설치하세요.");
  }

  fs.rmSync(paths.webDir, { recursive: true, force: true });
  fs.mkdirSync(paths.webDir, { recursive: true });
  appendLog(paths.webLogPath, `\n[${new Date().toISOString()}] Extracting bundled web runtime\n`);
  await runCommand(
    "/usr/bin/tar",
    ["-xzf", paths.webArchivePath, "-C", paths.webDir],
    paths.root,
    "bundled web extract",
    {
      env: { ...process.env },
      logFile: paths.webLogPath,
    },
  );

  if (!fs.existsSync(paths.webServerScript)) {
    throw new Error("EleMate 웹 번들을 풀었지만 server.js를 찾지 못했습니다. 최신 설치 파일로 다시 설치하세요.");
  }

  writeJsonFile(paths.webManifestPath, {
    generated_at: packagedManifest?.generated_at || new Date().toISOString(),
  });

  return paths.webServerScript;
}

function getFallbackBundledApiPython(paths) {
  return path.join(paths.venvDir, "bin", "python");
}

function getBundledApiPython(paths) {
  return getPackagedPythonCommand(paths) || getFallbackBundledApiPython(paths);
}

async function installBundledApiRuntime(forceInstall = false) {
  const paths = ensurePackagedDirectories();
  if (!paths.apiDir || !fs.existsSync(path.join(paths.apiDir, "pyproject.toml"))) {
    throw new Error("패키지 안에 API 런타임이 들어 있지 않습니다. 최신 EleMate 설치 파일로 다시 설치하세요.");
  }

  const desiredVersion = app.getVersion();
  const { python: bundledPython, manifest: bundledPythonManifest, extracted: bundledPythonExtracted } =
    await ensurePackagedPythonRuntime(paths);
  if (bundledPython) {
    setRuntimeSection("api", {
      status: bundledPythonExtracted ? "installing" : "starting",
      message: bundledPythonExtracted
        ? "앱 안에 포함된 로컬 엔진을 이 Mac에 준비하고 있습니다."
        : "앱 안에 포함된 로컬 엔진을 시작하고 있습니다.",
      python_path: bundledPython,
      last_installed_at: bundledPythonManifest?.generated_at || runtimeState.api.last_installed_at,
      bundled_python_available: true,
      bundled_python_version: bundledPythonManifest?.python_version || runtimeState.api.bundled_python_version,
    });
    writeJsonFile(paths.bootstrapPath, {
      app_version: desiredVersion,
      python_path: bundledPython,
      installed_at: new Date().toISOString(),
      runtime_generated_at: bundledPythonManifest?.generated_at || null,
      bundled_python: true,
    });
    return bundledPython;
  }

  const python = getSystemPythonCommand();
  if (!python) {
    setRuntimeSection("api", {
      status: "needs-python",
      message: "이 Mac에는 EleMate 로컬 엔진을 시작할 Python 3.11 이상이 없습니다. 설치 페이지를 열었습니다.",
      python_path: null,
    });
    await shell.openExternal(PYTHON_DOWNLOAD_URL);
    throw new Error("Python 3.11 이상이 필요합니다. 설치가 끝나면 `앱 준비 시작`을 다시 누르세요.");
  }

  const previous = readJsonFile(paths.bootstrapPath);
  const venvPython = getFallbackBundledApiPython(paths);
  const needsInstall =
    forceInstall ||
    !fs.existsSync(venvPython) ||
    !previous ||
    previous.app_version !== desiredVersion ||
    previous.python_path !== python;

  setRuntimeSection("api", {
    status: needsInstall ? "installing" : "starting",
    message: needsInstall ? "이 장비에 EleMate 로컬 엔진을 준비하고 있습니다." : "로컬 엔진을 시작하고 있습니다.",
    python_path: python,
  });

  if (!needsInstall) {
    return venvPython;
  }

  appendLog(paths.bootstrapLogPath, `\n[${new Date().toISOString()}] Preparing EleMate API runtime\n`);
  await runCommand(python, ["-m", "venv", paths.venvDir], paths.root, "local runtime bootstrap", {
    env: { ...process.env },
    logFile: paths.bootstrapLogPath,
  });

  await runCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], paths.root, "python tooling install", {
    env: { ...process.env },
    logFile: paths.bootstrapLogPath,
  });

  await runCommand(venvPython, ["-m", "pip", "install", paths.apiDir], paths.root, "EleMate API install", {
    env: { ...process.env },
    logFile: paths.bootstrapLogPath,
  });

  writeJsonFile(paths.bootstrapPath, {
    app_version: desiredVersion,
    python_path: python,
    installed_at: new Date().toISOString(),
  });

  const installed = readJsonFile(paths.bootstrapPath);
  setRuntimeSection("api", {
    python_path: python,
    last_installed_at: installed?.installed_at || null,
  });
  return venvPython;
}

function spawnBundledApiServer() {
  const paths = ensurePackagedDirectories();
  const python = getBundledApiPython(paths);
  if (!fs.existsSync(python)) {
    throw new Error("로컬 엔진이 아직 준비되지 않았습니다. 먼저 런타임 설치를 완료하세요.");
  }
  const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: paths.apiDir,
    stdio: "pipe",
    env: packagedApiEnvironment(paths),
  });
  attachChildLogs(child, paths.apiLogPath);
  return child;
}

async function ensureBundledApiService(options = {}) {
  const { forceInstall = false } = options;
  if (await isHealthy(`${API_URL}/health`)) {
    setRuntimeSection("api", { status: "ready", message: "로컬 엔진이 준비되었습니다." });
    return null;
  }
  if (startingApiPromise) {
    return startingApiPromise;
  }

  startingApiPromise = (async () => {
    try {
      await installBundledApiRuntime(forceInstall);
      setRuntimeSection("api", { status: "starting", message: "로컬 엔진을 시작하고 있습니다." });
      apiProcess = await ensureService(`${API_URL}/health`, spawnBundledApiServer, "API server");
      setRuntimeSection("api", { status: "ready", message: "로컬 엔진이 준비되었습니다." });
      return apiProcess;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (runtimeState.api.status !== "needs-python") {
        setRuntimeSection("api", { status: "error", message });
      }
      throw error;
    } finally {
      startingApiPromise = null;
    }
  })();

  return startingApiPromise;
}

async function ensureWebBuild() {
  if (!WEB_DIR) {
    return;
  }
  const buildIdPath = path.join(WEB_DIR, ".next", "BUILD_ID");
  if (fs.existsSync(buildIdPath)) {
    return;
  }
  throw new Error("EleMate 웹 번들이 없습니다. 개발 환경에서는 먼저 `npm run build:web` 를 실행하세요.");
}

function spawnWebServer() {
  if (!WEB_DIR) {
    throw new Error("Web workspace is unavailable in packaged mode. Set ELEMATE_REPO_ROOT or start the web app separately.");
  }
  const standaloneServer = path.join(WEB_DIR, ".next", "standalone", "apps", "web", "server.js");
  if (!fs.existsSync(standaloneServer)) {
    throw new Error("EleMate 웹 번들이 없습니다. 개발 환경에서는 먼저 `npm run build:web` 를 실행하세요.");
  }

  return spawn(process.execPath, [standaloneServer], {
    cwd: path.join(WEB_DIR, ".next", "standalone", "apps", "web"),
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
}

function spawnBundledWebServer() {
  const paths = ensurePackagedDirectories();
  if (!fs.existsSync(paths.webServerScript)) {
    throw new Error("패키지 안에 EleMate 웹 번들이 없습니다. 최신 설치 파일로 다시 설치하세요.");
  }

  const child = spawn(process.execPath, [paths.webServerScript], {
    cwd: paths.webCwd,
    stdio: "pipe",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      ELEMATE_PUBLIC_SITE_MODE: "",
    },
  });
  attachChildLogs(child, paths.webLogPath);
  return child;
}

async function ensureBundledWebService() {
  setRuntimeSection("web", { status: "starting", message: "로컬 화면을 시작하고 있습니다." });
  try {
    const paths = ensurePackagedDirectories();
    await ensurePackagedWebRuntime(paths);
    webProcess = await ensureService(WEB_URL, spawnBundledWebServer, "web server");
    setRuntimeSection("web", { status: "ready", message: "로컬 화면이 준비되었습니다." });
    return webProcess;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setRuntimeSection("web", { status: "error", message });
    throw error;
  }
}

function runCommand(command, args, cwd, label, options = {}) {
  return new Promise((resolve, reject) => {
    const env = options.env ? { ...process.env, ...options.env } : { ...process.env };
    const stdio = options.stdio || (options.logFile ? "pipe" : "inherit");
    const child = spawn(command, args, {
      cwd,
      stdio,
      env,
    });

    if (options.logFile && child.stdout && child.stderr) {
      child.stdout.on("data", (chunk) => appendLog(options.logFile, String(chunk)));
      child.stderr.on("data", (chunk) => appendLog(options.logFile, String(chunk)));
    }

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
    if (command === "python3" || command.endsWith("/python")) {
      return new Error(`EleMate ${label}를 계속하려면 Python 3.11 이상이 필요합니다.\n\n설치 페이지:\n${PYTHON_DOWNLOAD_URL}`);
    }
  }
  return error;
}

function parseAuthUrl(line) {
  const match = line.match(/https:\/\/\S+/);
  return match ? match[0] : null;
}

function startBackgroundChatLogin() {
  const codexPath = findExecutable("codex");
  if (!codexPath) {
    setAuthState({
      status: "error",
      message: "AI 연결 구성요소가 아직 없습니다. 설치 안내 페이지를 열었습니다.",
      browser_url: null,
      cli_available: false,
    });
    void shell.openExternal(CODEX_INSTALL_URL);
    throw new Error(
      "AI 연결을 시작하려면 먼저 EleMate AI 연결 도구가 필요합니다.\n\n설치 안내 페이지를 열었습니다. 설치가 끝나면 다시 `AI 연결 시작`을 누르세요.",
    );
  }

  if (authLoginProcess && authLoginProcess.exitCode === null) {
    if (runtimeState.auth.browser_url) {
      void shell.openExternal(runtimeState.auth.browser_url);
    }
    return true;
  }

  setAuthState({
    status: "starting",
    message: "브라우저용 AI 연결을 준비하고 있습니다.",
    browser_url: null,
    cli_available: true,
  });

  const child = spawn(codexPath, ["login"], {
    cwd: REPO_ROOT || app.getPath("home"),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  authLoginProcess = child;
  attachChildLogs(child, getAuthLogPath());

  const handleChunk = (chunk) => {
    const text = String(chunk);
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const authUrl = parseAuthUrl(line);
      if (authUrl) {
        setAuthState({
          status: "waiting_browser",
          message: "브라우저가 열렸습니다. 로그인과 권한 확인을 마치면 EleMate로 돌아오세요.",
          browser_url: authUrl,
        });
        void shell.openExternal(authUrl);
        continue;
      }
      if (line.includes("Starting local login server")) {
        setAuthState({
          status: "waiting_browser",
          message: "브라우저에서 ChatGPT 로그인을 마무리해 주세요.",
        });
        continue;
      }
      if (line.includes("If your browser did not open")) {
        setAuthState({
          status: "waiting_browser",
          message: "브라우저가 자동으로 열리지 않으면 EleMate가 표시한 로그인 링크를 다시 엽니다.",
        });
        continue;
      }
      if (line.includes("Logged in using ChatGPT")) {
        setAuthState({
          status: "ready",
          message: "AI 연결이 완료되었습니다.",
        });
      }
    }
  };

  child.stdout?.on("data", handleChunk);
  child.stderr?.on("data", handleChunk);
  child.once("error", (error) => {
    authLoginProcess = null;
    setAuthState({
      status: "error",
      message: error instanceof Error ? error.message : "AI 연결을 시작하지 못했습니다.",
      browser_url: runtimeState.auth.browser_url,
    });
  });
  child.once("exit", (code) => {
    authLoginProcess = null;
    const authConfigured = readJsonFile(path.join(app.getPath("home"), ".codex", "auth.json"));
    const hasTokens = Boolean(authConfigured?.tokens?.access_token && authConfigured?.tokens?.refresh_token);
    if (code === 0 || hasTokens) {
      setAuthState({
        status: "ready",
        message: "AI 연결이 완료되었습니다.",
      });
      return;
    }
    setAuthState({
      status: "error",
      message: "브라우저 로그인 확인 전 연결이 종료되었습니다. 다시 시도해 주세요.",
    });
  });

  return true;
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

  mainWindow.loadURL(getDesktopAppUrl());
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
  refreshRuntimePaths();
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
    runtime: runtimeState,
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
      summary: "앱을 계속 켜 두면 이 장비는 바로 사용할 수 있습니다. 항상 켜짐 자동 시작은 개발자 설치 모드에서만 지원합니다.",
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

  ipcMain.handle("desktop:install-local-runtime", async () => {
    await ensureBundledApiService({ forceInstall: true });
    return getDesktopStatus();
  });

  ipcMain.handle("desktop:restart-local-services", async () => {
    stopChild(apiProcess);
    stopChild(webProcess);
    apiProcess = null;
    webProcess = null;

    if (app.isPackaged) {
      await ensureBundledWebService();
      await ensureBundledApiService({ forceInstall: false });
    } else if (REPO_ROOT && WEB_DIR && API_DIR) {
      apiProcess = await ensureService(`${API_URL}/health`, spawnApiServer, "API server");
      await ensureWebBuild();
      webProcess = await ensureService(WEB_URL, spawnWebServer, "web server");
    }

    return getDesktopStatus();
  });

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
    return startBackgroundChatLogin();
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

async function startSourceApp() {
  apiProcess = await ensureService(`${API_URL}/health`, spawnApiServer, "API server");
  setRuntimeSection("api", { status: "ready", message: "소스 API 런타임이 준비되었습니다.", python_path: getPythonCommand() });
  await ensureWebBuild();
  webProcess = await ensureService(WEB_URL, spawnWebServer, "web server");
  setRuntimeSection("web", { status: "ready", message: "소스 웹 런타임이 준비되었습니다." });
  createWindow();
}

async function startPackagedApp() {
  refreshRuntimePaths();
  await ensureBundledWebService();
  createWindow();
  void ensureBundledApiService({ forceInstall: false }).catch(() => {});
}

async function startApp() {
  registerIpcHandlers();

  if (app.isPackaged) {
    await startPackagedApp();
    return;
  }

  if (REPO_ROOT && WEB_DIR && API_DIR) {
    await startSourceApp();
    return;
  }

  const [apiHealthy, webHealthy] = await Promise.all([isHealthy(`${API_URL}/health`), isHealthy(WEB_URL)]);
  if (!apiHealthy || !webHealthy) {
    throw new Error(
      "Packaged desktop shell could not find a source workspace. Set ELEMATE_REPO_ROOT to your repo path or start the local API/Web services first.",
    );
  }

  setRuntimeSection("api", { status: "ready", message: "외부 API 런타임에 연결되었습니다." });
  setRuntimeSection("web", { status: "ready", message: "외부 웹 런타임에 연결되었습니다." });
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
