// ============================================================
// CONFIGURATION
// ============================================================
// Enter your installation values here before starting the bot.

const path = require("path");

module.exports = {
    TOKEN: "<DISCORD_BOT_TOKEN>",
    OWNER_ID: "<DISCORD_OWNER_ID>",

    GROUP_SERVER_PORT: 19132,
    PRIVATE_SERVER_PORT: 19133,

    // Container folder for each server: it must contain exactly one
    // bedrock-server-<version> subfolder, found dynamically.
    PUBLIC_SERVER_ROOT: "<PUBLIC_SERVER_ROOT_PATH>\\bedrock_server",
    PRIVATE_SERVER_ROOT: "<PRIVATE_SERVER_ROOT_PATH>\\privato",

    // Temporary working folder for downloads and extraction during updates
    UPDATE_TMP_DIR: "<SERVER_ROOT_PATH>\\_update_tmp",

    // Files copied from the old version to the new one during an update
    FILES_TO_PRESERVE: [
        "worlds",
        "permissions.json",
        "server.properties",
        "allowlist.json"
    ],

    // Time window for nightly checks/updates (24-hour local PC time)
    UPDATE_WINDOW_START_HOUR: 2,
    UPDATE_WINDOW_END_HOUR: 5,

    // Official Mojang endpoint used by minecraft.net/.../download/server/bedrock
    VERSION_API_URL: "https://net-secondary.web.minecraft-services.net/api/v1.0/download/links",

    // Minutes of inactivity (0 players) before automatic shutdown
    EMPTY_SHUTDOWN_MINUTES: 5,

    // Warning seconds before players are kicked for an update
    UPDATE_KICK_WARNING_SECONDS: 5,

    STATE_FILE: path.join(__dirname, "state.json"),
    LOG_DIR: path.join(__dirname, "logs")
};
