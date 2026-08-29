# Minecraft Bedrock Discord Bot - Installation Guide

This guide walks you through the complete installation of the Discord bot for automatic Minecraft Bedrock server management on Windows, starting from scratch.

## Prerequisites

- Windows 10 or later
- Node.js v18 or later (download from https://nodejs.org/)
- A Discord server where you are an administrator
- A valid Discord Bot token (see "Creating the Discord Bot" below)
- PowerShell (already included with Windows)

## Phase 1: Preparing the Server Folders

The bot expects a specific folder structure. Create the following empty folders on your PC:

```
<PUBLIC_SERVER_ROOT_PATH>\bedrock_server\
<PRIVATE_SERVER_ROOT_PATH>\privato\
```

Inside each folder, place a subfolder containing the Bedrock Dedicated server downloaded from https://www.minecraft.net/en-us/download/server/bedrock:

```
<PUBLIC_SERVER_ROOT_PATH>\bedrock_server\bedrock-server-<VERSION>\
<PRIVATE_SERVER_ROOT_PATH>\privato\bedrock-server-<VERSION>\
```

**Important note:** The version number does not matter (1.26.44.3, 1.21.132.3, etc.) — the bot finds it automatically using the `bedrock-server-*` pattern. The two servers may use different or matching versions.

If you do not have the server files yet:
1. Go to https://www.minecraft.net/en-us/download/server/bedrock
2. Click the download button (Windows)
3. Extract the zip into the relevant folder (`bedrock_server` for the public server, `privato` for the private server)

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

### Configuring the Bot Token

1. Extract the project into a local folder (for example, `<PERCORSO_CARTELLA_BOT>`)
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
7. Save the file

### Authorizing the Bot in the Discord Server

1. Torna a https://discord.com/developers/applications
2. Open the application you created
3. Go to "OAuth2" > "URL Generator"
4. Select the "bot" scope
5. Select the permissions: "Send Messages", "Read Messages/View Channels"
6. Copy the generated URL
7. Open it in a browser — you will be asked to select the Discord server
8. Authorize it

The bot should appear offline in your Discord server (it will appear online when you start it).

## Phase 3: Windows Firewall Configuration

This step is **important** to avoid confirmation popups during automatic nightly updates.

1. Open PowerShell as Administrator (search for "PowerShell" in Windows, right-click it, and select "Run as administrator")
2. Paste this command and press Enter:
   ```powershell
   New-NetFirewallRule -DisplayName "<FIREWALL_RULE_NAME>" -Direction Inbound -Action Allow -Program "<SERVER_ROOT_PATH>\*" -Description "Allow Minecraft server executables" -ErrorAction SilentlyContinue
   ```
3. If you receive a message without errors, the rule was created
4. Verify it under Settings > Firewall > Allowed apps - you should see the configured rule in the list

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

The bot is ready. You can test the commands in your Discord server.

## Phase 5: Automatic Bot Startup (Optional)

To start the bot automatically when the PC boots:

### Option A: Use the Included PowerShell File

The `start-bot.vbs` file already contains a script that starts the bot. You can create a shortcut in the Windows Startup folder:

1. Press Windows + R, type `shell:startup`, and press Enter
2. Create a new shortcut to `start-bot.vbs`

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

### Public Commands (available to everyone in the server)

- `!start` — Start the public server
- `!status` — Show the public server status
- `!version` — Show the public server's installed version
- `!ip` — Show the public IP and connection port

### Private Commands (owner only)

- `!startpriv` — Start the private server
- `!stoppriv` — Stop the private server
- `!statuspriv` — Show the private server status
- `!versionpriv` — Show the private server's installed version
- `!ippriv` — Show the private IP and connection port

## Automatic Features

### Automatic Shutdown

When the server is running with no online players, the bot waits 5 minutes and then shuts it down automatically to save resources. If a player reconnects, the timer resets.

### Automatic Crash Restart

If the server crashes unexpectedly, the bot restarts it automatically and sends you a Discord direct message.

### Automatic Nightly Updates

Every day between 02:00 and 05:00, the bot checks whether a new Bedrock server version is available. If an update is available:

1. If players are online, the bot warns them in Minecraft chat and Discord
2. It waits 5 seconds
3. It saves the world and stops the server
4. It downloads the new version
5. It extracts and configures it
6. It copies important data from the old version (world, permissions, resource packs/mods, etc.)
7. It deletes the old version
8. It restarts the server if it was running before

If there is no new version, nothing happens.

## State Persistence

The bot saves server state in a `state.json` file in the same folder. If the bot crashes or the PC restarts:

- If a server was running when the bot stopped, the bot attempts to "adopt" the process and keep it online
- If the server was started manually in Windows (not by the bot), the bot recognizes and manages it, but cannot count players automatically until it stops and restarts it
- All Discord commands remain functional

## Troubleshooting

### "discord.js module not found"

You skipped `npm install`. Run:
```
cd <BOT_FOLDER_PATH>
npm install
```

### "The token is invalid"

The token was copied incorrectly from the Discord Developer Portal, or it has expired. Generate a new token and replace it in `config.js`.

### "Bot offline / Does not respond to commands"

1. Verify that the `node bot.js` process is actually running
2. Verify that the bot is authorized in the Discord server (it should be in the member list)
3. Check that the token in `config.js` is correct
4. Look for errors in the terminal where you started the bot

### "The server does not shut down after 5 minutes"

If the server was started manually in Windows (not by the bot), the bot cannot count players and does not perform an automatic shutdown. Start it through the bot with `!start` or `!startpriv`.

### "The update did not work"

The update requires the path configured in `UPDATE_TMP_DIR` to be accessible (the bot creates it). If you receive permission errors:

1. Run the bot as administrator
2. Verify that the folders are not protected by Windows Defender

### "The first run as administrator does not work"

If the bot cannot start the new server during an update:

1. Did you configure the firewall as described in Phase 3?
2. If you receive a popup, the firewall rule was not created correctly — try the PowerShell command again

## Custom Configuration

If the paths or ports do not suit your setup, you can change them in `config.js`:

```javascript
PUBLIC_SERVER_ROOT: "<PUBLIC_SERVER_ROOT_PATH>\\bedrock_server",  // Change here
PRIVATE_SERVER_ROOT: "<PRIVATE_SERVER_ROOT_PATH>\\privato",      // Change here

GROUP_SERVER_PORT: 19132,    // Public server port
PRIVATE_SERVER_PORT: 19133,  // Private server port

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

Before starting, replace the placeholders in the following files with your machine and bot values. Line numbers refer to this version of the README and scripts.

- `config.js`: lines 9 (`DISCORD_BOT_TOKEN`), 10 (`DISCORD_OWNER_ID`), 17 (`PUBLIC_SERVER_ROOT_PATH`), 18 (`PRIVATE_SERVER_ROOT_PATH`), and 21 (`SERVER_ROOT_PATH` for `UPDATE_TMP_DIR`).
- `start_server.bat`: line 2, `PUBLIC_SERVER_ROOT_PATH`.
- `start_private.bat`: line 2, `PRIVATE_SERVER_ROOT_PATH`.
- `start-bot.ps1`: line 2, `BOT_FOLDER_PATH`.
- `avvia_bot.vbs`: line 4, `BOT_FOLDER_PATH`.
- `README.md`: lines 18, 19, 25, 26, 53, 57, 62, 89, 99, 138-140, 197, 235, and 236 are examples to replace or adapt while following the guide; lines 57 and 62 require `DISCORD_BOT_TOKEN` and `DISCORD_OWNER_ID`, respectively.

Never share the Discord token. If the original token was published or shared, revoke it in the Discord Developer Portal and generate a new one.
