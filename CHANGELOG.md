# Change Log

All notable changes to the "Git Commit Watcher" extension will be documented in this file.

## [1.2.0] - 2025-12-11
- **Renamed** extension to "Git Commit Watcher".
- **Auto-Start**: Extension now starts automatically on VS Code startup.
- **Persistent Notifications**: Alerts are now modal and persistent until dismissed.
- **Icon**: Added official extension icon.
- **Optimization**: Logic updated to alert only once per unique commit hash.

## [1.1.0] - 2025-12-11
- **Status Bar**: Added yellow warning indicator when local branch is behind.
- **Details**: Added Author and Date/Time to notification messages.
- **Settings**: Added `gitCommitWatcher.checkInterval` configuration.

## [1.0.0] - 2025-12-11
- Initial release.
- Background monitoring of remote commits.
- Notification support.
