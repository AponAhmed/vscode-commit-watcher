
export interface RemoteInfo {
    owner: string;
    repo: string;
}

export interface CommitInfo {
    sha: string;
    committerName: string;
    commitDate: string;
}

export interface GitProvider {
    /**
     * Parses a git remote URL to extract owner and repo name.
     */
    parseGitRemote(url: string): RemoteInfo | null;

    /**
     * Fetches the latest commit details for a given branch.
     */
    getLatestCommit(owner: string, repo: string, branch: string): Promise<CommitInfo | null>;
}
