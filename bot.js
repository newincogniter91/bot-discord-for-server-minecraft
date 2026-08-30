const { Client, GatewayIntentBits, Partials } = require("discord.js");
const https = require("https");

const {
    TOKEN,
    OWNER_ID,
    GROUP_SERVER_PORT,
    PRIVATE_SERVER_PORT,
    PUBLIC_SERVER_ROOT,
    PRIVATE_SERVER_ROOT,
    USE_PREVIEW
} = require("./config");

const ServerManager = require("./serverManager");
const state = require("./state");
const { reconcileOnStartup } = require("./reconcile");
const { startUpdateScheduler } = require("./updateScheduler");
const { fetchLatestVersion, updateServer } = require("./updater");
const { findVersionFolder, extractVersionFromFolderName } = require("./serverFolder");

function getInstalledVersion(rootDir) {
    const versionFolder = findVersionFolder(rootDir);
    if (!versionFolder) return null;
    return extractVersionFromFolderName(versionFolder);
}

//------------------------------------------------------
// UTILS
//------------------------------------------------------

async function notifyOwner(client, message) {
    try {
        const user = await client.users.fetch(OWNER_ID);
        await user.send(message);
    } catch (err) {
        console.error("Error sending DM:", err);
    }
}

function getPublicIP() {
    return new Promise(resolve => {
        https.get("https://api.ipify.org", res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve(data.trim()));
        }).on("error", () => resolve("IP unavailable"));
    });
}

//------------------------------------------------------
// INITIAL LOG
//------------------------------------------------------

console.log("🟦 Starting the bot...");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

//------------------------------------------------------
// PERSISTENT STATE
//------------------------------------------------------

const currentState = state.load();

function persistServerState(name, patch) {
    currentState[name] = { ...currentState[name], ...patch };
    state.save(currentState);
}

function saveFullState() {
    state.save(currentState);
}

// Detect a stable <-> preview channel change (config.js USE_PREVIEW edited
// by hand since the last run). Version numbers between the two channels
// are not directly comparable, so this just flags each server for a
// forced re-download on the next nightly update pass rather than
// comparing version strings here.
(function detectChannelSwitch() {
    const wantedMode = USE_PREVIEW ? "preview" : "stable";
    for (const key of ["public", "private"]) {
        const installedMode = currentState[key].installedMode;
        if (installedMode && installedMode !== wantedMode) {
            console.log(` Channel switch detected for ${key}: ${installedMode} -> ${wantedMode}. Will re-download on the next nightly update.`);
            currentState[key].pendingChannelSwitch = true;
        } else if (!installedMode) {
            // First run with this field: assume the currently installed
            // build matches whatever channel is configured right now.
            currentState[key].installedMode = wantedMode;
        }
    }
    saveFullState();
})();

//------------------------------------------------------
// SERVER MANAGERS
//------------------------------------------------------

async function handleCrash(name, label) {
    await notifyOwner(client, ` Server ${label} crashed. Restarting...`);
}

const publicManager = new ServerManager({
    name: "public",
    label: "public",
    rootDir: PUBLIC_SERVER_ROOT,
    port: GROUP_SERVER_PORT,
    onCrash: handleCrash,
    onStateChange: persistServerState
});

const privateManager = new ServerManager({
    name: "private",
    label: "private",
    rootDir: PRIVATE_SERVER_ROOT,
    port: PRIVATE_SERVER_PORT,
    onCrash: handleCrash,
    onStateChange: persistServerState
});

//------------------------------------------------------
// BOT READY
//------------------------------------------------------

client.on("ready", async () => {
    console.log(` Bot active as ${client.user.tag}`);

    // Reconciliation: find servers already running (started manually
    // in Windows or left running before a bot restart) and adopt them
    // so status/stop commands work immediately.
    await reconcileOnStartup(publicManager, privateManager, PUBLIC_SERVER_ROOT, PRIVATE_SERVER_ROOT);
    saveFullState();

    // Periodically check that adopted processes are still alive
    setInterval(() => {
        publicManager.checkAdoptedStillAlive();
        privateManager.checkAdoptedStillAlive();
    }, 60 * 1000);

    // Start the nightly update scheduler (checks daily during the
    // configured window for a new server version).
    startUpdateScheduler({
        state: currentState,
        saveState: saveFullState,
        publicManager,
        privateManager,
        publicRoot: PUBLIC_SERVER_ROOT,
        privateRoot: PRIVATE_SERVER_ROOT,
        notify: msg => notifyOwner(client, msg)
    });
});

//------------------------------------------------------
// MANUAL UPDATE (!update / !updatepriv)
//------------------------------------------------------

/**
 * Checks for a newer version and, if found and the server is idle,
 * locks it (blocking manual starts), updates it, then unlocks it.
 * If the server is currently in use, the update is cancelled.
 */
async function handleManualUpdate(msg, { rootDir, manager, label, stateKey }) {
    let reply;
    try {
        reply = await msg.reply(` Checking for updates for the ${label} server...`);
    } catch {
        reply = null;
    }
    const send = text => reply ? reply.edit(text) : msg.channel.send(text);

    let latest;
    try {
        latest = await fetchLatestVersion();
    } catch (err) {
        return send(` Version check failed: ${err.message}`);
    }

    if (!latest.version) {
        return send(" Unable to determine the latest available version.");
    }

    const forceUpdate = !!currentState[stateKey].pendingChannelSwitch;
    const installedVersion = getInstalledVersion(rootDir);
    if (installedVersion === latest.version && !forceUpdate) {
        return send(` The ${label} server is already up to date (v${installedVersion}).`);
    }

    if (manager.isRunning()) {
        return send(
            ` Update to v${latest.version} available for the ${label} server, but it is currently in use.` +
            ` Stop it first, then run this command again.`
        );
    }

    await send(` Updating the ${label} server from v${installedVersion || "?"} to v${latest.version}. The server is locked and cannot be started until this finishes...`);

    manager.lockForUpdate();
    try {
        const result = await updateServer({
            rootDir,
            serverManager: manager,
            newVersion: latest.version,
            downloadUrl: latest.url,
            forceUpdate
        });

        if (result.updated || forceUpdate) {
            currentState[stateKey].installedMode = result.mode;
            currentState[stateKey].pendingChannelSwitch = false;
            saveFullState();
        }

        if (result.updated) {
            const switchNote = forceUpdate ? ` (channel switched to ${result.mode})` : "";
            await send(` Server ${label} updated to version ${result.to}${switchNote}.`);
        } else {
            await send(` Server ${label}: no update needed (${result.reason}).`);
        }
    } catch (err) {
        console.error(`Manual update failed for ${label}:`, err);
        await send(` Update failed for the ${label} server: ${err.message}`);
    } finally {
        manager.unlockAfterUpdate();
    }
}

//------------------------------------------------------
// DISCORD COMMANDS
//------------------------------------------------------

client.on("messageCreate", async msg => {

    // -------------------------
    // PUBLIC COMMANDS (SERVER)
    // -------------------------
    if (msg.guild) {

        if (msg.content === "!start") {
            const result = publicManager.start();
            msg.reply(result.message);
        }

        if (msg.content === "!status")
            msg.reply(publicManager.status());

        if (msg.content === "!version") {
            const version = getInstalledVersion(PUBLIC_SERVER_ROOT);
            msg.reply(version ? `Public server version: ${version}` : "No installation found for the public server.");
        }

        if (msg.content === "!ip") {
            if (!publicManager.isRunning()) return msg.reply("Server is offline.");
            const ip = await getPublicIP();
            msg.reply(`Public IP: ${ip}\nPort: ${GROUP_SERVER_PORT}`);
        }

        if (msg.content === "!update") {
            await handleManualUpdate(msg, { rootDir: PUBLIC_SERVER_ROOT, manager: publicManager, label: "public", stateKey: "public" });
        }

        return;
    }

    // -------------------------
    // PRIVATE COMMANDS (OWNER ONLY)
    // -------------------------
    if (msg.author.id !== OWNER_ID) return;

    if (msg.content === "!startpriv") {
        const result = privateManager.start();
        msg.reply(result.message);
    }

    if (msg.content === "!stoppriv") {
        const result = privateManager.stop({ reason: "owner request" });
        await msg.reply(result.message);
    }

    if (msg.content === "!statuspriv")
        msg.reply(privateManager.status());

    if (msg.content === "!versionpriv") {
        const version = getInstalledVersion(PRIVATE_SERVER_ROOT);
        msg.reply(version ? `Private server version: ${version}` : "No installation found for the private server.");
    }

    if (msg.content === "!ippriv") {
        if (!privateManager.isRunning()) return msg.reply("Server is offline.");
        const ip = await getPublicIP();
        msg.reply(`Private IP: ${ip}\nPort: ${PRIVATE_SERVER_PORT}`);
    }

    if (msg.content === "!updatepriv") {
        await handleManualUpdate(msg, { rootDir: PRIVATE_SERVER_ROOT, manager: privateManager, label: "private", stateKey: "private" });
    }
});

//------------------------------------------------------
// LOGIN
//------------------------------------------------------

client.login(TOKEN);
