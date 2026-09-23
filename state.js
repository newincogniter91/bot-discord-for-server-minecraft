// ============================================================
// STATE PERSISTENCE
// ============================================================
// Stores every configured server's state on disk so the bot can
// read it again after a restart (crash, PC restart, etc.).
//
// state.json file structure:
// {
//   "<server.key>": { "running": bool, "pid": number|null, "startedBy": "discord"|"external"|null,
//                      "installedMode": "stable"|"preview"|null, "pendingChannelSwitch": bool },
//   ... one entry per server configured in config.js SERVERS ...
//   "lastUpdateCheck": "ISO date string" | null
// }

const fs = require("fs");
const { STATE_FILE, SERVERS } = require("./config");

function defaultServerState() {
    return { running: false, pid: null, startedBy: null, installedMode: null, pendingChannelSwitch: false };
}

function buildDefaultState() {
    const defaults = { lastUpdateCheck: null };
    for (const server of SERVERS) {
        defaults[server.key] = defaultServerState();
    }
    return defaults;
}

function load() {
    const defaults = buildDefaultState();
    try {
        const raw = fs.readFileSync(STATE_FILE, "utf8");
        const parsed = JSON.parse(raw);

        // Merge with defaults to tolerate fields missing from older
        // state files, and to add an entry for any server that was
        // just added to config.js SERVERS.
        const merged = { ...defaults, ...parsed };
        for (const server of SERVERS) {
            merged[server.key] = { ...defaults[server.key], ...(parsed[server.key] || {}) };
        }
        return merged;
    } catch (err) {
        // Missing or corrupt file: start from a clean state
        return defaults;
    }
}

function save(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
        console.error(" Unable to write state.json:", err.message);
    }
}

module.exports = { load, save, buildDefaultState };
