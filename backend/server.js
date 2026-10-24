require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Rate limiting: 100 requests per 15 minutes per IP ───
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI request limit reached. Try again in an hour.' }
});

// ─── CORS: restrict to known origins ───
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : ['https://git-city-iota.vercel.app'])
    : ['http://localhost:5173', 'http://localhost:3000']; // Allow local dev

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Normalize origin (remove trailing slash)
        const normalized = origin.replace(/\/$/, '');
        const normalizedAllowed = allowedOrigins.map(o => o.replace(/\/$/, ''));

        if (normalizedAllowed.indexOf(normalized) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(limiter);
app.use(express.json({ limit: '512kb' }));

// Include repository identity with each request so users cannot overwrite
// one another's selected repository on this shared server.
app.use('/repo', (req, res, next) => {
    if (req.path === '/load') return next();
    const { owner, repo } = req.method === 'GET' ? req.query : req.body || {};
    if (typeof owner !== 'string' || typeof repo !== 'string' ||
        !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
        return res.status(400).json({ error: 'A valid owner and repo are required.' });
    }
    req.repoContext = { owner, repo };
    next();
});

const GITHUB_API = 'https://api.github.com';

// ─── Security scan orchestration ──────────────────────────────────────────────
const securityScans = new Map();
const SECURITY_SCAN_TTL_MS = 60 * 60 * 1000;
const GITCITY_REPOSITORY = process.env.GITCITY_REPOSITORY || 'ChaitanyaBhusari01/GIT-CITY';
const CODEQL_WORKFLOW_FILE = 'codeql-scan.yml';

function securityActionHeaders() {
    const token = process.env.GITHUB_ACTIONS_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('Set GITHUB_ACTIONS_TOKEN (Actions: write) or a GITHUB_TOKEN with Actions: write on the GitCity repository.');
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'GitCity'
    };
}

function securityScanPayload(scan) {
    return {
        scan_id: scan.scanId,
        status: scan.status,
        repository_id: `${scan.owner}/${scan.repo}`,
        commit_sha: scan.commitSha,
        workflow_run_id: scan.workflowRunId,
        workflow_url: scan.workflowUrl,
        finding_count: scan.findingCount ?? null,
        findings: scan.findings ?? [],
        error: scan.error ?? null
    };
}

function securityScanError(error) {
    const detail = error.response?.data?.detail;
    const apiMessage = error.response?.data?.message;
    return (typeof detail === 'string' && detail) ||
        (typeof apiMessage === 'string' && apiMessage) ||
        error.response?.data?.error?.message ||
        error.message ||
        'Unknown security scan error.';
}

app.post('/security/scan', aiLimiter, async (req, res) => {
    try {
        const { owner, repo, commit_sha: commitSha } = req.body || {};

        if (typeof owner !== 'string' || typeof repo !== 'string' ||
            !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) ||
            !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
            return res.status(400).json({ error: 'A valid owner and repository name are required.' });
        }
        if (typeof commitSha !== 'string' || !/^[A-Fa-f0-9]{40,64}$/.test(commitSha)) {
            return res.status(400).json({ error: 'A valid full commit SHA is required.' });
        }
        if (!process.env.RAG_SERVICE_TOKEN) {
            return res.status(503).json({ error: 'Set RAG_SERVICE_TOKEN in backend/.env and ragservice/.env before running scans.' });
        }

        const actionsHeaders = securityActionHeaders();
        const repositoryResponse = await axios.get(
            `${GITHUB_API}/repos/${owner}/${repo}`,
            { headers: ghHeaders(), timeout: 15000 }
        );
        if (repositoryResponse.data.private) {
            return res.status(400).json({ error: 'Security scans currently support public GitHub repositories only.' });
        }

        for (const [existingId, existingScan] of securityScans.entries()) {
            if (Date.now() - existingScan.createdAt > SECURITY_SCAN_TTL_MS) {
                securityScans.delete(existingId);
            }
        }

        const scanId = randomUUID();
        const workflowRef = process.env.CODEQL_WORKFLOW_REF || 'main';
        const dispatchUrl = `${GITHUB_API}/repos/${GITCITY_REPOSITORY}/actions/workflows/${CODEQL_WORKFLOW_FILE}/dispatches?return_run_details=true`;
        const dispatchResponse = await axios.post(dispatchUrl, {
            ref: workflowRef,
            inputs: {
                repository: `${owner}/${repo}`,
                commit_sha: commitSha.toLowerCase(),
                scan_id: scanId
            }
        }, {
            headers: actionsHeaders,
            timeout: 20000
        });

        const workflowRunId = Number(dispatchResponse.data?.workflow_run_id);
        if (!Number.isSafeInteger(workflowRunId) || workflowRunId <= 0) {
            return res.status(502).json({
                error: 'GitHub did not return a workflow run ID. Confirm the workflow_dispatch workflow is available on the configured ref.'
            });
        }

        const scan = {
            scanId,
            owner,
            repo,
            commitSha: commitSha.toLowerCase(),
            workflowRunId,
            workflowUrl: dispatchResponse.data?.html_url || null,
            status: 'queued',
            findings: [],
            findingCount: null,
            error: null,
            forwarding: false,
            createdAt: Date.now()
        };
        securityScans.set(scanId, scan);

        return res.status(202).json(securityScanPayload(scan));
    } catch (error) {
        console.error('[SECURITY SCAN] Dispatch failed:', securityScanError(error));
        const githubStatus = error.response?.status;
        const status = githubStatus && githubStatus >= 400 && githubStatus < 500 ? githubStatus : 502;
        return res.status(status).json({ error: securityScanError(error) });
    }
});

app.get('/security/scan/:scanId', async (req, res) => {
    const scan = securityScans.get(req.params.scanId);
    if (!scan) {
        return res.status(404).json({ error: 'Security scan not found or expired. Start a new scan.' });
    }
    if (scan.status === 'completed' || scan.status === 'failed' || scan.forwarding) {
        return res.json(securityScanPayload(scan));
    }

    try {
        const headers = securityActionHeaders();
        const runResponse = await axios.get(
            `${GITHUB_API}/repos/${GITCITY_REPOSITORY}/actions/runs/${scan.workflowRunId}`,
            { headers, timeout: 15000 }
        );
        const run = runResponse.data;

        if (run.status !== 'completed') {
            scan.status = run.status === 'in_progress' ? 'in_progress' : 'queued';
            return res.json(securityScanPayload(scan));
        }

        if (run.conclusion !== 'success') {
            scan.status = 'failed';
            scan.error = `CodeQL workflow ${run.conclusion || 'failed'}.`;
            return res.json(securityScanPayload(scan));
        }

        scan.status = 'processing_report';
        scan.forwarding = true;
        try {
            const artifactResponse = await axios.get(
                `${GITHUB_API}/repos/${GITCITY_REPOSITORY}/actions/runs/${scan.workflowRunId}/artifacts`,
                { headers, timeout: 15000 }
            );
            const artifact = (artifactResponse.data.artifacts || []).find(
                item => item.name === 'codeql-security-report' && !item.expired
            );
            if (!artifact) {
                throw new Error('The CodeQL workflow completed but its SARIF artifact was not found.');
            }

            const artifactResponseZip = await axios.get(
                `${GITHUB_API}/repos/${GITCITY_REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
                {
                    headers,
                    responseType: 'arraybuffer',
                    timeout: 90000,
                    maxContentLength: 50 * 1024 * 1024
                }
            );
            const ragBaseUrl = (process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
            const ragResponse = await axios.post(
                `${ragBaseUrl}/security/scan`,
                Buffer.from(artifactResponseZip.data),
                {
                    params: {
                        repository_id: `${scan.owner}/${scan.repo}`,
                        commit_sha: scan.commitSha,
                        top_k: 6
                    },
                    headers: {
                        'Content-Type': 'application/zip',
                        'Authorization': `Bearer ${process.env.RAG_SERVICE_TOKEN}`
                    },
                    timeout: 120000,
                    maxBodyLength: 50 * 1024 * 1024,
                    maxContentLength: 50 * 1024 * 1024
                }
            );

            scan.findings = Array.isArray(ragResponse.data.findings) ? ragResponse.data.findings : [];
            scan.findingCount = Number.isInteger(ragResponse.data.finding_count)
                ? ragResponse.data.finding_count
                : scan.findings.length;
            scan.status = 'completed';
            scan.error = null;
        } catch (error) {
            scan.status = 'failed';
            scan.error = securityScanError(error);
            console.error('[SECURITY SCAN] Report forwarding failed:', scan.error);
        } finally {
            scan.forwarding = false;
        }

        return res.json(securityScanPayload(scan));
    } catch (error) {
        console.error('[SECURITY SCAN] Status check failed:', securityScanError(error));
        return res.status(502).json({ error: securityScanError(error) });
    }
});
// ──────────────────────────────────────────────────────────────────────────────


// ─── In-memory cache with 5-minute TTL and size limit ───────────────────────────────────────
const cache = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 1000; // Limit total cache entries to prevent memory growth

function getCacheKey(owner, repo) {
    return `${owner}/${repo}`;
}

function getCache(owner, repo, field) {
    const key = getCacheKey(owner, repo);
    const entry = cache[key]?.[field];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[CACHE HIT] ${key} → ${field}`);
        }
        return entry.data;
    }
    return null;
}

function setCache(owner, repo, field, data) {
    const key = getCacheKey(owner, repo);
    if (!cache[key]) cache[key] = {};

    // Enforce cache size limit
    const totalEntries = Object.keys(cache).reduce((sum, k) => sum + Object.keys(cache[k]).length, 0);
    if (totalEntries >= MAX_CACHE_ENTRIES) {
        // Simple eviction: remove oldest entry
        const oldestKey = Object.keys(cache).sort((a, b) => {
            const aTime = Math.min(...Object.values(cache[a]).map(e => e.timestamp));
            const bTime = Math.min(...Object.values(cache[b]).map(e => e.timestamp));
            return aTime - bTime;
        })[0];
        delete cache[oldestKey];
    }

    cache[key][field] = { data, timestamp: Date.now() };
}

function clearCacheForRepo(owner, repo) {
    const key = getCacheKey(owner, repo);
    delete cache[key];
}

// ─── Dependency Parsing Cache ───────────────────────────────────────────────
// We keep a separate minimal cache for parsed dependencies to enforce rate limits
// limit parsing to max 100 files per repo.
const depCache = {};

function getDepCache(owner, repo, filePath) {
    const key = getCacheKey(owner, repo);
    return depCache[key]?.files?.[filePath];
}

function setDepCache(owner, repo, filePath, deps) {
    const key = getCacheKey(owner, repo);
    if (!depCache[key]) depCache[key] = { files: {}, parseCount: 0 };
    depCache[key].files[filePath] = deps;
}

function canParseFile(owner, repo) {
    const key = getCacheKey(owner, repo);
    if (!depCache[key]) depCache[key] = { files: {}, parseCount: 0 };
    return depCache[key].parseCount < 100;
}

function incrementParseCount(owner, repo) {
    const key = getCacheKey(owner, repo);
    if (depCache[key]) depCache[key].parseCount++;
}

function clearDepCacheForRepo(owner, repo) {
    const key = getCacheKey(owner, repo);
    delete depCache[key];
}
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────

// Helper: build GitHub API headers (supports optional token for higher rate limits)
const ghHeaders = () => {
    const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'GitCity' };
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
};

const getGitHubErrorMessage = (error) => {
    const response = error.response;
    const message = response?.data?.message || error.message;
    const remaining = Number(response?.headers?.['x-ratelimit-remaining']);
    const isRateLimit = response?.status === 429 ||
        (response?.status === 403 && (remaining === 0 || /rate limit/i.test(message || '')));

    if (!isRateLimit) return message;

    const retryAfter = Number(response?.headers?.['retry-after']);
    const resetAt = Number(response?.headers?.['x-ratelimit-reset']);
    const retryMessage = retryAfter > 0
        ? ` Retry after ${retryAfter} seconds.`
        : resetAt > 0
            ? ` Try again after ${new Date(resetAt * 1000).toLocaleTimeString()}.`
            : ' Wait a minute before trying again.';
    const tokenMessage = process.env.GITHUB_TOKEN
        ? ''
        : ' Add GITHUB_TOKEN to backend/.env to use the higher authenticated limit.';

    return `GitHub API rate limit reached.${retryMessage}${tokenMessage}`;
};

// Helper: extract owner/repo from GitHub URL
const parseGitHubUrl = (url) => {
    // Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo'); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
        throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo');
    const owner = parts[0];
    let repoName = parts[1];
    if (repoName.endsWith('.git')) {
        repoName = repoName.slice(0, -4);
    }
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repoName)) {
        throw new Error('Invalid GitHub owner or repository name.');
    }
    return { owner, repo: repoName };
};

// Helper: resolve & cache default branch SHA (reused by /repo/tree and prefetched at load)
async function resolveDefaultBranchSha(owner, repo) {
    // Check cache first
    const cachedSha = getCache(owner, repo, 'defaultBranchSha');
    if (cachedSha) return cachedSha;

    const repoInfo = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: ghHeaders() });
    const defaultBranch = repoInfo.data.default_branch;
    setCache(owner, repo, 'defaultBranch', defaultBranch);

    const branchInfo = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/branches/${defaultBranch}`, { headers: ghHeaders() });
    const sha = branchInfo.data.commit.sha;
    setCache(owner, repo, 'defaultBranchSha', sha);

    return sha;
}

// POST /repo/load
// Body: { "url": "https://github.com/user/repo" }
app.post('/repo/load', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) throw new Error('URL is required');

        const { owner, repo } = parseGitHubUrl(url);

        res.json({ success: true, owner, repo, message: `Repository ${owner}/${repo} loaded.` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// GET /repo/tree
// Returns the full recursive file tree for the default branch
app.get('/repo/tree', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const sha = req.query.sha || 'HEAD';

        // Build a cache field that includes the sha
        const cacheField = `tree:${sha}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        // Resolve tree SHA
        let treeSha = sha;
        if (sha === 'HEAD') {
            treeSha = await resolveDefaultBranchSha(owner, repo);
        }

        // Get the tree recursively (single API call for the full tree)
        const treeRes = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}`, {
            params: { recursive: 1 },
            headers: ghHeaders()
        });

        const files = treeRes.data.tree
            .filter(item => item.type === 'blob')
            .map(item => ({
                path: item.path,
                size: item.size || 0,
                type: 'blob',
                sha: item.sha
            }));

        setCache(owner, repo, cacheField, files);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (${files.length} files)`);

        res.json(files);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/commits
// Returns the recent commits (paginated; default 100)
app.get('/repo/commits', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const page = req.query.page || 1;
        const per_page = req.query.per_page || 100;

        const cacheField = `commits:${page}:${per_page}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
            params: { page, per_page },
            headers: ghHeaders()
        });

        const commits = response.data.map(c => ({
            hash: c.sha,
            message: c.commit.message,
            date: c.commit.author.date,
            author_name: c.commit.author.name,
            author_email: c.commit.author.email,
            parents: (c.parents || []).map(parent => parent.sha)
        }));

        setCache(owner, repo, cacheField, commits);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (${commits.length} commits)`);

        res.json(commits);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file-stats
// Computes real commit counts and top contributor per file by fetching details for the last 20 commits
app.get('/repo/file-stats', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded.');

        const cacheField = 'file-stats:5';
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        // Keep this optional endpoint lightweight; loading the main city does not call it.
        const commitsRes = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
            params: { per_page: 5 },
            headers: ghHeaders()
        });

        // Fetch sequentially to avoid burst traffic and secondary rate limits.
        const commitDetails = [];
        for (const commit of commitsRes.data) {
            try {
                const detail = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits/${commit.sha}`, { headers: ghHeaders() });
                commitDetails.push(detail.data);
            } catch {
                commitDetails.push(null);
            }
        }

        const fileStats = {};

        commitDetails.forEach(detail => {
            if (!detail || !detail.files) return;
            const authorName = detail.commit?.author?.name || 'Unknown';

            detail.files.forEach(f => {
                if (!fileStats[f.filename]) {
                    fileStats[f.filename] = { commitCount: 0, authors: {} };
                }
                const stat = fileStats[f.filename];
                stat.commitCount += 1;
                stat.authors[authorName] = (stat.authors[authorName] || 0) + 1;
            });
        });

        // Resolve top contributor per file
        const result = {};
        for (const [filepath, stat] of Object.entries(fileStats)) {
            const topAuthor = Object.entries(stat.authors)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

            result[filepath] = {
                commitCount: stat.commitCount,
                topContributor: topAuthor
            };
        }

        setCache(owner, repo, cacheField, result);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (Stats for ${Object.keys(result).length} files)`);

        res.json(result);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/contributors
app.get('/repo/contributors', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const cached = getCache(owner, repo, 'contributors');
        if (cached) return res.json(cached);

        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contributors`, {
            params: { per_page: 30 },
            headers: ghHeaders()
        });

        const contributors = response.data.map(c => ({
            name: c.login,
            commits: c.contributions,
            avatar: c.avatar_url
        }));

        setCache(owner, repo, 'contributors', contributors);
        console.log(`[CACHE SET] ${owner}/${repo} → contributors (${contributors.length} contributors)`);

        res.json(contributors);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/branches
app.get('/repo/branches', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const cached = getCache(owner, repo, 'branches');
        if (cached) return res.json(cached);

        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/branches`, {
            params: { per_page: 100 },
            headers: ghHeaders()
        });

        const branches = response.data.map(b => ({
            name: b.name,
            sha: b.commit.sha,
            protected: b.protected
        }));

        setCache(owner, repo, 'branches', branches);
        console.log(`[CACHE SET] ${owner}/${repo} → branches (${branches.length} branches)`);

        res.json(branches);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file-history?path=src/index.js
app.get('/repo/file-history', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const filePath = req.query.path;
        if (!filePath) throw new Error('File path is required');

        const cacheField = `fileHistory:${filePath}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
            params: { path: filePath, per_page: 20 },
            headers: ghHeaders()
        });

        const commits = response.data.map(c => ({
            hash: c.sha,
            message: c.commit.message,
            date: c.commit.author.date,
            author_name: c.commit.author.name,
            author_email: c.commit.author.email,
            avatar: c.author?.avatar_url || null
        }));

        setCache(owner, repo, cacheField, commits);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField}`);

        res.json(commits);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file
// Fetches the raw content of a specific file with syntax highlighting support.
app.get('/repo/file', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const filePath = req.query.path;
        if (!filePath) throw new Error('File path is required');

        // Security check: Only allow specific text file extensions
        const allowedExtensions = ['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'txt', 'css', 'html', 'yml', 'yaml'];
        const extension = filePath.split('.').pop()?.toLowerCase();
        if (!allowedExtensions.includes(extension)) {
            return res.status(400).json({ error: `File type .${extension} is not supported for viewing.` });
        }

        const cacheField = `file:${filePath}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) {
            console.log(`[FILE CACHE HIT] ${filePath}`);
            return res.json(cached);
        }

        // Fetch file content from GitHub using Contents API
        // Added 5-second timeout for safety
        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, {
            headers: ghHeaders(),
            timeout: 5000
        });

        const data = response.data;

        // Ensure it's a file
        if (data.type !== 'file') {
            throw new Error('Requested path is not a file.');
        }

        // Cap file size at 200kb (204800 bytes)
        const FILE_SIZE_LIMIT = 200 * 1024;
        if (data.size > FILE_SIZE_LIMIT) {
            return res.status(400).json({ error: `File is too large (${(data.size / 1024).toFixed(1)}kb). Maximum allowed size is 200kb.` });
        }

        // Decode base64 content
        let content = '';
        if (data.encoding === 'base64') {
            content = Buffer.from(data.content, 'base64').toString('utf-8');
        } else {
            content = data.content;
        }

        const result = {
            path: data.path,
            size: data.size,
            content: content
        };

        setCache(owner, repo, cacheField, result);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (${data.size} bytes)`);

        res.json(result);
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Request to GitHub API timed out (5s limit).' });
        }
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 500).json({ error: msg });
    }
});

// Helper: Normalize POSIX path (resolve . and ..)
function normalizePosixPath(base, relative) {
    // If it's not a relative path, assume it's external and return null (we ignore it)
    if (!relative.startsWith('.')) return null;

    const baseParts = base.split('/');
    baseParts.pop(); // Remove the filename to get directory

    const relParts = relative.split('/');

    for (const part of relParts) {
        if (part === '.') continue;
        if (part === '..') {
            if (baseParts.length > 0) {
                baseParts.pop();
            }
        } else {
            baseParts.push(part);
        }
    }

    return baseParts.join('/');
}

// GET /repo/dependencies
// Returns local dependencies for a given JS/TS file inside the repo
app.get('/repo/dependencies', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded.');

        const filePath = req.query.path;
        if (!filePath) throw new Error('File path required.');

        // 1. Only parse JS / TS / JSX / TSX
        if (!/\.(jsx?|tsx?)$/.test(filePath)) {
            return res.json([]);
        }

        // 2. Check Dependency Cache
        const cachedDeps = getDepCache(owner, repo, filePath);
        if (cachedDeps) {
            console.log(`[DEP CACHE HIT] ${filePath} -> ${cachedDeps.length} deps`);
            return res.json(cachedDeps);
        }

        // 3. Check Parse Limit
        if (!canParseFile(owner, repo)) {
            console.warn(`[DEP LIMIT] Skipping parse for ${filePath} (Limit 100 reached)`);
            return res.json([]);
        }

        incrementParseCount(owner, repo);

        // 4. Need to fetch the tree cache to resolve against actual files
        // We assume /repo/tree was called previously. We'll look for HEAD or default tree.
        const sha = await resolveDefaultBranchSha(owner, repo);
        const cachedTreeFiles = getCache(owner, repo, `tree:${sha}`);

        let validPaths = new Set();
        if (cachedTreeFiles) {
            cachedTreeFiles.forEach(f => validPaths.add(f.path));
        } else {
            // Fallback, if tree not cached, just proceed but resolution might be blind.
            console.warn('[DEP PARSER] Tree not found in cache. Resolving blindly.');
        }

        // 5. Fetch file content from GitHub (Raw)
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${filePath}`;
        console.log(`[DEP PARSE INFO] Fetching URL: ${rawUrl}`);
        const response = await axios.get(rawUrl, {
            headers: {
                ...ghHeaders(),
                'Accept': 'application/vnd.github.v3.raw'
            }
        });

        const content = response.data;
        if (typeof content !== 'string') {
            setDepCache(owner, repo, filePath, []);
            return res.json([]);
        }

        // 6. Regex Parsing
        const imports = new Set();

        // Matches variations of: import ... from '...' OR import '...' OR export ... from '...' OR require('...')
        // We capture what's inside the quotes.
        const regexes = [
            /import\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
            /export\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
            /require\s*\(\s*['"]([^"']+)['"]\s*\)/g
        ];

        let match;
        for (const regex of regexes) {
            while ((match = regex.exec(content)) !== null) {
                const depPath = match[1];
                // Only care about relative imports (files within the repo)
                if (depPath.startsWith('.')) {
                    imports.add(depPath);
                }
            }
        }

        // 7. Resolve relative paths against the tree
        const resolvedDeps = [];
        for (const reqPath of imports) {
            const normalizedBase = normalizePosixPath(filePath, reqPath);
            if (!normalizedBase) continue;

            // Try exact match or with extensions
            const possibleExtensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

            let found = false;
            for (const ext of possibleExtensions) {
                const testPath = normalizedBase + ext;
                // If we have a tree, verify existence. Else just assume it works.
                if (!validPaths.size || validPaths.has(testPath)) {
                    resolvedDeps.push(testPath);
                    found = true;
                    break;
                }
            }
        }

        const finalDeps = [...new Set(resolvedDeps)];
        setDepCache(owner, repo, filePath, finalDeps);
        console.log(`[DEP PARSE] ${filePath} -> parsed ${finalDeps.length} relative deps (Count: ${getCacheKey(owner, repo)} - ${depCache[getCacheKey(owner, repo)].parseCount}/100)`);

        res.json(finalDeps);

    } catch (error) {
        console.error(`[DEP PARSE ERROR] ${error.message}`);
        // Default to empty array on error (e.g., 404 large file, etc)
        setDepCache(req.repoContext.owner, req.repoContext.repo, req.query.path, []);
        res.json([]);
    }
});

// GET /repo/commit-graph
// Returns commits with parent SHA references for graph visualization
app.get('/repo/commit-graph', async (req, res) => {
    try {
        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const per_page = Math.min(Number(req.query.per_page) || 100, 200);

        const cacheField = `commit-graph:${per_page}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        const cachedCommits = getCache(owner, repo, `commits:1:${per_page}`);
        if (cachedCommits) {
            const graphData = cachedCommits.map(commit => ({
                hash: commit.hash,
                message: commit.message,
                date: commit.date,
                author_name: commit.author_name,
                author_email: commit.author_email,
                parents: commit.parents || []
            }));
            setCache(owner, repo, cacheField, graphData);
            return res.json(graphData);
        }

        const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
            params: { per_page },
            headers: ghHeaders()
        });

        const graphData = response.data.map(c => ({
            hash: c.sha,
            message: c.commit.message,
            date: c.commit.author.date,
            author_name: c.commit.author.name,
            author_email: c.commit.author.email,
            parents: (c.parents || []).map(p => p.sha)
        }));

        setCache(owner, repo, cacheField, graphData);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (${graphData.length} commits with parents)`);

        res.json(graphData);
    } catch (error) {
        const msg = getGitHubErrorMessage(error);
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// POST /repo/ai-summary
// Proxies to OpenRouter to generate a narrative summary of the repository
app.post('/repo/ai-summary', aiLimiter, async (req, res) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to backend/.env' });
        }

        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded.');

        const stats = req.body;
        const summaryFields = ['topContributors', 'latestCommit', 'oldestCommit', 'fileTypes'];
        for (const field of summaryFields) {
            if (typeof stats[field] === 'string') stats[field] = stats[field].slice(0, 500);
        }

        const prompt = `You are a senior developer analyzing a GitHub repository. Give a concise, insightful summary (3-5 paragraphs) of this repository based on the following statistics:

Repository: ${owner}/${repo}
Total commits analyzed: ${stats.totalCommits || 'N/A'}
Total files: ${stats.totalFiles || 'N/A'}
Total contributors: ${stats.totalContributors || 'N/A'}
Branches: ${stats.totalBranches || 'N/A'}
Top contributors: ${stats.topContributors || 'N/A'}
Most recent commit: ${stats.latestCommit || 'N/A'}
Oldest commit analyzed: ${stats.oldestCommit || 'N/A'}
File types present: ${stats.fileTypes || 'N/A'}

Provide observations about:
1. The project's purpose and tech stack (inferred from file types and repo name)
2. Development activity and team dynamics
3. Code organization and project maturity
4. Notable patterns or insights

Keep it conversational and insightful. Use emoji sparingly for visual appeal.`;

        const openRouterRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'anthropic/claude-3-haiku',
            messages: [
                { role: 'user', content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://gitcity.app',
                'X-Title': 'GitCity'
            }
        });

        const summary = openRouterRes.data.choices[0].message.content;
        res.json({ summary });
    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        console.error('[AI SUMMARY] Error:', msg);
        res.status(error.response?.status || 500).json({ error: msg });
    }
});

// POST /repo/ai-chat
// Handles conversational AI chat about a specific file's code
// Body: { filePath: string, fileContent: string, messages: [{role, content}] }
app.post('/repo/ai-chat', aiLimiter, async (req, res) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to backend/.env' });
        }

        const { owner, repo } = req.repoContext;
        if (!owner) throw new Error('No repository loaded.');

        const { filePath, fileContent, messages } = req.body;
        if (!filePath || !fileContent) {
            throw new Error('filePath and fileContent are required.');
        }
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error('messages array is required and must not be empty.');
        }
        if (typeof fileContent !== 'string' || fileContent.length > 100000 ||
            typeof filePath !== 'string' || filePath.length > 500 || messages.length > 20 ||
            messages.some(m => !m || !['user', 'assistant'].includes(m.role) ||
                typeof m.content !== 'string' || m.content.length > 4000)) {
            return res.status(400).json({ error: 'AI chat input is too large or invalid.' });
        }

        // Build system prompt with file context
        const systemPrompt = `You are an expert code assistant embedded in GitCity, a 3D code visualization app. You are analyzing a file from the repository ${owner}/${repo}.

File: ${filePath}
Repository: ${owner}/${repo}

Here is the full content of the file:
\`\`\`
${fileContent}
\`\`\`

Rules:
- You have the complete file content above. Use it to answer questions accurately.
- Be concise but thorough. Use bullet points for clarity.
- When referencing code, use inline code formatting.
- If the user asks about something not in this file, say so clearly.
- Use markdown formatting in your responses.
- Be friendly and helpful.`;

        // Build messages for the API
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const openRouterRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'anthropic/claude-3-haiku',
            messages: apiMessages,
            max_tokens: 1200,
            temperature: 0.5
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://gitcity.app',
                'X-Title': 'GitCity AI Chat'
            },
            timeout: 30000
        });

        const response = openRouterRes.data.choices[0].message.content;
        res.json({ response });
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'AI request timed out (30s limit).' });
        }
        const msg = error.response?.data?.error?.message || error.message;
        console.error('[AI CHAT] Error:', msg);
        res.status(error.response?.status || 500).json({ error: msg });
    }
});

app.listen(PORT, async () => {
    console.log(`Backend server running on http://localhost:${PORT}`);

    // ─── Startup: verify GitHub token & show rate limit ───
    if (process.env.GITHUB_TOKEN) {
        console.log('[AUTH] GITHUB_TOKEN detected, verifying...');
        try {
            const rl = await axios.get('https://api.github.com/rate_limit', { headers: ghHeaders() });
            const { limit, remaining, reset } = rl.data.rate;
            const resetTime = new Date(reset * 1000).toLocaleTimeString();
            console.log(`[AUTH] ✅ Token is VALID — Rate limit: ${remaining}/${limit} (resets at ${resetTime})`);
        } catch (err) {
            console.error(`[AUTH] ❌ Token check FAILED: ${err.response?.data?.message || err.message}`);
            console.error('[AUTH] Your GITHUB_TOKEN may be expired or invalid. Requests will use unauthenticated limits (60/hr).');
        }
    } else {
        console.log('[AUTH] ⚠️  No GITHUB_TOKEN set. Using unauthenticated rate limit (60 requests/hr).');
        console.log('[AUTH] Set GITHUB_TOKEN in backend/.env for 5,000 requests/hr.');
    }
});
