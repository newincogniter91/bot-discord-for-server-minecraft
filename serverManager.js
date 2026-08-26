// ============================================================
// SERVER MANAGER
// ============================================================
// Encapsulates all logic for ONE Bedrock server: start, graceful stop
// (the "stop" console command, not a hard kill), log-based player
// detection, empty-server shutdown, crash restart, and adoption of
// an existing process found at bot startup (started manually in Windows).
//
// Known limitation: an "adopted" process does not expose its stdout
// to Node (it was not launched by this process), so while it remains
// "adopted" we cannot count online players or auto-shutdown/restart it.
// Full control returns after the first bot-managed stop+start.

const { spawn } = require("child_process");
const { findVersionFolder } = require("./serverFolder");
const { isPidAlive } = require("./processDiscovery");
const { EMPTY_SHUTDOWN_MINUTES } = require("./config");

class ServerManager {
    /**
     * @param {object} opts
    * @param {string} opts.name - "public" | "private", used for logs and state
    * @param {string} opts.label - readable label for Discord messages
    * @param {string} opts.rootDir - container folder (contains bedrock-server-*)
     * @param {number} opts.port
    * @param {function} opts.onCrash - async callback(managerName) called on crash
    * @param {function} opts.onStateChange - callback(managerName, patch) to persist state
     */
    constructor({ name, label, rootDir, port, onCrash, onStateChange }) {
        this.name = name;
        this.label = label;
        this.rootDir = rootDir;
        this.port = port;
        this.onCrash = onCrash;
        this.onStateChange = onStateChange;

        this.process = null;          // ChildProcess (only when started by us)
        this.adoptedPid = null;       // PID of an external "adopted" process
        this.manualStop = false;
        this.playersOnline = 0;
        this.emptyTimeout = null;
        this.startedBy = null;        // "discord" | "external" | null
    }

    /** True when the server is running, whether managed or adopted. */
    isRunning() {
        return !!this.process || !!this.adoptedPid;
    }

    /** Mark this manager as "adopted" by an already running process. */
    adopt(pid) {
        this.adoptedPid = pid;
        this.startedBy = "external";
        this._persistState();
        console.log(` Server ${this.label}: adopted external process PID ${pid} (started manually in Windows).`);
    }

    /** Periodically check that an adopted process is still alive. */
    async checkAdoptedStillAlive() {
        if (!this.adoptedPid) return;
        const alive = await isPidAlive(this.adoptedPid);
        if (!alive) {
            console.log(` Server ${this.label}: the adopted process (PID ${this.adoptedPid}) is no longer running.`);
            this.adoptedPid = null;
            this.startedBy = null;
            this._persistState();
        }
    }

    _persistState() {
        if (this.onStateChange) {
            this.onStateChange(this.name, {
                running: this.isRunning(),
                pid: this.process ? this.process.pid : this.adoptedPid,
                startedBy: this.startedBy
            });
        }
    }

    /**
    * Start the server through the .bat file in the versioned folder.
    * Returns { ok: bool, message: string }.
     */
    start() {
        if (this.isRunning()) {
            return { ok: false, message: `Server ${this.label} is already running.` };
        }

        const versionFolder = findVersionFolder(this.rootDir);
        if (!versionFolder) {
            return { ok: false, message: ` No installation found for server ${this.label} in ${this.rootDir}.` };
        }

        this.manualStop = false;
        this.playersOnline = 0;
        this.startedBy = "discord";

        console.log(` Starting server ${this.label} from ${versionFolder}...`);

        this.process = spawn("bedrock_server.exe", [], {
            cwd: versionFolder,
            shell: true,
            windowsHide: false
        });

        this.process.stdout.on("data", data => this._handleLogLine(data.toString()));
        this.process.stderr.on("data", data => console.error(`${this.label.toUpperCase()} STDERR:`, data.toString()));

        this.process.on("close", async () => {
            const crashed = !this.manualStop;
            this.process = null;
            this.startedBy = null;
            this._persistState();

            if (crashed && this.onCrash) {
                await this.onCrash(this.name, this.label);
                this.start();
            }
        });

        this._persistState();
        return { ok: true, message: ` Server ${this.label} started.` };
    }

    _handleLogLine(line) {
        console.log(`${this.label.toUpperCase()}:`, line.trim());

        if (line.includes("Player connected:")) {
            this.playersOnline++;
            if (this.emptyTimeout) {
                clearTimeout(this.emptyTimeout);
                this.emptyTimeout = null;
            }
        }

        if (line.includes("Player disconnected:")) {
            this.playersOnline = Math.max(0, this.playersOnline - 1);
            if (this.playersOnline === 0) {
                this._scheduleEmptyShutdown();
            }
        }
    }

    _scheduleEmptyShutdown() {
        if (this.emptyTimeout) clearTimeout(this.emptyTimeout);
        this.emptyTimeout = setTimeout(() => {
            console.log(` Server ${this.label} has been empty for ${EMPTY_SHUTDOWN_MINUTES} minutes; shutting down automatically.`);
            this.stop({ reason: "inactivity" });
        }, EMPTY_SHUTDOWN_MINUTES * 60 * 1000);
    }

    /**
    * Send the "stop" command to the process console (gracefully saving
    * the world). For an "adopted" process, use taskkill on its PID
    * because stdin is unavailable.
     */
    stop({ reason = "manual request" } = {}) {
        if (!this.isRunning()) {
            return { ok: false, message: `Server ${this.label} is already stopped.` };
        }

        this.manualStop = true;
        if (this.emptyTimeout) {
            clearTimeout(this.emptyTimeout);
            this.emptyTimeout = null;
        }

        if (this.process) {
            console.log(` Stopping server ${this.label} (${reason})...`);
            try {
                this.process.stdin.write("stop\n");
            } catch {
                // stdin is not writable: use a forced fallback
                spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"]);
            }
        } else if (this.adoptedPid) {
            console.log(` Stopping adopted server ${this.label} (PID ${this.adoptedPid}, ${reason})...`);
            spawn("taskkill", ["/PID", String(this.adoptedPid), "/T", "/F"]);
            this.adoptedPid = null;
            this.startedBy = null;
            this._persistState();
        }

        return { ok: true, message: ` Server ${this.label} is stopping.` };
    }

    /** Immediate forced kill, used only as a last resort (for example, a stuck update). */
    forceKill() {
        this.manualStop = true;
        if (this.process) {
            spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"]);
        } else if (this.adoptedPid) {
            spawn("taskkill", ["/PID", String(this.adoptedPid), "/T", "/F"]);
        }
        this.process = null;
        this.adoptedPid = null;
        this.startedBy = null;
        this._persistState();
    }

    status() {
        if (this.process) return ` Server online (managed, ${this.playersOnline} players online)`;
        if (this.adoptedPid) return " Server online (started manually in Windows, player count unavailable)";
        return " Server offline";
    }
}

module.exports = ServerManager;
