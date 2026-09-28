const { Client, GatewayIntentBits, Partials } = require("discord.js");
const https = require("https");

const { TOKEN, OWNER_ID, SERVERS, USE_PREVIEW } = require("./config");

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
// comparing version strings here. Skip inactive servers.
(function detectChannelSwitch() {
    const wantedMode = USE_PREVIEW ? "preview" : "stable";
    for (const server of SERVERS.filter(s => !s.inactive)) {
        const key = server.key;
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
// One ServerManager per entry in config.js SERVERS, keyed by
// server.key. Adding a server to config.js is enough: the bot
// builds its manager and its command set automatically here,
// no other code change is needed.

async function handleCrash(name, label) {
    await notifyOwner(client, ` Server ${label} crashed. Restarting...`);
}

const managers = {};
const serverByGuildId = {};
let dmServer = null; // server controlled via DM with the owner (config.js "dm: true")

for (const server of SERVERS) {
    // Skip inactive servers (not yet available)
    if (!server.inactive) {
        managers[server.key] = new ServerManager({
            name: server.key,
            label: server.label,
            rootDir: server.rootDir,
            port: server.port,
            onCrash: handleCrash,
            onStateChange: persistServerState
        });
    }
    if (server.guildId) serverByGuildId[server.guildId] = server;
    if (server.dm) dmServer = server;
}

//------------------------------------------------------
// BOT READY
//------------------------------------------------------

client.on("ready", async () => {
    console.log(` Bot active as ${client.user.tag}`);

    // Reconciliation: find servers already running (started manually
    // in Windows or left running before a bot restart) and adopt them
    // so status/stop commands work immediately. Skip inactive servers.
    await reconcileOnStartup(
        SERVERS.filter(s => !s.inactive).map(server => ({ manager: managers[server.key], rootDir: server.rootDir }))
    );
    saveFullState();

    // Periodically check that adopted processes are still alive (skip inactive)
    setInterval(() => {
        for (const server of SERVERS.filter(s => !s.inactive)) {
            managers[server.key].checkAdoptedStillAlive();
        }
    }, 60 * 1000);

    // Start the nightly update scheduler (checks daily during the
    // configured window for a new server version), once per active server.
    startUpdateScheduler({
        state: currentState,
        saveState: saveFullState,
        targets: SERVERS.filter(s => !s.inactive).map(server => ({
            root: server.rootDir,
            manager: managers[server.key],
            key: server.key
        })),
        notify: msg => notifyOwner(client, msg)
    });
});

//------------------------------------------------------
// MANUAL UPDATE (!update)
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
// Same command set in every configured Discord server: !start,
// !stop, !status, !version, !ip, !update. Each Discord server only
// ever sees and controls its own Minecraft server (looked up by
// guild ID in config.js SERVERS). A server marked ownerOnly in
// config.js only answers OWNER_ID within its guild.

async function handleServerCommand(msg, server, manager) {
    if (msg.content === "!start") {
        const result = manager.start();
        msg.reply(result.message);
    }

    if (msg.content === "!stop") {
        const result = manager.stop({ reason: "manual request" });
        msg.reply(result.message);
    }

    if (msg.content === "!status")
        msg.reply(manager.status());

    if (msg.content === "!version") {
        const version = getInstalledVersion(server.rootDir);
        msg.reply(version ? `Server version: ${version}` : "No installation found for this server.");
    }

    if (msg.content === "!ip") {
        if (!manager.isRunning()) return msg.reply("Server is offline.");
        const ip = await getPublicIP();
        msg.reply(`IP: ${ip}\nPort: ${server.port}`);
    }

    if (msg.content === "!update") {
        await handleManualUpdate(msg, { rootDir: server.rootDir, manager, label: server.label, stateKey: server.key });
    }
}

client.on("messageCreate", async msg => {

    // Only respond inside a configured Discord server, and only to
    // the one it is mapped to (see SERVERS in config.js). Messages
    // from unconfigured servers or from DMs are ignored.
    if (!msg.guild) {
        // DM: private server, owner only, commands with "priv" suffix
        // (!startpriv, !stoppriv, !statuspriv, !versionpriv, !ippriv, !updatepriv)
        if (!dmServer || msg.author.id !== OWNER_ID) return;
        const m = /^!(start|stop|status|version|ip|update)priv$/.exec(msg.content);
        if (!m) return;
        msg.content = "!" + m[1];
        return handleServerCommand(msg, dmServer, managers[dmServer.key]);
    }

    const server = serverByGuildId[msg.guild.id];
    if (!server) return;

    // Skip inactive servers (not yet available)
    if (server.inactive) {
        if (msg.author.id === OWNER_ID) {
            msg.reply(" This server is currently inactive and not available for commands.");
        }
        return;
    }

    // A server marked ownerOnly (e.g. a private server) only answers
    // commands from OWNER_ID, even though it lives in its own guild:
    // everyone else's messages there are silently ignored.
    if (server.ownerOnly && msg.author.id !== OWNER_ID) return;

    await handleServerCommand(msg, server, managers[server.key]);
});

//------------------------------------------------------
// LOGIN
//------------------------------------------------------

client.login(TOKEN);
