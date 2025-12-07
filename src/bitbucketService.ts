import { GitProvider, RemoteInfo, CommitInfo } from './gitProvider';
import * as https from 'https';
import * as vscode from 'vscode';

export class BitbucketService implements GitProvider {

    parseGitRemote(url: string): RemoteInfo | null {
        // Remove .git suffix if present
        const cleanUrl = url.endsWith('.git') ? url.slice(0, -4) : url;

        // Pattern for SSH: git@bitbucket.org:workspace/repo
        const sshPattern = /git@bitbucket\.org:([^/]+)\/(.+)/;
        const sshMatch = cleanUrl.match(sshPattern);
        if (sshMatch) {
            return { owner: sshMatch[1], repo: sshMatch[2] };
        }

        // Pattern for HTTPS: https://bitbucket.org/workspace/repo
        // Note: bitbucket sometimes includes username in https: https://username@bitbucket.org/workspace/repo
        const httpsPattern = /https:\/\/(?:[^@]+@)?bitbucket\.org\/([^/]+)\/(.+)/;
        const httpsMatch = cleanUrl.match(httpsPattern);
        if (httpsMatch) {
            return { owner: httpsMatch[1], repo: httpsMatch[2] };
        }

        return null;
    }

    async getLatestCommit(owner: string, repo: string, branch: string): Promise<CommitInfo | null> {
        return new Promise((resolve) => {
            const config = vscode.workspace.getConfiguration('remoteCommitWatcher');
            const username = config.get<string>('bitbucketUsername', '');
            const appPassword = config.get<string>('bitbucketAppPassword', '');

            const options: https.RequestOptions = {
                hostname: 'api.bitbucket.org',
                path: `/2.0/repositories/${owner}/${repo}/commits?include=${encodeURIComponent(branch)}&pagelen=1`,
                method: 'GET',
                headers: {
                    'User-Agent': 'VSCode-Remote-Commit-Watcher',
                    'Accept': 'application/json'
                }
            };

            // Basic Auth if credentials are provided
            if (username && appPassword) {
                const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
                if (!options.headers) { options.headers = {}; }
                options.headers['Authorization'] = `Basic ${auth}`;
            }

            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    console.error(`Bitbucket API error: ${res.statusCode} ${res.statusMessage}`);
                    resolve(null);
                    return;
                }

                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        if (jsonData && jsonData.values && jsonData.values.length > 0) {
                            const commit = jsonData.values[0];
                            const date = commit.date; // Bitbucket returns ISO date string

                            // Bitbucket commit.author.user.display_name or commit.author.raw
                            let committerName = 'Unknown';
                            if (commit.author && commit.author.user && commit.author.user.display_name) {
                                committerName = commit.author.user.display_name;
                            } else if (commit.author && commit.author.raw) {
                                committerName = commit.author.raw;
                            }

                            resolve({
                                sha: commit.hash,
                                committerName: committerName,
                                commitDate: date
                            });
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        console.error('Error parsing Bitbucket response:', e);
                        resolve(null);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Error fetching remote commit from Bitbucket:', error);
                resolve(null);
            });

            req.end();
        });
    }
}
