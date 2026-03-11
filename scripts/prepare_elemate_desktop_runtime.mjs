import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const webDir = path.join(repoRoot, "apps", "web");
const apiDir = path.join(repoRoot, "apps", "api");
const desktopRuntimeDir = path.join(repoRoot, "apps", "desktop", "runtime");

const webStandaloneDir = path.join(webDir, ".next", "standalone");
const webStaticDir = path.join(webDir, ".next", "static");
const webPublicDir = path.join(webDir, "public");

const runtimeWebDir = path.join(desktopRuntimeDir, "web");
const runtimeWebArchive = path.join(desktopRuntimeDir, "web-runtime.tar.gz");
const runtimeApiDir = path.join(desktopRuntimeDir, "api");
const runtimePythonDir = path.join(desktopRuntimeDir, "python");
const runtimePythonArchive = path.join(desktopRuntimeDir, "python-runtime.tar.gz");
const runtimePythonManifest = path.join(desktopRuntimeDir, "python-runtime.json");
const runtimeScriptsDir = path.join(desktopRuntimeDir, "scripts");

function assertExists(target, message) {
  if (!fs.existsSync(target)) {
    throw new Error(message);
  }
}

function shouldCopyEntry(entryPath) {
  return !entryPath.includes("__pycache__") && !entryPath.endsWith(".pyc");
}

function copyInto(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true, filter: shouldCopyEntry });
}

function cleanRuntimeDir() {
  fs.rmSync(desktopRuntimeDir, { recursive: true, force: true });
  fs.mkdirSync(desktopRuntimeDir, { recursive: true });
}

function copyWebRuntime() {
  assertExists(
    webStandaloneDir,
    "apps/web/.next/standalone 이 없습니다. 먼저 `npm --workspace apps/web run build` 를 실행하세요.",
  );
  assertExists(
    webStaticDir,
    "apps/web/.next/static 이 없습니다. 먼저 `npm --workspace apps/web run build` 를 실행하세요.",
  );

  copyInto(webStandaloneDir, runtimeWebDir);
  copyInto(webStaticDir, path.join(runtimeWebDir, "apps", "web", ".next", "static"));

  if (fs.existsSync(webPublicDir)) {
    copyInto(webPublicDir, path.join(runtimeWebDir, "apps", "web", "public"));
  }
}

function archiveWebRuntime() {
  const result = spawnSync("/usr/bin/tar", ["-czf", runtimeWebArchive, "-C", runtimeWebDir, "."], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`웹 런타임 아카이브 생성에 실패했습니다 (exit ${result.status ?? "unknown"}).`);
  }
}

function copyApiRuntime() {
  fs.mkdirSync(runtimeApiDir, { recursive: true });
  copyInto(path.join(apiDir, "app"), path.join(runtimeApiDir, "app"));

  for (const fileName of ["pyproject.toml", "README.md", ".env.example"]) {
    const source = path.join(apiDir, fileName);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(runtimeApiDir, fileName));
    }
  }
}

function copyScripts() {
  fs.mkdirSync(runtimeScriptsDir, { recursive: true });
  const scriptNames = ["setup_tailscale_serve.sh"];
  for (const scriptName of scriptNames) {
    const source = path.join(repoRoot, "scripts", scriptName);
    assertExists(source, `필수 스크립트가 없습니다: ${source}`);
    const destination = path.join(runtimeScriptsDir, scriptName);
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o755);
  }
}

cleanRuntimeDir();
copyWebRuntime();
archiveWebRuntime();
copyApiRuntime();
copyScripts();

const manifest = {
  generated_at: new Date().toISOString(),
  web_server: "apps/web/server.js",
  web_archive: fs.existsSync(runtimeWebArchive) ? "web-runtime.tar.gz" : null,
  api_dir: "api",
  python_dir: fs.existsSync(runtimePythonDir) ? "python" : null,
  python_archive: fs.existsSync(runtimePythonArchive) ? "python-runtime.tar.gz" : null,
  python_manifest: fs.existsSync(runtimePythonManifest) ? "python-runtime.json" : null,
  scripts_dir: "scripts",
};

fs.writeFileSync(path.join(desktopRuntimeDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Prepared EleMate desktop runtime at ${desktopRuntimeDir}`);
