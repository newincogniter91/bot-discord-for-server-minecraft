const { Client, GatewayIntentBits, Partials } = require("discord.js");
const https = require("https");

const {
    TOKEN,
    OWNER_ID,
    GROUP_SERVER_PORT,
    PRIVATE_SERVER_PORT,
    PUBLIC_SERVER_ROOT,
    PRIVATE_SERVER_ROOT
} = require("./config");

const ServerManager = require("./serverManager");
const state = require("./state");
const { reconcileOnStartup } = require("./reconcile");
const { startUpdateScheduler } = require("./updateScheduler");

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

        if (msg.content === "!ip") {
            if (!publicManager.isRunning()) return msg.reply("Server is offline.");
            const ip = await getPublicIP();
            msg.reply(`Public IP: ${ip}\nPort: ${GROUP_SERVER_PORT}`);
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

    if (msg.content === "!ippriv") {
        if (!privateManager.isRunning()) return msg.reply("Server is offline.");
        const ip = await getPublicIP();
        msg.reply(`Private IP: ${ip}\nPort: ${PRIVATE_SERVER_PORT}`);
    }
});

//------------------------------------------------------
// LOGIN
//------------------------------------------------------

client.login(TOKEN);
