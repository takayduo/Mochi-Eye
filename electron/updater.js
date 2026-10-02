// Mochi Eye — 1-Click In-App Auto-Updater from GitHub
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const REPO_OWNER = "takayduo";
const REPO_NAME = "Mochi-Eye";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`;
const GITHUB_ZIP_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/main.zip`;

const appDir = path.resolve(__dirname, "..");
const versionJsonPath = path.join(appDir, "version.json");

function getLocalVersionInfo() {
  let commit = "";
  let version = "1.0.0";
  let commitMessage = "";
  let commitDate = "";

  // 1. Try reading version.json
  try {
    if (fs.existsSync(versionJsonPath)) {
      const data = JSON.parse(fs.readFileSync(versionJsonPath, "utf-8"));
      commit = data.commit || "";
      version = data.version || "1.0.0";
      commitMessage = data.commitMessage || "";
      commitDate = data.commitDate || "";
    }
  } catch (e) {
    console.warn("[Updater] Failed to parse version.json:", e);
  }

  // 2. If git exists, git rev-parse is the source of truth
  if (!commit || fs.existsSync(path.join(appDir, ".git"))) {
    try {
      const gitRev = execSync("git rev-parse HEAD", { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      if (gitRev && gitRev.length >= 7) {
        commit = gitRev;
      }
    } catch (e) {
      // not a git repo or git not in path, use version.json
    }
  }

  return {
    version,
    commit,
    commitShort: commit ? commit.slice(0, 7) : "1.0.0",
    commitMessage,
    commitDate,
  };
}

/**
 * Checks GitHub for the latest commit on the main branch.
 */
async function checkForUpdates() {
  const local = getLocalVersionInfo();
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        "User-Agent": "Mochi-Eye-Updater",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      console.warn(`[Updater] GitHub API returned status ${res.status}`);
      return {
        success: false,
        error: `GitHub returned status ${res.status}`,
        local,
      };
    }

    const data = await res.json();
    const remoteSha = data.sha || "";
    const rawMsg = data.commit?.message || "";
    const remoteMessage = rawMsg.split("\n")[0];
    const remoteDate = data.commit?.committer?.date || "";
    const remoteShort = remoteSha ? remoteSha.slice(0, 7) : "";

    const isUpdateAvailable = !!remoteSha && remoteSha !== local.commit;

    return {
      success: true,
      updateAvailable: isUpdateAvailable,
      local,
      remote: {
        commit: remoteSha,
        commitShort: remoteShort,
        message: remoteMessage,
        date: remoteDate,
      },
    };
  } catch (err) {
    console.error("[Updater] Check for updates failed:", err);
    return {
      success: false,
      error: err.message || "Failed to connect to GitHub",
      local,
    };
  }
}

/**
 * Recursively copies directory contents while preserving user-specific files.
 */
function copyDirRecursive(src, dest, protectedFiles = new Set()) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (protectedFiles.has(entry.name.toLowerCase())) {
      console.log(`[Updater] Preserving user file: ${entry.name}`);
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      copyDirRecursive(srcPath, destPath, protectedFiles);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        console.warn(`[Updater] Could not copy ${entry.name}:`, err);
      }
    }
  }
}

/**
 * Performs the update: pulls/downloads latest code, builds bundle, and relaunches.
 */
async function performUpdate(onProgress = () => {}) {
  const check = await checkForUpdates();
  if (!check.success || !check.remote) {
    throw new Error(check.error || "Cannot check for updates right now");
  }

  const remote = check.remote;
  let updateApplied = false;

  // Strategy 1: If .git exists, try git pull
  if (fs.existsSync(path.join(appDir, ".git"))) {
    try {
      onProgress("Checking git repository and pulling latest changes...");
      execSync("git pull origin main", { cwd: appDir, stdio: ["ignore", "pipe", "pipe"] });
      updateApplied = true;
      console.log("[Updater] Git pull succeeded!");
    } catch (gitErr) {
      console.warn("[Updater] git pull failed, falling back to ZIP download:", gitErr.message);
      updateApplied = false;
    }
  }

  // Strategy 2: Download and extract ZIP (Works on any PC with zero Git dependency)
  if (!updateApplied) {
    onProgress("Downloading latest files from GitHub...");
    const tempDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", "Mochi_Update_" + Date.now());
    const zipPath = path.join(tempDir, "update.zip");
    const extractDir = path.join(tempDir, "extracted");

    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      // 1. Download zip
      const zipRes = await fetch(GITHUB_ZIP_URL);
      if (!zipRes.ok) throw new Error(`Download failed with HTTP ${zipRes.status}`);
      const arrayBuffer = await zipRes.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

      onProgress("Extracting update package...");
      // Use built-in Windows tar.exe to extract zip fast without extra npm modules
      try {
        execSync(`tar.exe -xf "${zipPath}" -C "${extractDir}"`, { stdio: "ignore" });
      } catch (tarErr) {
        // Fallback to PowerShell Expand-Archive
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: "ignore" });
      }

      onProgress("Applying updated features...");
      // Locate the extracted repo root (typically Mochi-Eye-main)
      const extractedFolders = fs.readdirSync(extractDir).filter((f) => {
        return fs.statSync(path.join(extractDir, f)).isDirectory();
      });
      const updateSourceDir = extractedFolders.length > 0 ? path.join(extractDir, extractedFolders[0]) : extractDir;

      // Protected user files that MUST NEVER be overwritten
      const protectedFiles = new Set([
        "settings.json",
        "chat_history.json",
        "schedule.json",
        "node_modules",
        ".git",
        ".env",
      ]);

      copyDirRecursive(updateSourceDir, appDir, protectedFiles);
      updateApplied = true;
      console.log("[Updater] Files updated successfully from ZIP!");
    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanErr) {
        // ignore
      }
    }
  }

  // 3. Rebuild frontend bundle with Vite
  onProgress("Building updated application bundle...");
  const viteBin = path.join(appDir, "node_modules", "vite", "bin", "vite.js");
  if (fs.existsSync(viteBin)) {
    try {
      execSync(`"${process.execPath}" "${viteBin}" build`, { cwd: appDir, stdio: "ignore" });
    } catch (buildErr) {
      console.warn("[Updater] Vite build error, attempting npm run build:", buildErr.message);
      try {
        execSync("npm run build", { cwd: appDir, stdio: "ignore" });
      } catch (npmErr) {
        console.error("[Updater] Build failed:", npmErr);
      }
    }
  }

  // 4. Update version.json
  try {
    fs.writeFileSync(
      versionJsonPath,
      JSON.stringify(
        {
          version: "1.0.0",
          commit: remote.commit,
          commitDate: remote.date,
          commitMessage: remote.message,
        },
        null,
        2
      ),
      "utf-8"
    );
  } catch (e) {
    console.warn("[Updater] Could not save updated version.json:", e);
  }

  onProgress("Restarting Mochi...");
  await new Promise((r) => setTimeout(r, 1000));

  // 5. Relaunch the app smoothly!
  app.relaunch();
  app.exit(0);
}

module.exports = {
  getLocalVersionInfo,
  checkForUpdates,
  performUpdate,
};
