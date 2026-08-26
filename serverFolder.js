// ============================================================
// SERVER FOLDER UTILS
// ============================================================
// Each server lives inside a "root" (PUBLIC_SERVER_ROOT /
// PRIVATE_SERVER_ROOT) in a subfolder such as
// "bedrock-server-1.21.132.3". This module finds that subfolder
// dynamically, so it works regardless of the installed version.

const fs = require("fs");
const path = require("path");

const VERSION_FOLDER_RE = /^bedrock-server-/i;

/**
 * Returns the full path of the bedrock-server-* subfolder inside
 * rootDir, or null if it does not exist or has not been installed.
 * If more than one exists (which should not normally happen), use
 * the first match and report it to the console.
 */
function findVersionFolder(rootDir) {
    let entries;
    try {
        entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
        return null;
    }

    const matches = entries
        .filter(e => e.isDirectory() && VERSION_FOLDER_RE.test(e.name))
        .map(e => e.name);

    if (matches.length === 0) return null;

    if (matches.length > 1) {
        console.warn(` Found multiple version folders in ${rootDir}: ${matches.join(", ")}. Using "${matches[0]}".`);
    }

    return path.join(rootDir, matches[0]);
}

function extractVersionFromFolderName(folderPath) {
    const name = path.basename(folderPath);
    const match = name.match(/^bedrock-server-(.+)$/i);
    return match ? match[1] : null;
}

module.exports = { findVersionFolder, extractVersionFromFolderName };
