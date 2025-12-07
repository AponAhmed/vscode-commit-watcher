import { authentication, window } from 'vscode';
import * as https from 'https';
import { GitProvider, RemoteInfo, CommitInfo } from './gitProvider';

export class GitHubService implements GitProvider {

    /**
     * Parses a git remote URL to extract owner and repo name.
     * Supports HTTPS and SSH formats.
     */
    parseGitRemote(url: string): RemoteInfo | null {
        // Remove .git suffix if present
        const cleanUrl = url.endsWith('.git') ? url.slice(0, -4) : url;

        // Pattern for SSH: git@github.com:owner/repo
        const sshPattern = /git@github\.com:([^/]+)\/(.+)/;
        const sshMatch = cleanUrl.match(sshPattern);
        if (sshMatch) {
            return { owner: sshMatch[1], repo: sshMatch[2] };
        }

        // Pattern for HTTPS: https://github.com/owner/repo
        const httpsPattern = /https:\/\/github\.com\/([^/]+)\/(.+)/;
        const httpsMatch = cleanUrl.match(httpsPattern);
        if (httpsMatch) {
            return { owner: httpsMatch[1], repo: httpsMatch[2] };
        }

        return null;
    }

    /**
     * Fetches the latest commit details for a given branch on GitHub.
     */
    async getLatestCommit(owner: string, repo: string, branch: string): Promise<CommitInfo | null> {
        return new Promise((resolve) => {
            const options: https.RequestOptions = {
                hostname: 'api.github.com',
                path: `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
                method: 'GET',
                headers: {
                    'User-Agent': 'VSCode-Remote-Commit-Watcher',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            // We need to retrieve the token to add to headers if available
            authentication.getSession('github', ['repo'], { createIfNone: true }).then(session => {
                if (session) {
                    // Start request after getting token
                    if (!options.headers) { options.headers = {}; }
                    options.headers['Authorization'] = `Bearer ${session.accessToken}`;

                    const req = https.request(options, (res) => {
                        if (res.statusCode !== 200) {
                            console.error(`GitHub API error: ${res.statusCode} ${res.statusMessage}`);
                            resolve(null);
                            return;
                        }

                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });

                        res.on('end', () => {
                            try {
                                const jsonData = JSON.parse(data) as any[];
                                if (jsonData && jsonData.length > 0 && jsonData[0].sha) {
                                    const commit = jsonData[0];
                                    resolve({
                                        sha: commit.sha,
                                        committerName: commit.commit.committer.name,
                                        commitDate: commit.commit.committer.date
                                    });
                                } else {
                                    resolve(null);
                                }
                            } catch (e) {
                                console.error('Error parsing GitHub response:', e);
                                resolve(null);
                            }
                        });
                    });

                    req.on('error', (error) => {
                        console.error('Error fetching remote commit:', error);
                        resolve(null);
                    });

                    req.end();

                } else {
                    // No session
                    resolve(null);
                }
            });
        });
    }
}
