import * as vscode from 'vscode';
import { GitHubService } from './githubService';
import { BitbucketService } from './bitbucketService';
import { GitProvider, RemoteInfo } from './gitProvider';

// Define the Git extension API types lightly to avoid adding the full git.d.ts dependency manually if not present
// usage: vscode.extensions.getExtension('vscode.git').exports.getAPI(1)
interface GitExtension {
    getAPI(version: number): GitAPI;
}

interface GitAPI {
    repositories: Repository[];
    readonly state: string;
}

interface Repository {
    state: RepositoryState;
}

interface RepositoryState {
    HEAD: Branch | undefined;
    remotes: Remote[];
}

interface Branch {
    name?: string;
    commit?: string; // SHA
}

interface Remote {
    name: string;
    fetchUrl?: string;
}

let updateInterval: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Remote Commit Watcher is now active!');

    // Command to manually check for updates
    let disposable = vscode.commands.registerCommand('remoteCommitWatcher.checkNow', async () => {
        await checkForUpdates(true);
    });

    context.subscriptions.push(disposable);

    // Initial check
    checkForUpdates();

    // Function to start polling
    const startPolling = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        const config = vscode.workspace.getConfiguration('remoteCommitWatcher');
        const interval = config.get<number>('checkInterval', 30) * 1000;

        console.log(`Starting polling with interval: ${interval}ms`);

        updateInterval = setInterval(() => {
            checkForUpdates();
        }, interval);
    };

    startPolling();

    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('remoteCommitWatcher.checkInterval')) {
            startPolling();
        }
    }));
}

export function deactivate() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
}

async function checkForUpdates(manual: boolean = false) {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension) {
        if (manual) {
            vscode.window.showWarningMessage('Git extension not found.');
        }
        return;
    }

    const git = gitExtension.exports.getAPI(1);
    if (!git.repositories.length) {
        if (manual) {
            vscode.window.showWarningMessage('No Git repositories found.');
        }
        return;
    }

    const repo = git.repositories[0]; // Active repo
    const head = repo.state.HEAD;

    if (!head || !head.name || !head.commit) {
        if (manual) {
            vscode.window.showWarningMessage('No active branch or commit found.');
        }
        return;
    }

    const localBranch = head.name;
    const localSha = head.commit;

    // Find remote URL - assuming 'origin' or the first available remote
    // We could optimize to look for the tracking remote, but for simplicity will use 'origin' or first.
    const origin = repo.state.remotes.find(r => r.name === 'origin') || repo.state.remotes[0];

    if (!origin || !origin.fetchUrl) {
        if (manual) {
            vscode.window.showWarningMessage('No remote configured.');
        }
        return;
    }

    // Determine provider
    const providers: GitProvider[] = [new GitHubService(), new BitbucketService()];
    let provider: GitProvider | undefined;
    let remoteInfo: RemoteInfo | null = null;

    for (const p of providers) {
        remoteInfo = p.parseGitRemote(origin.fetchUrl);
        if (remoteInfo) {
            provider = p;
            break;
        }
    }

    if (!provider || !remoteInfo) {
        if (manual) {
            vscode.window.showWarningMessage(`Could not parse remote URL: ${origin.fetchUrl}. Only GitHub and Bitbucket are supported.`);
        }
        return;
    }

    // Check remote
    const remoteCommit = await provider.getLatestCommit(remoteInfo.owner, remoteInfo.repo, localBranch);

    if (remoteCommit) {
        if (remoteCommit.sha !== localSha) {
            const config = vscode.workspace.getConfiguration('remoteCommitWatcher');
            const persistence = config.get<string>('notificationPersistence', 'auto-dismiss');
            const isPersistent = persistence === 'persistent';

            // Show message
            const message = `New commits on remote branch '${localBranch}'! ` +
                `Committer: ${remoteCommit.committerName}, ` +
                `Hash: ${remoteCommit.sha.substring(0, 7)}, ` +
                `Time: ${new Date(remoteCommit.commitDate).toLocaleString()}. ` +
                `Pull to update.`;

            if (isPersistent) {
                vscode.window.showInformationMessage(message, { modal: true });
            } else {
                vscode.window.showInformationMessage(message);
            }
        } else {
            if (manual) {
                vscode.window.showInformationMessage('Branch is up to date.');
            }
        }
    } else {
        if (manual) {
            vscode.window.showErrorMessage('Failed to fetch remote branch info. Check console for errors.');
        }
    }
}
