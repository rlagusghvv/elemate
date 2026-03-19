import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(repoRoot, "apps", "desktop", "runtime");
const pythonRoot = path.join(runtimeRoot, "python");
const pythonArchivePath = path.join(runtimeRoot, "python-runtime.tar.gz");
const pythonBundleManifestPath = path.join(runtimeRoot, "python-runtime.json");
const apiDir = path.join(repoRoot, "apps", "api");
const cacheDir = path.join(repoRoot, ".cache", "python-runtime");

function envFirst(...names) {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return null;
}

function resolveArch(value, explicitPlatform) {
  const platform = (explicitPlatform || process.env.ELEMATE_DESKTOP_PLATFORM || os.platform()).toLowerCase();
  const normalized = (value || os.arch()).toLowerCase();
  if (normalized === "arm64" || normalized === "aarch64") {
    if (platform === "win32") {
      return {
        cli: "arm64",
        pythonBuildStandalone: "aarch64-pc-windows-msvc",
        platform,
      };
    }
    return {
      cli: "arm64",
      pythonBuildStandalone: "aarch64-apple-darwin",
      platform,
    };
  }
  if (normalized === "x64" || normalized === "x86_64") {
    if (platform === "win32") {
      return {
        cli: "x64",
        pythonBuildStandalone: "x86_64-pc-windows-msvc",
        platform,
      };
    }
    return {
      cli: "x64",
      pythonBuildStandalone: "x86_64-apple-darwin",
      platform,
    };
  }
  throw new Error(`Unsupported desktop build arch: ${normalized}`);
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "EleMate build pipeline",
      accept: "application/octet-stream",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const file = fs.createWriteStream(destination);
  const stream = Readable.fromWeb(response.body);
  await new Promise((resolve, reject) => {
    stream.pipe(file);
    stream.on("error", reject);
    file.on("finish", resolve);
    file.on("error", reject);
  });
}

function runOrThrow(command, args, cwd, label, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function moveDirectoryContents(sourceDir, destinationDir) {
  for (const entry of fs.readdirSync(sourceDir)) {
    fs.renameSync(path.join(sourceDir, entry), path.join(destinationDir, entry));
  }
}

function resolveBundledPythonExecutable(root) {
  const candidates = [
    path.join(root, "bin", "python3.11"),
    path.join(root, "bin", "python3"),
    path.join(root, "bin", "python"),
    path.join(root, "python.exe"),
    path.join(root, "python", "python.exe"),
    path.join(root, "install", "python.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveBundledPipCommand(root) {
  const candidates = [
    path.join(root, "bin", "pip3.11"),
    path.join(root, "bin", "pip3"),
    path.join(root, "bin", "pip"),
    path.join(root, "Scripts", "pip.exe"),
    path.join(root, "python", "Scripts", "pip.exe"),
    path.join(root, "install", "Scripts", "pip.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function normalizeBundledPythonLayout(root) {
  const nestedRoots = [path.join(root, "python"), path.join(root, "install")];
  for (const nestedRoot of nestedRoots) {
    if (!fs.existsSync(nestedRoot) || !fs.statSync(nestedRoot).isDirectory()) {
      continue;
    }
    if (!resolveBundledPythonExecutable(root) && resolveBundledPythonExecutable(nestedRoot)) {
      moveDirectoryContents(nestedRoot, root);
      fs.rmSync(nestedRoot, { recursive: true, force: true });
      return;
    }
  }
}

function walkFiles(root, visitor) {
  if (!fs.existsSync(root)) {
    return;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      visitor(fullPath, true);
      walkFiles(fullPath, visitor);
      continue;
    }
    visitor(fullPath, false);
  }
}

function pruneBundledPython(root) {
  const sitePackagesDir = path.join(root, "lib", "python3.11", "site-packages");
  if (fs.existsSync(sitePackagesDir)) {
    for (const entry of fs.readdirSync(sitePackagesDir)) {
      if (entry === "pip" || entry === "setuptools" || entry === "wheel" || /^pip-.*\.dist-info$/.test(entry) || /^setuptools-.*\.dist-info$/.test(entry) || /^wheel-.*\.dist-info$/.test(entry)) {
        fs.rmSync(path.join(sitePackagesDir, entry), { recursive: true, force: true });
      }
    }
  }

  const removablePaths = [
    path.join(root, "bin", "2to3-3.11"),
    path.join(root, "bin", "idle3.11"),
    path.join(root, "bin", "pydoc3.11"),
    path.join(root, "lib", "libtcl8.6.dylib"),
    path.join(root, "lib", "libtk8.6.dylib"),
    path.join(root, "lib", "thread2.8.9"),
    path.join(root, "lib", "python3.11", "idlelib"),
    path.join(root, "lib", "python3.11", "lib2to3"),
    path.join(root, "lib", "python3.11", "test"),
    path.join(root, "lib", "python3.11", "tkinter"),
    path.join(root, "lib", "python3.11", "turtledemo"),
    path.join(root, "lib", "python3.11", "lib-dynload", "_tkinter.cpython-311-darwin.so"),
    path.join(root, "lib", "python3.11", "site-packages", "greenlet", "tests"),
  ];
  for (const target of removablePaths) {
    fs.rmSync(target, { recursive: true, force: true });
  }

  walkFiles(root, (target, isDirectory) => {
    const baseName = path.basename(target);
    if (isDirectory && (target.includes("__pycache__") || baseName === "tests" || baseName === "test")) {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    }
    if (!isDirectory && target.endsWith(".pyc")) {
      fs.rmSync(target, { force: true });
    }
  });
}

function createBundledPythonArchive(sourceDir, archivePath) {
  fs.rmSync(archivePath, { force: true });
  runOrThrow(
    "tar",
    ["-czf", archivePath, "-C", sourceDir, "."],
    repoRoot,
    "Archive bundled Python runtime",
  );
}

const requestedPlatform = process.argv[3] || null;
const arch = resolveArch(process.argv[2] || envFirst("ELEMATE_DESKTOP_ARCH", "npm_config_arch"), requestedPlatform);
const tag = envFirst("ELEMATE_PYTHON_STANDALONE_TAG") || "20251202";
const version = envFirst("ELEMATE_PYTHON_STANDALONE_VERSION") || "3.11.14";
const asset = `cpython-${version}+${tag}-${arch.pythonBuildStandalone}-install_only_stripped.tar.gz`;
const encodedAsset = asset.replace(/\+/g, "%2B");
const downloadUrl =
  envFirst("ELEMATE_PYTHON_STANDALONE_URL") ||
  `https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/${encodedAsset}`;
const archivePath = path.join(cacheDir, `${arch.cli}-${asset}`);
await fs.promises.mkdir(runtimeRoot, { recursive: true });
await fs.promises.mkdir(cacheDir, { recursive: true });

if (!fs.existsSync(archivePath)) {
  console.log(`Downloading standalone Python: ${downloadUrl}`);
  await downloadFile(downloadUrl, archivePath);
}

fs.rmSync(pythonRoot, { recursive: true, force: true });
fs.mkdirSync(pythonRoot, { recursive: true });

runOrThrow(
  "tar",
  ["-xzf", archivePath, "-C", pythonRoot, "--strip-components=1"],
  repoRoot,
  "Extract standalone Python runtime",
);

normalizeBundledPythonLayout(pythonRoot);

const bundledPython = resolveBundledPythonExecutable(pythonRoot);
if (!bundledPython) {
  throw new Error(`Bundled Python executable is missing in: ${pythonRoot}`);
}

spawnSync(bundledPython, ["-m", "ensurepip", "--upgrade"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});
runOrThrow(bundledPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], repoRoot, "Upgrade bundled pip tooling");
runOrThrow(bundledPython, ["-m", "pip", "install", apiDir], repoRoot, "Install EleMate API into bundled Python");
if (arch.platform === "darwin") {
  pruneBundledPython(pythonRoot);
}

const manifest = {
  generated_at: new Date().toISOString(),
  arch: arch.cli,
  platform: arch.platform,
  python_version: version,
  source_tag: tag,
  asset,
  download_url: downloadUrl,
  executable: arch.platform === "win32" ? "python.exe" : "bin/python3.11",
};

fs.writeFileSync(path.join(pythonRoot, ".elemate-python-runtime.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
createBundledPythonArchive(pythonRoot, pythonArchivePath);
fs.writeFileSync(
  pythonBundleManifestPath,
  `${JSON.stringify({ ...manifest, archive: path.basename(pythonArchivePath) }, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared bundled Python runtime at ${pythonRoot}`);
console.log(`Archived bundled Python runtime at ${pythonArchivePath}`);
