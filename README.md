# Minecraft Bedrock Discord Bot - Installation Guide

This guide walks you through the complete installation of the Discord bot for automatic Minecraft Bedrock server management on Windows, starting from scratch.

The bot can manage **any number of Minecraft servers**. Each server is tied to exactly one Discord server (guild): every configured Discord server gets the **same set of commands** (`!start`, `!stop`, `!status`, `!version`, `!ip`, `!update`), each acting only on its own Minecraft server. You add servers by editing an array in `config.js` — no code changes needed.

## Prerequisites

- Windows 10 or later
- Node.js v18 or later (download from https://nodejs.org/)
- One Discord server per Minecraft server you want to manage, where you are an administrator
- A valid Discord Bot token (see "Creating the Discord Bot" below) — the **same** bot application/token is used across all your Discord servers
- PowerShell (already included with Windows)

## Phase 1: Preparing the Server Folders

The bot expects a specific folder structure. For **each** Minecraft server you want to manage, create an empty folder on your PC, for example:

```
<SERVER1_ROOT_PATH>\bedrock_server\
<SERVER2_ROOT_PATH>\bedrock_server\
```

Inside each folder, place a subfolder containing the Bedrock Dedicated server downloaded from https://www.minecraft.net/en-us/download/server/bedrock:

```
<SERVER1_ROOT_PATH>\bedrock_server\bedrock-server-<VERSION>\
<SERVER2_ROOT_PATH>\bedrock_server\bedrock-server-<VERSION>\
```

**Important note:** The version number does not matter (1.26.44.3, 1.21.132.3, etc.) — the bot finds it automatically using the `bedrock-server-*` pattern. Each server may use a different or matching version.

If you do not have the server files yet:
1. Go to https://www.minecraft.net/en-us/download/server/bedrock
2. Click the download button (Windows)
3. Extract the zip into the relevant folder for that server

## Phase 2: Discord Bot Configuration

### Creating the Bot in the Discord Developer Portal

1. Go to https://discord.com/developers/applications
2. Click "New Application" and give it a name (for example, "Minecraft Bot")
3. Open the "Bot" section on the left
4. Click "Add Bot"
5. Under "TOKEN", click "Copy" — save this token temporarily
6. Scroll to "Intents" and enable:
   - Guilds
   - Guild Messages
   - Message Content
   - Direct Messages

This single bot application is shared by all your Discord servers — you do not need to create a new application for each one.

### Configuring the Bot Token and the Server List

1. Extract the project into a local folder (for example, `<BOT_FOLDER_PATH>`)
2. Open `config.js` with a text editor (Notepad, Visual Studio Code, etc.)
3. Find this line:
   ```javascript
   TOKEN: "<DISCORD_BOT_TOKEN>",
   ```
4. Replace the token string with the token copied from the Discord Developer Portal
5. Find this line:
   ```javascript
   OWNER_ID: "<DISCORD_OWNER_ID>",
   ```
6. Replace it with your Discord ID. To find it:
   - Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
   - Right-click your username and select "Copy User ID"
7. Find the `SERVERS` array. It comes with two example entries:
   ```javascript
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
       }
   ],
   ```
   For each Minecraft server you want to manage, add one entry (edit the two examples, delete the ones you don't need, or add more — copy an entry, add a comma, and adjust its values):
   - `key` — a short unique identifier (letters/numbers only, no spaces), used internally and in `state.json`
   - `label` — a readable name, shown in Discord replies (e.g. "Survival", "Creativo")
   - `guildId` — the ID of the Discord server this entry controls (see below how to find it)
   - `rootDir` — the folder from Phase 1 for this server
   - `port` — the port this server listens on (must be different for each server if they run on the same PC)
8. Save the file

**To find a Discord server's ID (`guildId`):** with Developer Mode enabled (step 6 above), right-click the server's icon in the server list on the left of Discord and select "Copy Server ID".

### Authorizing the Bot in Every Discord Server

Repeat this once for **each** Discord server listed in `SERVERS`:

1. Torna a https://discord.com/developers/applications
2. Open the application you created
3. Go to "OAuth2" > "URL Generator"
4. Select the "bot" scope
5. Select the permissions: "Send Messages", "Read Messages/View Channels"
6. Copy the generated URL
7. Open it in a browser — you will be asked to select the Discord server
8. Select the Discord server matching this `SERVERS` entry's `guildId` and authorize it

The bot should appear offline in each Discord server (it will appear online when you start it).

## Phase 3: Windows Firewall Configuration

This step is **important** to avoid confirmation popups during automatic nightly updates.

1. Open PowerShell as Administrator (search for "PowerShell" in Windows, right-click it, and select "Run as administrator")
2. For each server root path configured in `SERVERS`, paste this command (adjusting the name and path) and press Enter:
   ```powershell
   New-NetFirewallRule -DisplayName "<FIREWALL_RULE_NAME>" -Direction Inbound -Action Allow -Program "<SERVERN_ROOT_PATH>\*" -Description "Allow Minecraft server executables" -ErrorAction SilentlyContinue
   ```
3. If you receive a message without errors, the rule was created
4. Verify it under Settings > Firewall > Allowed apps - you should see the configured rule(s) in the list

## Phase 4: Installing Dependencies and Starting the Bot

1. Open Command Prompt (cmd.exe) or PowerShell
2. Change to the bot folder:
   ```
   cd <BOT_FOLDER_PATH>
   ```
3. Install the Node.js dependencies:
   ```
   npm install
   ```
4. Start the bot:
   ```
   node bot.js
   ```

If everything works, you will see this in the terminal:
```
Starting the bot...
Bot active as YourBotName#0000
Searching for servers already running...
```

The bot is ready. You can test the commands in each Discord server.

## Phase 5: Automatic Bot Startup (Optional)

To start the bot automatically when the PC boots:

### Option A: Use the Included PowerShell File

The `start_bot.vbs` file already contains a script that starts the bot. You can create a shortcut in the Windows Startup folder:

1. Press Windows + R, type `shell:startup`, and press Enter
2. Create a new shortcut to `start_bot.vbs`

### Option B: Use Task Scheduler

1. Open "Task Scheduler" (search for it in Windows)
2. Click "Create Task..."
3. Name: "Minecraft Bot"
4. Select "Run with highest privileges"
5. Open the "Triggers" tab > "New..." > "At startup"
6. Open the "Actions" tab > "New..." > Action: "Start a program"
   - Program/script: `<NODE_EXE_PATH>`
   - Add arguments: `<BOT_FOLDER_PATH>\bot.js`
   - Start in: `<BOT_FOLDER_PATH>`
7. Click OK

## Available Discord Commands

The **same commands** are available in every Discord server configured in `SERVERS`. Each Discord server only ever sees and controls its own Minecraft server (matched by `guildId`), so no command needs a server name — just run it in the right Discord server:

- `!start` — Start this Discord server's Minecraft server
- `!stop` — Stop this Discord server's Minecraft server
- `!status` — Show its status (online/offline, players online)
- `!version` — Show its installed version
- `!ip` — Show the public IP and connection port
- `!update` — Check for and apply an update, if the server is idle

A message sent in a Discord server that is not listed in `SERVERS`, or in a DM, is ignored by these commands.

## Automatic Features

### Automatic Shutdown

When a server is running with no online players, the bot waits 5 minutes and then shuts it down automatically to save resources. If a player reconnects, the timer resets.

### Automatic Crash Restart

If a server crashes unexpectedly, the bot restarts it automatically and sends you (the `OWNER_ID`) a Discord direct message.

### Automatic Nightly Updates

Every day between 02:00 and 05:00, the bot checks whether a new Bedrock server version is available, for **every** server configured in `SERVERS`. For each one, if an update is available:

1. If players are online, the bot warns them in Minecraft chat and Discord
2. It waits 5 seconds
3. It saves the world and stops the server
4. It downloads the new version
5. It extracts and configures it
6. It copies important data from the old version (world, permissions, resource packs/mods, etc.)
7. It deletes the old version
8. It restarts the server if it was running before

If there is no new version for a given server, nothing happens to it.

## State Persistence

The bot saves every server's state in a single `state.json` file in the same folder, one entry per `key` in `SERVERS`. If the bot crashes or the PC restarts:

- If a server was running when the bot stopped, the bot attempts to "adopt" the process and keep it online
- If a server was started manually in Windows (not by the bot), the bot recognizes and manages it, but cannot count players automatically until it stops and restarts it
- All Discord commands remain functional
- Adding a new entry to `SERVERS` after the bot has already run is safe — its state is created automatically on the next start

## Troubleshooting

### "discord.js module not found"

You skipped `npm install`. Run:
```
cd <BOT_FOLDER_PATH>
npm install
```

### "The token is invalid"

The token was copied incorrectly from the Discord Developer Portal, or it has expired. Generate a new token and replace it in `config.js`.

### "Bot offline / Does not respond to commands in one of my Discord servers"

1. Verify that the `node bot.js` process is actually running
2. Verify that the bot is authorized in that specific Discord server (it should be in the member list) — see "Authorizing the Bot in Every Discord Server" above
3. Verify that the `guildId` in the matching `SERVERS` entry is correct (right-click the server icon > Copy Server ID)
4. Check that the token in `config.js` is correct
5. Look for errors in the terminal where you started the bot

### "The server does not shut down after 5 minutes"

If the server was started manually in Windows (not by the bot), the bot cannot count players and does not perform an automatic shutdown. Start it through the bot with `!start` in the matching Discord server.

### "The update did not work"

The update requires the path configured in `UPDATE_TMP_DIR` to be accessible (the bot creates it). If you receive permission errors:

1. Run the bot as administrator
2. Verify that the folders are not protected by Windows Defender

### "The first run as administrator does not work"

If the bot cannot start the new server during an update:

1. Did you configure the firewall as described in Phase 3, for that server's root path?
2. If you receive a popup, the firewall rule was not created correctly — try the PowerShell command again

## Adding or Removing a Server Later

1. Stop the bot (close the `node bot.js` process)
2. Edit the `SERVERS` array in `config.js`: add, remove, or edit an entry as described in Phase 2
3. If adding a server, make sure its Discord server has the bot authorized (Phase 2) and its firewall rule exists (Phase 3)
4. Restart the bot (`node bot.js`)

Removing an entry from `SERVERS` stops the bot from responding to that Discord server; it does not stop an already-running Minecraft server for you — stop it manually or with `!stop` before removing the entry.

## Manual Start Without Discord (Optional)

`start_server_template.bat` is a template for starting one Minecraft server directly, without going through the bot. Make a copy per server (e.g. `start_server1.bat`), and edit `SERVER_ROOT` to that server's `rootDir`.

## Custom Configuration

Besides the `SERVERS` array, a few other options can be changed in `config.js`:

```javascript
UPDATE_WINDOW_START_HOUR: 2,   // Update window start (2 AM)
UPDATE_WINDOW_END_HOUR: 5,     // Update window end (5 AM)

EMPTY_SHUTDOWN_MINUTES: 5,     // Inactivity minutes before shutdown
```

After changing `config.js`, restart the bot.

## Final Notes

- The bot works best if the PC does not enter standby between 2 and 5 (the update window)
- If you use a local monitor, nightly updates will not show popups — everything runs in the background
- If problems persist, check the `logs/` folder (if created by the bot during execution)

Enjoy!

## Placeholders to Customize

Before starting, replace the placeholders in the following files with your machine, Discord and bot values.

- `config.js`: `<DISCORD_BOT_TOKEN>`, `<DISCORD_OWNER_ID>`, and inside `SERVERS`, for each server: `<DISCORD_GUILD_ID_N>` and `<SERVERN_ROOT_PATH>` (add/remove entries as needed); also `<SERVER_ROOT_PATH>` for `UPDATE_TMP_DIR`.
- `start_server_template.bat` (only if you use it): `<SERVERN_ROOT_PATH>` — make one copy per server.
- `start-bot.ps1`: `<BOT_FOLDER_PATH>`.
- `start_bot.vbs`: `<BOT_FOLDER_PATH>`.

Never share the Discord token. If the original token was published or shared, revoke it in the Discord Developer Portal and generate a new one.
