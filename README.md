# Remote Commit Watcher

Automatically checks for new commits on the remote GitHub branch compared to your local branch and notifies you with details.

## Features

- **Automated Polling**: Checks for remote updates at a configurable interval.
- **Detailed Notifications**: improving your workflow by displaying:
  - Committer Name
  - Commit Hash
  - Commit Time
- **Manual Check**: Command to force a check immediately.
- **Configurable**: Customize polling interval and notification behavior.

## Extension Settings

This extension contributes the following settings:

* `remoteCommitWatcher.checkInterval`: Interval in seconds to check for remote commits (default: 30 seconds).
* `remoteCommitWatcher.notificationPersistence`: Controls notification behavior:
    * `auto-dismiss`: Notification disappears automatically after a few seconds (default).
    * `persistent`: Notification stays until you dismiss it (Modal).

## Requirements

- VS Code 1.80.0 or higher.
- A GitHub repository opened in VS Code.

## Known Issues

- Currently only supports repositories hosted on GitHub.
- Requires `git` to be installed and available in the system path.

## Release Notes

### 0.0.1

Inital release with:
- Remote polling.
- Detailed commit notifications.
- Settings for interval and persistence.
