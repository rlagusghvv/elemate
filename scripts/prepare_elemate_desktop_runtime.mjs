import fs from "node:fs";
import path from "node:path";
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
const runtimeApiDir = path.join(desktopRuntimeDir, "api");
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
copyApiRuntime();
copyScripts();

const manifest = {
  generated_at: new Date().toISOString(),
  web_server: "apps/web/server.js",
  api_dir: "api",
  scripts_dir: "scripts",
};

fs.writeFileSync(path.join(desktopRuntimeDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Prepared EleMate desktop runtime at ${desktopRuntimeDir}`);
