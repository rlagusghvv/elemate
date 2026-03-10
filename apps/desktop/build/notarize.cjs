const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
    label,
  };
}

function runOrThrow(command, args, label) {
  const result = runCommand(command, args, label);
  if (result.ok) {
    return result.stdout;
  }
  const detail = result.stderr || result.stdout || result.error?.message || "unknown error";
  throw new Error(`${label} failed: ${detail.trim()}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${String(error)}`);
  }
}

function isRetryableNetworkError(output) {
  return /NSURLErrorDomain|The Internet connection appears to be offline|timed out|network connection was lost|No network route/i.test(
    output,
  );
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function credentialArgs() {
  const profile = process.env.ELEMATE_NOTARY_PROFILE;
  const keychain = process.env.ELEMATE_NOTARY_KEYCHAIN;
  if (profile) {
    const args = ["--keychain-profile", profile];
    if (keychain) {
      args.push("--keychain", keychain);
    }
    return args;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (appleId && appleIdPassword && teamId) {
    return ["--apple-id", appleId, "--password", appleIdPassword, "--team-id", teamId];
  }

  return null;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function summarizeIssues(logJson) {
  const issues = Array.isArray(logJson?.issues) ? logJson.issues : [];
  if (!issues.length) {
    return "No notarization issues were returned.";
  }
  return issues
    .slice(0, 10)
    .map((issue) => `${issue.path || "<unknown>"}: ${issue.message || "<no message>"}`)
    .join("\n");
}

module.exports = async function notarizeApp(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (String(process.env.ELEMATE_NOTARIZE || "true").toLowerCase() === "false") {
    console.log("Skipping notarization: ELEMATE_NOTARIZE=false");
    return;
  }

  const creds = credentialArgs();
  if (!creds) {
    console.log("Skipping notarization: no Apple credentials or keychain profile configured.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const appOutName = path.basename(context.appOutDir);
  const distDir = path.dirname(context.appOutDir);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "elemate-notary-"));
  const zipPath = path.join(tmpRoot, `${appName}.zip`);
  const submissionPath = path.join(distDir, `notary-${appOutName}-submission.json`);
  const statusPath = path.join(distDir, `notary-${appOutName}-status.json`);
  const logPath = path.join(distDir, `notary-${appOutName}-log.json`);
  const pollIntervalMs = Number.parseInt(process.env.ELEMATE_NOTARY_POLL_INTERVAL_MS || "30000", 10);
  const timeoutMs = Number.parseInt(process.env.ELEMATE_NOTARY_TIMEOUT_MS || `${90 * 60 * 1000}`, 10);

  try {
    console.log(`Preparing notarization archive for ${appPath}`);
    runOrThrow(
      "/usr/bin/ditto",
      ["-c", "-k", "--keepParent", "--sequesterRsrc", appPath, zipPath],
      "Create notarization zip",
    );

    const submitArgs = [
      "notarytool",
      "submit",
      zipPath,
      ...creds,
      "--output-format",
      "json",
      "--no-wait",
    ];
    const submitResult = runCommand("/usr/bin/xcrun", submitArgs, "Submit notarization");
    if (!submitResult.ok) {
      const detail = submitResult.stderr || submitResult.stdout || "unknown error";
      throw new Error(`Submit notarization failed: ${detail.trim()}`);
    }

    const submission = parseJson(submitResult.stdout, "notarytool submit");
    writeJson(submissionPath, submission);

    const submissionId = submission.id || submission.submissionId;
    if (!submissionId) {
      throw new Error("notarytool submit did not return a submission id.");
    }

    console.log(`Submitted notarization request: ${submissionId}`);

    const deadline = Date.now() + timeoutMs;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      const infoResult = runCommand(
        "/usr/bin/xcrun",
        ["notarytool", "info", submissionId, ...creds, "--output-format", "json"],
        "Fetch notarization status",
      );

      if (!infoResult.ok) {
        const detail = `${infoResult.stderr}\n${infoResult.stdout}`.trim();
        if (isRetryableNetworkError(detail)) {
          console.log(`Notarization status retry ${attempts}: transient network error`);
          await sleep(pollIntervalMs);
          continue;
        }
        throw new Error(`Fetch notarization status failed: ${detail || "unknown error"}`);
      }

      const statusPayload = parseJson(infoResult.stdout, "notarytool info");
      writeJson(statusPath, statusPayload);
      const status = normalizeStatus(statusPayload.status);
      console.log(`Notarization status (${submissionId}): ${statusPayload.status}`);

      if (status === "accepted") {
        console.log(`Stapling notarization ticket to ${appPath}`);
        runOrThrow("/usr/bin/xcrun", ["stapler", "staple", "-v", appPath], "Staple notarization ticket");
        return;
      }

      if (status === "invalid" || status === "rejected") {
        const logResult = runCommand(
          "/usr/bin/xcrun",
          ["notarytool", "log", submissionId, logPath, ...creds],
          "Fetch notarization log",
        );
        let summary = "Unable to fetch notarization log.";
        if (logResult.ok && fs.existsSync(logPath)) {
          const logJson = parseJson(fs.readFileSync(logPath, "utf8"), "notarytool log");
          summary = summarizeIssues(logJson);
        }
        throw new Error(`Notarization ${statusPayload.status}: ${summary}`);
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(`Notarization timed out after ${Math.round(timeoutMs / 60000)} minutes. Submission id: ${submissionId}`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
};
