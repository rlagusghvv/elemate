const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runOrThrow(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status === 0) {
    return result.stdout || "";
  }
  const stderr = result.stderr || result.stdout || "";
  throw new Error(`${label} failed: ${stderr.trim()}`);
}

function findDeveloperIdIdentity() {
  const keychainPath = process.env.ELEMATE_CODESIGN_KEYCHAIN;
  const args = ["/usr/bin/security", "find-identity", "-v", "-p", "codesigning"];
  if (keychainPath) {
    args.push(keychainPath);
  }
  const output = runOrThrow(args[0], args.slice(1), "find code signing identity");
  const line = output
    .split("\n")
    .find((entry) => entry.includes("Developer ID Application:"));
  if (!line) {
    return null;
  }
  const match = line.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

function looksLikeMachOCandidate(target) {
  const normalized = target.replace(/\\/g, "/");
  return (
    normalized.includes("/bin/") ||
    normalized.endsWith(".dylib") ||
    normalized.endsWith(".so")
  );
}

function isMachOFile(target) {
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    return false;
  }
  if (!looksLikeMachOCandidate(target)) {
    return false;
  }
  const description = runOrThrow("/usr/bin/file", ["-b", target], `inspect ${target}`);
  return description.includes("Mach-O");
}

function walkFiles(root, visitor) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, visitor);
      continue;
    }
    visitor(fullPath);
  }
}

function collectMachOFiles(root) {
  const targets = [];
  walkFiles(root, (filePath) => {
    if (isMachOFile(filePath)) {
      targets.push(filePath);
    }
  });
  return targets.sort((left, right) => right.length - left.length);
}

module.exports = async function signBundledPythonArchive(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (process.env.CI !== "true" && String(process.env.ELEMATE_SIGN_BUNDLED_PYTHON || "false").toLowerCase() !== "true") {
    console.log("Skipping bundled Python archive signing outside CI.");
    return;
  }

  const identity = findDeveloperIdIdentity();
  if (!identity) {
    console.log("Skipping bundled Python archive signing: Developer ID identity not available.");
    return;
  }
  const keychainPath = process.env.ELEMATE_CODESIGN_KEYCHAIN;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const archivePath = path.join(appPath, "Contents", "Resources", "runtime", "python-runtime.tar.gz");
  if (!fs.existsSync(archivePath)) {
    console.log("Skipping bundled Python archive signing: archive not found.");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "elemate-python-archive-"));
  const extractedDir = path.join(tempRoot, "python-runtime");
  fs.mkdirSync(extractedDir, { recursive: true });

  try {
    console.log(`Signing bundled Python archive with ${identity}`);
    runOrThrow("/usr/bin/tar", ["-xzf", archivePath, "-C", extractedDir], "extract bundled Python archive");

    const targets = collectMachOFiles(extractedDir);
    for (const target of targets) {
      const args = ["--force", "--sign", identity];
      if (keychainPath) {
        args.push("--keychain", keychainPath);
      }
      args.push("--timestamp", "--options", "runtime", target);
      runOrThrow(
        "/usr/bin/codesign",
        args,
        `codesign ${path.relative(extractedDir, target)}`,
      );
    }

    fs.rmSync(archivePath, { force: true });
    runOrThrow("/usr/bin/tar", ["-czf", archivePath, "-C", extractedDir, "."], "repack bundled Python archive");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};
