// ============================================================
// STATE PERSISTENCE
// ============================================================
// Stores both servers' state on disk so the bot can read it again
// after a restart (crash, PC restart, etc.).
//
// state.json file structure:
// {
//   "public":  { "running": bool, "pid": number|null, "startedBy": "discord"|"external"|null },
//   "private": { "running": bool, "pid": number|null, "startedBy": "discord"|"external"|null },
//   "lastUpdateCheck": "ISO date string" | null
// }

const fs = require("fs");
const { STATE_FILE } = require("./config");

const DEFAULT_STATE = {
    public: { running: false, pid: null, startedBy: null },
    private: { running: false, pid: null, startedBy: null },
    lastUpdateCheck: null
};

function load() {
    try {
        const raw = fs.readFileSync(STATE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        // Merge with defaults to tolerate fields missing from older state files
        return {
            ...DEFAULT_STATE,
            ...parsed,
            public: { ...DEFAULT_STATE.public, ...(parsed.public || {}) },
            private: { ...DEFAULT_STATE.private, ...(parsed.private || {}) }
        };
    } catch (err) {
        // Missing or corrupt file: start from a clean state
        return { ...DEFAULT_STATE };
    }
}

function save(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
        console.error(" Unable to write state.json:", err.message);
    }
}

module.exports = { load, save, DEFAULT_STATE };
