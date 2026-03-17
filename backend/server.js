require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

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

// ─── CORS: restrict to known origins ───
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://git-city-iota.vercel.app/'] // Replace with your actual domain
    : ['http://localhost:5173', 'http://localhost:3000']; // Allow local dev

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(limiter);
app.use(express.json());

// In-memory store for the currently loaded repo
let currentRepo = { owner: null, repo: null };

const GITHUB_API = 'https://api.github.com';

// ─── In-memory cache with 5-minute TTL and size limit ───────────────────────────────────────
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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
    return depCache[key]?.[filePath];
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

// Helper: extract owner/repo from GitHub URL
const parseGitHubUrl = (url) => {
    // Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo');
    let repoName = match[2];
    if (repoName.endsWith('.git')) {
        repoName = repoName.slice(0, -4);
    }
    return { owner: match[1], repo: repoName };
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
// Prefetches default branch info and caches it for later use
app.post('/repo/load', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) throw new Error('URL is required');

        const { owner, repo } = parseGitHubUrl(url);

        // If switching to a different repo, clear old cache
        if (currentRepo.owner !== owner || currentRepo.repo !== repo) {
            if (currentRepo.owner) {
                clearCacheForRepo(currentRepo.owner, currentRepo.repo);
                clearDepCacheForRepo(currentRepo.owner, currentRepo.repo);
            }
        }

        currentRepo = { owner, repo };

        // Prefetch & cache default branch SHA so /repo/tree doesn't need extra calls
        try {
            await resolveDefaultBranchSha(owner, repo);
            console.log(`[PREFETCH] Default branch SHA cached for ${owner}/${repo}`);
        } catch (prefetchErr) {
            // Non-fatal: the tree endpoint will fetch it on demand
            console.warn(`[PREFETCH] Could not prefetch branch info: ${prefetchErr.message}`);
        }

        res.json({ success: true, owner, repo, message: `Repository ${owner}/${repo} loaded.` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// GET /repo/tree
// Returns the full recursive file tree for the default branch
app.get('/repo/tree', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/commits
// Returns the recent commits (paginated; default 100)
app.get('/repo/commits', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
            author_email: c.commit.author.email
        }));

        setCache(owner, repo, cacheField, commits);
        console.log(`[CACHE SET] ${owner}/${repo} → ${cacheField} (${commits.length} commits)`);

        res.json(commits);
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file-stats
// Computes real commit counts and top contributor per file by fetching details for the last 20 commits
app.get('/repo/file-stats', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
        if (!owner) throw new Error('No repository loaded.');

        const cacheField = 'file-stats:20';
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

        // Fetch last 20 commits
        const commitsRes = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
            params: { per_page: 20 },
            headers: ghHeaders()
        });

        // Fetch detailed files for those 20 commits concurrently
        const commitDetails = await Promise.all(
            commitsRes.data.map(c =>
                axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits/${c.sha}`, { headers: ghHeaders() })
                    .then(res => res.data)
                    .catch(() => null)
            )
        );

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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/contributors
app.get('/repo/contributors', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/branches
app.get('/repo/branches', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file-history?path=src/index.js
app.get('/repo/file-history', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// GET /repo/file
// Fetches the raw content of a specific file with syntax highlighting support.
app.get('/repo/file', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
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
        const msg = error.response?.data?.message || error.message;
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
        const { owner, repo } = currentRepo;
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
        setDepCache(currentRepo.owner, currentRepo.repo, req.query.path, []);
        res.json([]);
    }
});

// GET /repo/commit-graph
// Returns commits with parent SHA references for graph visualization
app.get('/repo/commit-graph', async (req, res) => {
    try {
        const { owner, repo } = currentRepo;
        if (!owner) throw new Error('No repository loaded. Call POST /repo/load first.');

        const per_page = Math.min(Number(req.query.per_page) || 100, 200);

        const cacheField = `commit-graph:${per_page}`;
        const cached = getCache(owner, repo, cacheField);
        if (cached) return res.json(cached);

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
        const msg = error.response?.data?.message || error.message;
        res.status(error.response?.status || 400).json({ error: msg });
    }
});

// POST /repo/ai-summary
// Proxies to OpenRouter to generate a narrative summary of the repository
app.post('/repo/ai-summary', async (req, res) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to backend/.env' });
        }

        const { owner, repo } = currentRepo;
        if (!owner) throw new Error('No repository loaded.');

        const stats = req.body;

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
app.post('/repo/ai-chat', async (req, res) => {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to backend/.env' });
        }

        const { owner, repo } = currentRepo;
        if (!owner) throw new Error('No repository loaded.');

        const { filePath, fileContent, messages } = req.body;
        if (!filePath || !fileContent) {
            throw new Error('filePath and fileContent are required.');
        }
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error('messages array is required and must not be empty.');
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
