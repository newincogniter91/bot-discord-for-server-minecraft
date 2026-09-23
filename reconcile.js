// ============================================================
// RECONCILE ON STARTUP
// ============================================================
// When the bot starts (after a crash, PC restart, etc.) it must
// determine the actual state of every configured server:
//
//  - if a bedrock_server.exe is already running, which configured
//    server does it belong to? Its ExecutablePath contains the
//    server root folder.
//  - if it is running but the bot did not start it (for example,
//    it was launched manually in Windows), adopt it: it is online
//    for Discord commands but has no player count until it is stopped
//    and started through the bot.

const { findRunningBedrockProcesses, matchProcessToRoot } = require("./processDiscovery");

/**
 * @param {Array<{manager: object, rootDir: string}>} targets - one
 *   entry per configured server (manager + its rootDir)
 */
async function reconcileOnStartup(targets) {
    console.log(" Searching for servers already running...");

    const processes = await findRunningBedrockProcesses();

    if (processes.length === 0) {
        console.log(" No running bedrock_server.exe server found.");
        return;
    }

    const matchedPids = new Set();

    for (const { manager, rootDir } of targets) {
        const match = matchProcessToRoot(processes, rootDir);
        if (match) {
            manager.adopt(match.pid);
            matchedPids.add(match.pid);
        }
    }

    const unmatched = processes.filter(p => !matchedPids.has(p.pid));

    if (unmatched.length > 0) {
        console.warn(
            " Found bedrock_server.exe processes that do not match any configured server:",
            unmatched.map(p => `PID ${p.pid} (${p.executablePath})`).join(", ")
        );
    }
}

module.exports = { reconcileOnStartup };
