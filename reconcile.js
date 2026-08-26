// ============================================================
// RECONCILE ON STARTUP
// ============================================================
// When the bot starts (after a crash, PC restart, etc.) it must
// determine the actual state of both servers:
//
//  - if a bedrock_server.exe is already running, which server
//    (public/private) does it belong to? Its ExecutablePath contains
//    the server root folder.
//  - if it is running but the bot did not start it (for example,
//    it was launched manually in Windows), adopt it: it is online
//    for Discord commands but has no player count until it is stopped
//    and started through the bot.

const { findRunningBedrockProcesses, matchProcessToRoot } = require("./processDiscovery");

/**
 * @param {object} publicManager - Public ServerManager
 * @param {object} privateManager - Private ServerManager
 * @param {string} publicRoot
 * @param {string} privateRoot
 */
async function reconcileOnStartup(publicManager, privateManager, publicRoot, privateRoot) {
    console.log(" Searching for servers already running...");

    const processes = await findRunningBedrockProcesses();

    if (processes.length === 0) {
        console.log(" No running bedrock_server.exe server found.");
        return;
    }

    const publicMatch = matchProcessToRoot(processes, publicRoot);
    const privateMatch = matchProcessToRoot(processes, privateRoot);

    if (publicMatch) {
        publicManager.adopt(publicMatch.pid);
    }

    if (privateMatch) {
        privateManager.adopt(privateMatch.pid);
    }

    const unmatched = processes.filter(p =>
        (!publicMatch || p.pid !== publicMatch.pid) &&
        (!privateMatch || p.pid !== privateMatch.pid)
    );

    if (unmatched.length > 0) {
        console.warn(
            " Found bedrock_server.exe processes that do not match either configured root:",
            unmatched.map(p => `PID ${p.pid} (${p.executablePath})`).join(", ")
        );
    }
}

module.exports = { reconcileOnStartup };
