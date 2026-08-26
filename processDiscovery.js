// ============================================================
// PROCESS DISCOVERY
// ============================================================
// On Windows, both servers (public/private) run as
// "bedrock_server.exe": same name, different PIDs. To determine which
// server an existing process belongs to (for example, one started
// manually before the bot), read its ExecutablePath through WMI/CIM:
// it contains the version folder inside PUBLIC_SERVER_ROOT or PRIVATE_SERVER_ROOT.

const { spawn } = require("child_process");
const path = require("path");

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const ps = spawn("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script
        ]);

        let stdout = "";
        let stderr = "";

        ps.stdout.on("data", d => stdout += d.toString());
        ps.stderr.on("data", d => stderr += d.toString());

        ps.on("close", code => {
            if (code !== 0 && !stdout) {
                return reject(new Error(stderr || `PowerShell exited with code ${code}`));
            }
            resolve(stdout.trim());
        });

        ps.on("error", reject);
    });
}

/**
 * Returns an array of { pid, executablePath } for every bedrock_server.exe
 * currently running on the system.
 */
async function findRunningBedrockProcesses() {
    const script =
        "Get-CimInstance Win32_Process -Filter \"Name='bedrock_server.exe'\" " +
        "| Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress";

    let out;
    try {
        out = await runPowerShell(script);
    } catch (err) {
        console.error(" Error while searching for bedrock_server.exe processes:", err.message);
        return [];
    }

    if (!out) return [];

    let parsed;
    try {
        parsed = JSON.parse(out);
    } catch {
        return [];
    }

    // ConvertTo-Json returns a single object (not an array) for one result
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list
        .filter(p => p && p.ProcessId)
        .map(p => ({
            pid: p.ProcessId,
            executablePath: p.ExecutablePath || ""
        }));
}

/**
 * Given the process list, determine which process (if any) belongs
 * to the specified root (case-insensitive path-prefix comparison,
 * tolerant of / versus \).
 */
function matchProcessToRoot(processes, rootDir) {
    const normalizedRoot = path.normalize(rootDir).toLowerCase();

    return processes.find(p => {
        if (!p.executablePath) return false;
        const normalizedExe = path.normalize(p.executablePath).toLowerCase();
        return normalizedExe.startsWith(normalizedRoot);
    }) || null;
}

/**
 * Check whether a PID is still alive (useful for verifying that an
 * "adopted" process from saved state has not actually stopped).
 */
async function isPidAlive(pid) {
    if (!pid) return false;
    const script = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id`;
    try {
        const out = await runPowerShell(script);
        return out.trim() === String(pid);
    } catch {
        return false;
    }
}

module.exports = {
    findRunningBedrockProcesses,
    matchProcessToRoot,
    isPidAlive,
    runPowerShell
};
