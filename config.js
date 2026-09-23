// ============================================================
// CONFIGURATION
// ============================================================
// Enter your installation values here before starting the bot.

const path = require("path");

module.exports = {
    TOKEN: "<DISCORD_BOT_TOKEN>",
    OWNER_ID: "<DISCORD_OWNER_ID>",

    // ------------------------------------------------------------
    // MINECRAFT SERVERS
    // ------------------------------------------------------------
    // One entry per Minecraft Bedrock server. Each entry is tied to
    // exactly one Discord server (guild): the bot answers the same
    // set of commands (!start, !stop, !status, !version, !ip,
    // !update) in every guild, each acting only on its own server.
    //
    // - key:        short unique identifier, used internally and in
    //               state.json (letters/numbers, no spaces)
    // - label:      readable name used in Discord replies
    // - guildId:    ID of the Discord server this entry controls
    //               (Discord: enable Developer Mode in Settings >
    //               Advanced, then right-click the server icon in the
    //               server list and choose "Copy Server ID")
    // - rootDir:    container folder for this server; it must contain
    //               exactly one bedrock-server-<version> subfolder,
    //               found dynamically
    // - port:       port this server listens on (must be unique per
    //               server if they run on the same PC)
    // - ownerOnly:  optional, default false. If true, only OWNER_ID
    //               (above) can run commands for this server, even
    //               inside its own guild — everyone else's messages
    //               are ignored. Use this for a private server.
    //
    // Add as many entries as you want; the bot builds one manager and
    // one command set per entry automatically, no other code change
    // needed.
    SERVERS: [
        {
            key: "server1",
            label: "Server 1",
            guildId: "<DISCORD_GUILD_ID_1>",
            rootDir: "<SERVER1_ROOT_PATH>\\bedrock_server",
            port: 19132
        },
        {
            key: "server2",
            label: "Server 2",
            guildId: "<DISCORD_GUILD_ID_2>",
            rootDir: "<SERVER2_ROOT_PATH>\\bedrock_server",
            port: 19133
        },
        {
            key: "privato",
            label: "Privato",
            guildId: "<DISCORD_GUILD_ID_PRIVATO>",
            rootDir: "<PRIVATE_SERVER_ROOT_PATH>\\privato",
            port: 19134,
            ownerOnly: true
        }
        // , { key: "server4", label: "Server 4", guildId: "<DISCORD_GUILD_ID_4>", rootDir: "<SERVER4_ROOT_PATH>\\bedrock_server", port: 19135 }
    ],

    // Temporary working folder for downloads and extraction during updates
    UPDATE_TMP_DIR: "<SERVER_ROOT_PATH>\\_update_tmp",

    // Files copied from the old version to the new one during an update
    FILES_TO_PRESERVE: [
        "worlds",
        "permissions.json",
        "server.properties",
        "allowlist.json",
        "resource_packs",
        "behavior_packs",
        "world_resource_packs.json",
        "world_behavior_packs.json"
    ],

    // Time window for nightly checks/updates (24-hour local PC time)
    UPDATE_WINDOW_START_HOUR: 2,
    UPDATE_WINDOW_END_HOUR: 5,

    // Official Mojang endpoint used by minecraft.net/.../download/server/bedrock
    VERSION_API_URL: "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links",

    // If true, the bot downloads/updates the Bedrock PREVIEW server
    // instead of the stable one. Note: to actually join a preview
    // server, players need the "Minecraft Preview" app/beta on their
    // client (not the regular Minecraft app) — the two are not
    // cross-compatible with each other's stable counterpart.
    USE_PREVIEW: false,

    // Minutes of inactivity (0 players) before automatic shutdown
    EMPTY_SHUTDOWN_MINUTES: 5,

    // Warning seconds before players are kicked for an update
    UPDATE_KICK_WARNING_SECONDS: 5,

    STATE_FILE: path.join(__dirname, "state.json"),
    LOG_DIR: path.join(__dirname, "logs")
};
