import * as vscode from "vscode";
import { exec as _exec } from "child_process";
import { promisify } from "util";
const exec = promisify(_exec);

let checkInterval: NodeJS.Timeout | null = null;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let lastNotifiedHash: string = "";

export function activate(context: vscode.ExtensionContext) {
    // Initialize logging output channel
    outputChannel = vscode.window.createOutputChannel("Git Commit Watcher - Logs");
    log("Extension activated");

    // Initialize Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "gitCommitWatcher.showRemoteDetails";
    context.subscriptions.push(statusBarItem);

    // Command to manually check remote commit
    const disposable = vscode.commands.registerCommand("gitCommitWatcher.showRemoteDetails", async () => {
        log("Command: Show Remote Commit Details - executing");
        await checkAndDisplayRemoteCommit();
    });

    // Command to start periodic checking
    const startCheckingDisposable = vscode.commands.registerCommand("gitCommitWatcher.startChecking", () => {
        log("Command: Start Checking - executing");
        if (checkInterval) {
            log("Already checking for remote commits - skipping");
            vscode.window.showWarningMessage("Already checking for remote commits.");
            return;
        }
        startPeriodicCheck();
        const config = vscode.workspace.getConfiguration("gitCommitWatcher");
        const interval = config.get<number>("checkInterval", 30);
        log(`Started periodic checking every ${interval} seconds`);
        vscode.window.showInformationMessage(`Started checking for remote commits every ${interval} seconds.`);
    });

    // Command to stop periodic checking
    const stopCheckingDisposable = vscode.commands.registerCommand("gitCommitWatcher.stopChecking", () => {
        log("Command: Stop Checking - executing");
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
            log("Stopped periodic checking");
            vscode.window.showInformationMessage("Stopped checking for remote commits.");
        } else {
            log("Periodic checking was not active");
        }
    });

    context.subscriptions.push(disposable, startCheckingDisposable, stopCheckingDisposable);

    // Watch for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("gitCommitWatcher.checkInterval")) {
            log("Configuration changed: restarting periodic check");
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
                startPeriodicCheck();
            }
        }
    }));

    // Auto-start periodic checking on activation
    log("Auto-starting periodic checking");
    startPeriodicCheck();
}

async function checkAndDisplayRemoteCommit() {
    log("Manual check: Starting remote commit details fetch");
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    if (!gitExtension) {
        log("ERROR: Git extension not found");
        vscode.window.showErrorMessage("Git extension not found.");
        return;
    }

    const gitAPI = gitExtension.getAPI(1);
    const repo = gitAPI.repositories[0];
    if (!repo) {
        log("ERROR: No Git repository found in workspace");
        vscode.window.showErrorMessage("No Git repository found.");
        return;
    }

    const cwd = repo.rootUri.fsPath;
    log(`Repository path: ${cwd}`);
    const remote = repo.state.remotes.find((r: { name: string; fetchUrl?: string }) => r.name === "origin") || repo.state.remotes[0];
    if (!remote || !remote.fetchUrl) {
        log("ERROR: Remote origin not found");
        vscode.window.showErrorMessage("Remote origin not found.");
        return;
    }

    const remoteUrl = remote.fetchUrl;
    log(`Remote URL: ${remoteUrl}`);
    const output = vscode.window.createOutputChannel("Remote Commit Details");
    output.clear();
    output.show(true);
    output.appendLine("Fetching remote commit details...");
    output.appendLine(`Remote: ${remoteUrl}`);
    output.appendLine("");

    try {
        // Get current branch name
        const branchRes = await exec(`git rev-parse --abbrev-ref HEAD`, { cwd });
        const branchName = branchRes.stdout.trim();
        log(`Current branch: ${branchName}`);

        // Fetch remote changes (safe - doesn't modify working directory)
        // This is CRITICAL to ensure we have the commit object locally before "git show"
        log("Fetching remote changes (no merge)");
        await exec(`git fetch origin ${branchName}`, { cwd });

        // Get remote HEAD hash
        log("Executing: git rev-parse origin/branch");
        const remoteRes = await exec(`git rev-parse origin/${branchName}`, { cwd });
        const remoteHash = remoteRes.stdout.trim();
        
        if (!remoteHash) {
            log("ERROR: Could not read remote HEAD hash");
            throw new Error("Could not read remote HEAD hash.");
        }
        log(`Remote HEAD hash: ${remoteHash}`);

        output.appendLine(`Remote HEAD Commit: ${remoteHash}`);
        output.appendLine("");

        // Get full commit details WITHOUT fetching
        log("Executing: git show for commit details");
        // Use a custom delimiter that is unlikely to be in the commit message
        const delimiter = "---COMMIT-INFO-SPLIT---";
        const fmt = `%H${delimiter}%an${delimiter}%ae${delimiter}%ad${delimiter}%cn${delimiter}%ce${delimiter}%cd${delimiter}%B`;
        const showRes = await exec(`git show --no-patch --format="${fmt}" ${remoteHash}`, { cwd });
        
        const outputStr = showRes.stdout.trim();
        const parts = outputStr.split(delimiter);
        
        if (parts.length < 8) {
             throw new Error("Failed to parse commit details");
        }

        const hash = parts[0];
        const authorName = parts[1];
        const authorEmail = parts[2];
        const authorDate = parts[3];
        const committerName = parts[4];
        const committerEmail = parts[5];
        const committerDate = parts[6];
        const message = parts.slice(7).join(delimiter).trim(); // Rejoin rest in case delimiter somehow appeared in message (unlikely)
        log(`Fetched commit details for: ${hash}`);

        // Output details
        output.appendLine("=== REMOTE COMMIT DETAILS ===");
        output.appendLine(`Commit Hash: ${hash}`);
        output.appendLine("");
        output.appendLine("Author:");
        output.appendLine(`  Name : ${authorName}`);
        output.appendLine(`  Email: ${authorEmail}`);
        output.appendLine(`  Date : ${authorDate}`);
        output.appendLine("");
        output.appendLine("Committer:");
        output.appendLine(`  Name : ${committerName}`);
        output.appendLine(`  Email: ${committerEmail}`);
        output.appendLine(`  Date : ${committerDate}`);
        output.appendLine("");
        output.appendLine("Message:");
        output.appendLine(message);
        output.appendLine("");

        log("Manual check: Successfully retrieved remote commit details");
        return { hash, authorName, authorEmail, authorDate, message };
    } catch (err: any) {
        log(`ERROR during manual check: ${err.message || String(err)}`);
        output.appendLine("ERROR:");
        output.appendLine(err.message || String(err));
        return null;
    }
}

async function checkForNewCommit(): Promise<Array<{ hash: string; author: string; date: string; message: string }> | null> {
    log("Periodic check: Starting comparison");
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
    if (!gitExtension) {
        log("ERROR: Git extension not found");
        return null;
    }

    const gitAPI = gitExtension.getAPI(1);
    const repo = gitAPI.repositories[0];
    if (!repo) {
        log("ERROR: No Git repository found");
        return null;
    }

    const cwd = repo.rootUri.fsPath;
    const remote = repo.state.remotes.find((r: { name: string; fetchUrl?: string }) => r.name === "origin") || repo.state.remotes[0];
    if (!remote || !remote.fetchUrl) {
        log("ERROR: Remote not found");
        return null;
    }

    try {
        // Get current branch name
        const branchRes = await exec(`git rev-parse --abbrev-ref HEAD`, { cwd });
        const branchName = branchRes.stdout.trim();
        log(`Current branch: ${branchName}`);

        // Fetch remote changes (safe - doesn't modify working directory)
        log("Fetching remote changes (no merge)");
        await exec(`git fetch origin ${branchName}`, { cwd });

        // Get local HEAD hash
        const localRes = await exec(`git rev-parse HEAD`, { cwd });
        const localHash = localRes.stdout.trim();
        log(`Local HEAD: ${localHash}`);

        // Get remote HEAD hash
        const remoteRes = await exec(`git rev-parse origin/${branchName}`, { cwd });
        const remoteHash = remoteRes.stdout.trim();
        log(`Remote HEAD: ${remoteHash}`);

        if (localHash === remoteHash) {
            log("Local and remote are in sync");
            return null; // Already up to date
        }

        log(`Remote is ahead! Getting commit list...`);

        // Get list of commits between local and remote with full date
        const logRes = await exec(`git log --pretty=format:"%H%n%an%n%ad%n%s%n---END---" --date=format:"%Y-%m-%d %H:%M:%S" HEAD..origin/${branchName}`, { cwd });
        const logOutput = logRes.stdout.trim();

        if (!logOutput) {
            log("No commits found between local and remote");
            return null;
        }

        // Parse commits
        const commits: Array<{ hash: string; author: string; date: string; message: string }> = [];
        const commitBlocks = logOutput.split("---END---\n").filter(block => block.trim());
        
        for (const block of commitBlocks) {
            const lines = block.trim().split("\n");
            if (lines.length >= 4) {
                commits.push({
                    hash: lines[0].substring(0, 7),
                    author: lines[1],
                    date: lines[2],
                    message: lines[3]
                });
            }
        }

        log(`Found ${commits.length} unpulled commit(s)`);
        return commits.length > 0 ? commits : null;

    } catch (err: any) {
        log(`ERROR during periodic check: ${err.message || String(err)}`);
        return null;
    }
}

function startPeriodicCheck() {
    log("Starting periodic check routine");
    const config = vscode.workspace.getConfiguration("gitCommitWatcher");
    const intervalSeconds = config.get<number>("checkInterval", 30);
    const intervalMs = intervalSeconds * 1000;

    const checkAndNotify = async () => {
        const commits = await checkForNewCommit();
        if (commits && commits.length > 0) {
            updateStatusBar(commits);
            
            // Only notify if we haven't notified for this specific latest commit yet
            const latestHash = commits[0].hash;
            if (latestHash !== lastNotifiedHash) {
                showCommitNotification(commits);
                lastNotifiedHash = latestHash;
            }
        } else {
             statusBarItem.hide();
             lastNotifiedHash = ""; // Reset when in sync
        }
    };

    // Check immediately on start
    checkAndNotify();

    // Check periodically based on settings
    checkInterval = setInterval(checkAndNotify, intervalMs);
}

function showCommitNotification(commits: Array<{ hash: string; author: string; date: string; message: string }>) {
    const count = commits.length;
    const title = count === 1 
        ? `🔔 1 New Remote Commit Available` 
        : `🔔 ${count} New Remote Commits Available`;
    
    // Build commit details message
    const details = commits.map(c => `${c.hash} - ${c.message} (${c.author}, ${c.date})`).join("\n");
    log(`Showing notification: ${title}\n${details}`);

    // Show notification with commit details
    const message = count === 1
        ? `${commits[0].hash} - ${commits[0].message}\nBy ${commits[0].author} on ${commits[0].date}`
        : `${count} commits:\n${commits.slice(0, 3).map(c => `• ${c.hash} (${c.date}): ${c.message}`).join("\n")}${count > 3 ? '\n...and more' : ''}`;

    vscode.window.showInformationMessage(
        `${title}\n\n${message}`,
        { modal: true }, // Make notification persistent/modal
        "View All Details"
    ).then(selection => {
        if (selection === "View All Details") {
            vscode.commands.executeCommand("gitCommitWatcher.showRemoteDetails");
        }
    });
}

function updateStatusBar(commits: Array<{ hash: string; author: string; date: string; message: string }>) {
    if (!commits || commits.length === 0) {
        statusBarItem.hide();
        return;
    }

    // Get unique authors
    const authors = Array.from(new Set(commits.map(c => c.author)));
    const authorsText = authors.join(", ");
    
    statusBarItem.text = `$(cloud-download) Remote: ${authorsText}`;
    statusBarItem.tooltip = `${commits.length} new remote commits available\nClick to view details`;
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground"); // Yellow background
    statusBarItem.show();
}

// Helper function to log messages
function log(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    outputChannel.appendLine(logMessage);
    console.log(logMessage);
}

export function deactivate() {
    log("Extension deactivating");
    if (checkInterval) {
        clearInterval(checkInterval);
    }
}