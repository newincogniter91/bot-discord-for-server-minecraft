// ============================================================
// UPDATE SCHEDULER
// ============================================================
// Once per day during the configured time window, check for a new
// version and update both servers in sequence (public, then private).
//
// The "once per day" check is enforced by comparing the last-check
// date (YYYY-MM-DD) stored in state.json.

const { UPDATE_WINDOW_START_HOUR, UPDATE_WINDOW_END_HOUR, USE_PREVIEW } = require("./config");
const { fetchLatestVersion, updateServer } = require("./updater");

function currentMode() {
    return USE_PREVIEW ? "preview" : "stable";
}

function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isInsideUpdateWindow() {
    const hour = new Date().getHours();
    return hour >= UPDATE_WINDOW_START_HOUR && hour < UPDATE_WINDOW_END_HOUR;
}

/**
 * @param {object} opts
 * @param {object} opts.state - current state (from state.js load())
 * @param {function} opts.saveState - function used to save updated state
 * @param {object} opts.publicManager - Public ServerManager
 * @param {object} opts.privateManager - Private ServerManager
 * @param {string} opts.publicRoot
 * @param {string} opts.privateRoot
 * @param {function} opts.notify - async(message) -> send a DM/message to the owner
 */
function startUpdateScheduler({ state, saveState, publicManager, privateManager, publicRoot, privateRoot, notify }) {
    async function checkAndUpdate() {
        if (!isInsideUpdateWindow()) return;
        if (state.lastUpdateCheck === todayString()) return; // Already checked today

        console.log(" Checking for nightly updates...");
        state.lastUpdateCheck = todayString();
        saveState(state);

        let latest;
        try {
            latest = await fetchLatestVersion();
        } catch (err) {
            console.error(" Version check failed:", err.message);
            return;
        }

        if (!latest.version) {
            console.error(" Unable to determine the latest version.");
            return;
        }

        const targets = [
            { root: publicRoot, manager: publicManager, key: "public" },
            { root: privateRoot, manager: privateManager, key: "private" }
        ];

        for (const { root, manager, key } of targets) {
            // A channel switch (stable <-> preview) means version numbers
            // are not comparable, so force a re-download even if updater.js
            // would otherwise think the installed version is "current".
            const forceUpdate = !!state[key].pendingChannelSwitch;

            try {
                const result = await updateServer({
                    rootDir: root,
                    serverManager: manager,
                    newVersion: latest.version,
                    downloadUrl: latest.url,
                    notify,
                    forceUpdate
                });

                if (result.updated) {
                    console.log(` Server ${manager.label} updated: ${result.from || "?"} -> ${result.to} (${result.mode})`);
                    if (notify) {
                        const switchNote = forceUpdate ? ` (channel switched to ${result.mode})` : "";
                        await notify(` Server ${manager.label} updated to version ${result.to}${switchNote}.`);
                    }
                } else if (forceUpdate) {
                    console.log(` Server ${manager.label}: channel switch acknowledged, version unchanged.`);
                } else {
                    console.log(` Server ${manager.label}: no update needed.`);
                }

                // Record which channel is now installed and clear the pending flag,
                // whenever we know the installed version matches the current channel.
                if (result.updated || forceUpdate) {
                    state[key].installedMode = currentMode();
                    state[key].pendingChannelSwitch = false;
                    saveState(state);
                }
            } catch (err) {
                console.error(` Update failed for ${manager.label}:`, err.message);
                if (notify) await notify(` Update failed for ${manager.label}: ${err.message}`);
            }
        }
    }

    // Check immediately at startup (in case the bot starts during the window)
    // and then every 30 minutes, so no external cron is needed.
    checkAndUpdate();
    setInterval(checkAndUpdate, 30 * 60 * 1000);
}

module.exports = { startUpdateScheduler };
