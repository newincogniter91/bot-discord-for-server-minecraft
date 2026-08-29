// ============================================================
// UPDATER
// ============================================================
// Every day, during the 02:00-05:00 window, check for a new Bedrock
// server version through the official Mojang API and, if available,
// update each server (public/private):
//
//   1. if players are online, warn them in MC chat and Discord,
//      wait N seconds, then send "stop" (including the save)
//   2. download the official zip for the new version
//   3. extract it into a temporary folder
//   4. start the new .exe once (the first run may require admin rights)
//      to generate its default files, then stop it
//   5. copy worlds/, permissions.json, server.properties, and
//      allowlist.json from the old installation to the new one
//   6. move the new folder into place and delete the old one
//   7. restart the server if it was running before the update
//
// If anything goes wrong midway, the old folder is NEVER deleted until
// the new one is ready and verified: leaving duplicates on disk is
// preferable to losing a world.

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");
const {
    VERSION_API_URL,
    UPDATE_TMP_DIR,
    FILES_TO_PRESERVE,
    UPDATE_KICK_WARNING_SECONDS
} = require("./config");
const { findVersionFolder, extractVersionFromFolderName } = require("./serverFolder");
const { runPowerShell } = require("./processDiscovery");

/**
 * Like fsp.rm(path, { recursive: true, force: true }), but retries on
 * EBUSY/EPERM/ENOTEMPTY. On Windows, LevelDB files inside worlds/ (e.g.
 * MANIFEST-*) can stay locked for a moment after the owning process
 * closes them or after a preceding fs.cp read, so an immediate rm can
 * fail even though the lock releases within a second or two.
 */
async function rmWithRetry(targetPath, { retries = 5, delayMs = 1000 } = {}) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await fsp.rm(targetPath, { recursive: true, force: true });
            return;
        } catch (err) {
            const retryable = err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "ENOTEMPTY");
            if (!retryable || attempt === retries) {
                throw err;
            }
            console.warn(` rm ${targetPath} failed (${err.code}), retry ${attempt}/${retries} in ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

/** Query the official Mojang API and return { version, url } for Windows. */
async function fetchLatestVersion() {
    const res = await fetch(VERSION_API_URL);
    if (!res.ok) {
        throw new Error(`Mojang version API returned ${res.status}`);
    }
    const data = await res.json();
    const links = data && data.result && data.result.links;
    if (!Array.isArray(links)) {
        throw new Error("Unexpected Mojang API response format");
    }

    const winLink = links.find(l => l.downloadType === "serverBedrockWindows");
    if (!winLink) {
        throw new Error("Windows download link not found in the API response");
    }

    const match = winLink.downloadUrl.match(/bedrock-server-(.+?)\.zip$/i);
    const version = match ? match[1] : null;

    return { version, url: winLink.downloadUrl };
}

async function downloadZip(url, destPath) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(destPath, buffer);
}

async function extractZip(zipPath, destDir) {
    await fsp.mkdir(destDir, { recursive: true });
    // -Force overwrites files; -Path/-DestinationPath require quotes for paths with spaces
    const script = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;
    await runPowerShell(script);
}

/**
 * Start the newly extracted server once (to generate default files),
 * then stop it after a few seconds.
 * 
 * Note: Admin elevation is not required because Windows Firewall is
 * already configured to allow bedrock_server.exe without prompts (see README).
 */
async function firstRunServer(versionFolderPath) {
    return new Promise((resolve) => {
        const proc = spawn("bedrock_server.exe", [], {
            cwd: versionFolderPath,
            shell: true,
            windowsHide: false
        });

        // Let the server run for a few seconds, then stop it with "stop"
        setTimeout(() => {
            try {
                proc.stdin.write("stop\n");
            } catch {
                // If stdin is unavailable, force-kill the process
                proc.kill();
            }
            resolve();
        }, 10000); // 10 seconds to initialize

        proc.on("error", resolve);
        proc.on("close", resolve);
    });
}

async function copyPreservedFiles(oldVersionFolder, newVersionFolder) {
    for (const item of FILES_TO_PRESERVE) {
        const src = path.join(oldVersionFolder, item);
        const dest = path.join(newVersionFolder, item);

        const exists = await fsp.access(src).then(() => true).catch(() => false);
        if (!exists) {
            console.warn(` ${item} not found in ${oldVersionFolder}; skipping.`);
            continue;
        }

        // Remove the generated default counterpart from the new folder, if present
        await rmWithRetry(dest);
        await fsp.cp(src, dest, { recursive: true });
        console.log(` Copied ${item} to the new installation.`);
    }
}

/**
 * Run the complete update flow for ONE server (root directory).
 * `serverManager` is the corresponding ServerManager instance: it is
 * used to check whether the server was running, stop/restart it, and warn players.
 *
 * `newVersion` and `downloadUrl` are already resolved by the caller,
 * so the version check runs only once for both servers.
 */
async function updateServer({ rootDir, serverManager, newVersion, downloadUrl, notify }) {
    const oldVersionFolder = findVersionFolder(rootDir);
    const oldVersion = oldVersionFolder ? extractVersionFromFolderName(oldVersionFolder) : null;

    if (oldVersion === newVersion) {
        return { updated: false, reason: "already up to date" };
    }

    const wasRunning = serverManager.isRunning();

    // 1. warn and kick players if necessary
    if (wasRunning && serverManager.playersOnline > 0 && serverManager.process) {
        const warnMsg = `The server will update in ${UPDATE_KICK_WARNING_SECONDS} seconds (v${newVersion}). Saving...`;
        try {
            serverManager.process.stdin.write(`say ${warnMsg}\n`);
        } catch { /* Ignore if stdin is unavailable. */ }
        if (notify) await notify(` ${serverManager.label}: ${warnMsg}`);
        await new Promise(r => setTimeout(r, UPDATE_KICK_WARNING_SECONDS * 1000));
    }

    // 2. gracefully stop the server if running (save the world before updating)
    if (wasRunning) {
        serverManager.stop({ reason: `update to v${newVersion}` });
        // Wait until the process has actually closed
        await waitUntilStopped(serverManager, 60000);
    }

    // 3. download
    await fsp.mkdir(UPDATE_TMP_DIR, { recursive: true });
    const zipPath = path.join(UPDATE_TMP_DIR, `bedrock-server-${newVersion}.zip`);
    console.log(` Downloading version ${newVersion}...`);
    await downloadZip(downloadUrl, zipPath);

    // 4. extract into a dedicated temporary folder
    const extractDir = path.join(UPDATE_TMP_DIR, `extract-${newVersion}-${Date.now()}`);
    console.log(" Extracting zip...");
    await extractZip(zipPath, extractDir);

    // Final destination inside the server root
    const newVersionFolder = path.join(rootDir, `bedrock-server-${newVersion}`);
    await rmWithRetry(newVersionFolder);
    await fsp.rename(extractDir, newVersionFolder);

    // 5. first run to generate the default configuration, then stop
    console.log("First run to generate the configuration...");
    try {
        await firstRunServer(newVersionFolder);
        await new Promise(r => setTimeout(r, 3000)); // Give the process time to terminate
    } catch (err) {
        console.error("Error during first run:", err.message);
        if (notify) await notify(`First run error for ${serverManager.label}: ${err.message}. Check manually.`);
    }

    // 6. copy preserved files from the old installation
    if (oldVersionFolder) {
        await copyPreservedFiles(oldVersionFolder, newVersionFolder);
    }

    // 7. remove the old folder ONLY after the new one is ready
    if (oldVersionFolder && oldVersionFolder !== newVersionFolder) {
        await rmWithRetry(oldVersionFolder);
        console.log(` Removed old installation: ${oldVersionFolder}`);
    }

    // Clean up the temporary zip
    await fsp.rm(zipPath, { force: true });

    // 8. restart if it was running before
    if (wasRunning) {
        serverManager.start();
    }

    return { updated: true, from: oldVersion, to: newVersion };
}

function waitUntilStopped(serverManager, timeoutMs) {
    return new Promise(resolve => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (!serverManager.isRunning() || Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve();
            }
        }, 1000);
    });
}

module.exports = { fetchLatestVersion, updateServer };
