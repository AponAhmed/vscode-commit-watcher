# Git Commit Watcher

A VS Code extension that keeps you updated with the latest remote Git commits without pulling them automatically. Perfect for staying in sync with your team while working on your local branch.

## 🚀 Features

### 🔔 Smart Notifications
*   **Automatic Detection**: Checks for new remote commits periodically (default: every 30 seconds).
*   **Detailed Alerts**: persistent notifications show commit hash, message, author, and full date/time.
*   **Multiple Commits**: Handles multiple unpulled commits, listing up to 3 details in the notification.

### 📊 Status Bar Indicator
*   **Visual Warning**: Displays a yellow warning indicator in the status bar when your local branch is behind.
*   **Committer Names**: Shows exactly who pushed the changes (e.g., `$(cloud-download) Remote: John Doe, Jane Smith`).
*   **Quick Access**: Click the indicator to view full commit details.
*   **Auto-Hide**: Automatically disappears when you pull the changes and are back in sync.

### 🛡️ Safe & Non-Intrusive
*   **No Auto-Pulling**: Uses `git fetch` to update remote tracking branches safely without merging or modifying your working directory.
*   **Logging**: Comprehensive logs available in the "Git Last Commit - Logs" output channel for troubleshooting.

## ⚙️ Configuration

You can customize the check interval in your VS Code settings:

*   **`gitLastCommit.checkInterval`**: Interval in seconds to check for specific remote commits.
    *   *Default*: `30` seconds.

## 🎮 Commands

*   **Git: Show Remote Commit Details** (`gitLastCommit.showRemoteDetails`): Manually check and display information about the latest remote commit.
*   **Git: Start Checking for Remote Commits** (`gitLastCommit.startChecking`): Manually start the periodic background check (Auto-starts by default).
*   **Git: Stop Checking for Remote Commits** (`gitLastCommit.stopChecking`): Stop the background check.

## 📝 Usage

1.  Open a project with a Git repository.
2.  The extension automatically starts checking for remote changes.
3.  If a teammate pushes code to the remote branch you are working on:
    *   A **Notification** appears with the commit details.
    *   A **Status Bar** item appears showing the committer's name.
4.  Perform a `git pull` in your terminal or via VS Code to sync.
5.  The notification stops appearing and the status bar item hides.

## 🔧 troubleshooting

If notifications aren't appearing:
1.  Open the **Output** panel (`Ctrl+Shift+U`).
2.  Select **"Git Last Commit - Logs"** from the dropdown.
3.  Check for any error messages or connection issues.

---
**Enjoy staying in sync!**