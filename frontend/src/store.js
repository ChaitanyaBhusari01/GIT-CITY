import { create } from 'zustand';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV
    ? 'http://localhost:3001'
    : 'https://git-city-tsy3.onrender.com');
let repoLoadId = 0;

const useStore = create((set, get) => ({
    repoUrl: '',
    owner: null,
    repoName: null,
    commits: [],
    currentCommitIndex: 0,
    tree: [],
    treeCommitSha: null,
    fileStats: {},
    contributors: [],
    branches: [],
    loading: false,
    error: null,
    securityScanId: null,
    securityScanStatus: 'idle',
    securityScanError: null,
    securityFindings: [],
    securityScanCommitSha: null,

    // File Evolution Viewer state
    selectedFile: null,
    selectedFileDependencies: [],
    fileHistory: [],
    fileHistoryLoading: false,

    // Search state
    searchQuery: '',
    searchResults: [],

    // Commit Graph state
    commitGraph: [],
    showCommitGraph: false,

    // AI Summary state
    aiSummary: null,
    aiSummaryLoading: false,
    aiSummaryError: null,
    showAISummary: false,

    // Language filter state
    languageFilter: null,
    showLanguageStats: false,

    // Code Viewer state
    fileContentCache: {},
    currentFileContent: null,
    codeViewerLoading: false,
    codeViewerError: null,
    showCodeViewer: false,
    _abortController: null, // private state for cancelling parsing

    // AI Chat state
    aiChatMessages: {},     // per-file: { 'path': [{role, content}] }
    aiChatLoading: false,
    aiChatError: null,
    showAIChat: false,

    setRepoUrl: (url) => {
        repoLoadId++;
        get()._abortController?.abort();
        set({
            repoUrl: url, commits: [], tree: [], treeCommitSha: null, fileStats: {}, contributors: [], branches: [],
            currentCommitIndex: 0, error: null, owner: null, repoName: null,
            securityScanId: null, securityScanStatus: 'idle', securityScanError: null,
            securityFindings: [], securityScanCommitSha: null,
            languageFilter: null,
            selectedFile: null, selectedFileDependencies: [], fileHistory: [],
            commitGraph: [], aiSummary: null, aiSummaryError: null,
            currentFileContent: null, showCodeViewer: false, codeViewerError: null,
            fileContentCache: {}, _abortController: null,
            aiChatMessages: {}, showAIChat: false, aiChatError: null
        });
    },

    fetchFileContent: async (path) => {
        const state = get();
        const { repoUrl, fileContentCache, owner, repoName } = state;
        if (!repoUrl || !path) return;

        // Cancel previous request if any
        if (state._abortController) {
            state._abortController.abort();
        }

        const controller = new AbortController();
        set({
            showCodeViewer: true,
            codeViewerLoading: true,
            codeViewerError: null,
            _abortController: controller
        });

        // Check cache first
        if (fileContentCache[path]) {
            set({
                currentFileContent: fileContentCache[path],
                codeViewerLoading: false,
                _abortController: null
            });
            return;
        }

        try {
            const res = await axios.get(`${API_BASE}/repo/file`, {
                params: { owner, repo: repoName, path },
                signal: controller.signal
            });

            // Update cache and current content
            const newCache = { ...state.fileContentCache, [path]: res.data };
            set({
                fileContentCache: newCache,
                currentFileContent: res.data,
                codeViewerLoading: false,
                _abortController: null
            });

        } catch (err) {
            if (axios.isCancel(err)) {
                console.log('Request canceled:', err.message);
                return; // Do not update state if we canceled it
            }
            set({
                codeViewerError: err.response?.data?.error || err.message,
                codeViewerLoading: false,
                currentFileContent: null,
                _abortController: null
            });
        }
    },

    closeCodeViewer: () => {
        if (get()._abortController) {
            get()._abortController.abort();
        }
        set({ showCodeViewer: false, currentFileContent: null, codeViewerError: null, _abortController: null });
    },

    fetchRepoData: async () => {
        const { repoUrl } = get();
        if (!repoUrl) return;
        const loadId = ++repoLoadId;

        set({ loading: true, error: null });

        try {
            const loadRes = await axios.post(`${API_BASE}/repo/load`, { url: repoUrl });
            const { owner, repo } = loadRes.data;
            if (loadId !== repoLoadId) return;
            set({ owner, repoName: repo });

            const params = { owner, repo };
            const [commitsRes, contribsRes, branchesRes] = await Promise.all([
                axios.get(`${API_BASE}/repo/commits`, { params }),
                axios.get(`${API_BASE}/repo/contributors`, { params }),
                axios.get(`${API_BASE}/repo/branches`, { params })
            ]);
            if (loadId !== repoLoadId) return;

            const commits = commitsRes.data;
            set({
                loading: false,
                commits,
                contributors: contribsRes.data,
                branches: branchesRes.data,
                fileStats: {},
                currentCommitIndex: 0
            });

            if (commits.length > 0) {
                await get().fetchTree(commits[0].hash, loadId);
            } else {
                set({ loading: false, error: 'No commits found.' });
            }

            // Fetch commit graph data in background
            get().fetchCommitGraph();
        } catch (err) {
            if (loadId !== repoLoadId) return;
            set({ error: err.response?.data?.error || err.message, loading: false });
        }
    },

    fetchTree: async (sha, loadId = repoLoadId) => {
        try {
            const { owner, repoName } = get();
            const treeRes = await axios.get(`${API_BASE}/repo/tree`, { params: { owner, repo: repoName, sha } });
            if (loadId !== repoLoadId || get().commits[get().currentCommitIndex]?.hash !== sha) return;
            const scanTargetsDifferentCommit = get().securityScanCommitSha && get().securityScanCommitSha !== sha;
            set({
                tree: treeRes.data,
                treeCommitSha: sha,
                loading: false,
                ...(scanTargetsDifferentCommit ? {
                    securityScanId: null,
                    securityScanStatus: 'idle',
                    securityScanError: null,
                    securityFindings: [],
                    securityScanCommitSha: null
                } : {})
            });
        } catch (err) {
            if (loadId !== repoLoadId || get().commits[get().currentCommitIndex]?.hash !== sha) return;
            set({ error: err.response?.data?.error || err.message, loading: false });
        }
    },


    // Security scan actions
    startSecurityScan: async () => {
        const { owner, repoName, treeCommitSha } = get();
        const busyStates = ['starting', 'queued', 'in_progress', 'processing_report'];
        if (busyStates.includes(get().securityScanStatus)) return;

        if (!owner || !repoName || !treeCommitSha) {
            set({
                securityScanStatus: 'failed',
                securityScanError: 'Load a repository and wait for its file tree to finish loading before scanning.'
            });
            return;
        }

        const loadId = repoLoadId;
        const commitSha = treeCommitSha;
        set({
            securityScanId: null,
            securityScanStatus: 'starting',
            securityScanError: null,
            securityFindings: [],
            securityScanCommitSha: commitSha
        });

        try {
            const response = await axios.post(`${API_BASE}/security/scan`, {
                owner,
                repo: repoName,
                commit_sha: commitSha
            });
            if (loadId !== repoLoadId) return;

            const scanId = response.data.scan_id;
            if (!scanId) throw new Error('Backend did not return a security scan ID.');
            set({
                securityScanId: scanId,
                securityScanStatus: response.data.status || 'queued'
            });

            const pollScan = async () => {
                const current = get();
                if (loadId !== repoLoadId || current.securityScanId !== scanId) return;

                try {
                    const statusResponse = await axios.get(
                        `${API_BASE}/security/scan/${encodeURIComponent(scanId)}`
                    );
                    if (loadId !== repoLoadId || get().securityScanId !== scanId) return;

                    const data = statusResponse.data;
                    if (data.status === 'completed') {
                        set({
                            securityScanStatus: 'completed',
                            securityScanError: null,
                            securityFindings: Array.isArray(data.findings) ? data.findings : []
                        });
                        return;
                    }
                    if (data.status === 'failed') {
                        set({
                            securityScanStatus: 'failed',
                            securityScanError: data.error || 'Security scan failed.'
                        });
                        return;
                    }

                    set({ securityScanStatus: data.status || 'in_progress' });
                    setTimeout(pollScan, 2500);
                } catch (err) {
                    if (loadId !== repoLoadId || get().securityScanId !== scanId) return;
                    set({
                        securityScanStatus: 'failed',
                        securityScanError: err.response?.data?.error ||
                            err.response?.data?.detail ||
                            err.message ||
                            'Could not retrieve security scan status.'
                    });
                }
            };

            setTimeout(pollScan, 1500);
        } catch (err) {
            if (loadId !== repoLoadId) return;
            set({
                securityScanStatus: 'failed',
                securityScanError: err.response?.data?.error ||
                    err.response?.data?.detail ||
                    err.message ||
                    'Could not start the security scan.'
            });
        }
    },

    previewCommitIndex: (index) => {
        const { commits } = get();
        if (index >= 0 && index < commits.length) {
            set({ currentCommitIndex: index });
        }
    },

    setCommitIndex: async (index) => {
        const { commits } = get();
        if (index >= 0 && index < commits.length) {
            const targetSha = commits[index].hash;
            const treeIsCurrent = get().treeCommitSha === targetSha;
            set({ currentCommitIndex: index, loading: !treeIsCurrent });
            if (!treeIsCurrent) {
                await get().fetchTree(targetSha);
            }
        }
    },

    selectFile: async (fileData) => {
        const { owner, repoName } = get();
        set({ selectedFile: fileData, selectedFileDependencies: [], fileHistoryLoading: true, fileHistory: [] });

        // Trigger fetch for code viewer
        get().fetchFileContent(fileData.path);

        // Fetch file history
        try {
            const res = await axios.get(`${API_BASE}/repo/file-history`, { params: { owner, repo: repoName, path: fileData.path } });
            if (get().owner !== owner || get().repoName !== repoName || get().selectedFile?.path !== fileData.path) return;
            set({ fileHistory: res.data, fileHistoryLoading: false });
        } catch {
            if (get().owner === owner && get().repoName === repoName && get().selectedFile?.path === fileData.path) {
                set({ fileHistoryLoading: false });
            }
        }

        // Fetch dependencies if it's a JS/TS file
        if (/\.(jsx?|tsx?)$/.test(fileData.path)) {
            try {
                const response = await axios.get(`${API_BASE}/repo/dependencies`, { params: { owner, repo: repoName, path: fileData.path } });
                if (get().owner !== owner || get().repoName !== repoName || get().selectedFile?.path !== fileData.path) return;
                set({ selectedFileDependencies: response.data || [] });
            } catch (err) {
                console.error('Failed to fetch file dependencies:', err);
                if (get().owner === owner && get().repoName === repoName && get().selectedFile?.path === fileData.path) {
                    set({ selectedFileDependencies: [] });
                }
            }
        }
    },

    clearSelectedFile: () => {
        set({ selectedFile: null, selectedFileDependencies: [], fileHistory: [] });
        get().closeCodeViewer();
    },

    setSearchQuery: (query) => {
        const { tree, commits } = get();
        const q = query.toLowerCase();

        if (!q) {
            set({ searchQuery: '', searchResults: [] });
            return;
        }

        const fileResults = tree
            .filter(f => f.path.toLowerCase().includes(q))
            .slice(0, 10)
            .map(f => ({ type: 'file', ...f }));

        const commitResults = commits
            .filter(c => c.message.toLowerCase().includes(q) || c.author_name.toLowerCase().includes(q) || c.hash.toLowerCase().startsWith(q))
            .slice(0, 5)
            .map(c => ({ type: 'commit', ...c }));

        set({ searchQuery: query, searchResults: [...fileResults, ...commitResults] });
    },

    // Commit Graph actions
    fetchCommitGraph: async () => {
        try {
            const { owner, repoName } = get();
            const res = await axios.get(`${API_BASE}/repo/commit-graph`, { params: { owner, repo: repoName } });
            if (get().owner !== owner || get().repoName !== repoName) return;
            set({ commitGraph: res.data });
        } catch (err) {
            console.warn('Failed to fetch commit graph:', err.message);
        }
    },

    toggleCommitGraph: () => {
        set(state => ({ showCommitGraph: !state.showCommitGraph }));
    },

    // AI Summary actions
    toggleAISummary: () => {
        set(state => ({ showAISummary: !state.showAISummary }));
    },

    generateAISummary: async () => {
        const { commits, contributors, branches, tree } = get();
        const loadId = repoLoadId;
        set({ aiSummaryLoading: true, aiSummaryError: null, aiSummary: null });

        // Gather file type stats
        const extCounts = {};
        tree.forEach(f => {
            const ext = f.path.split('.').pop().toLowerCase();
            extCounts[ext] = (extCounts[ext] || 0) + 1;
        });
        const topExts = Object.entries(extCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ext, count]) => `${ext}(${count})`)
            .join(', ');

        const stats = {
            totalCommits: commits.length,
            totalFiles: tree.length,
            totalContributors: contributors.length,
            totalBranches: branches.length,
            topContributors: contributors.slice(0, 5).map(c => `${c.name}(${c.commits})`).join(', '),
            latestCommit: commits[0]?.message?.split('\n')[0] || 'N/A',
            oldestCommit: commits[commits.length - 1]?.message?.split('\n')[0] || 'N/A',
            fileTypes: topExts
        };

        try {
            const { owner, repoName } = get();
            const res = await axios.post(`${API_BASE}/repo/ai-summary`, { ...stats, owner, repo: repoName });
            if (loadId !== repoLoadId) return;
            set({ aiSummary: res.data.summary, aiSummaryLoading: false });
        } catch (err) {
            if (loadId !== repoLoadId) return;
            set({
                aiSummaryError: err.response?.data?.error || err.message,
                aiSummaryLoading: false
            });
        }
    },

    // Language filter actions
    setLanguageFilter: (language) => {
        set({ languageFilter: language });
    },

    toggleLanguageStats: () => {
        set(state => ({ showLanguageStats: !state.showLanguageStats }));
    },

    // AI Chat actions
    openAIChat: async () => {
        const { selectedFile, currentFileContent, aiChatMessages } = get();
        if (!selectedFile || !currentFileContent?.content) return;

        const path = selectedFile.path;
        set({ showAIChat: true, aiChatError: null });

        // If no messages yet for this file, auto-send an explanation request
        if (!aiChatMessages[path] || aiChatMessages[path].length === 0) {
            const initMessage = { role: 'user', content: 'Explain this file. What does it do, what are the key components/functions, and how is it structured?' };
            const newMessages = { ...aiChatMessages, [path]: [initMessage] };
            set({ aiChatMessages: newMessages, aiChatLoading: true });

            try {
                const { owner, repoName } = get();
                const res = await axios.post(`${API_BASE}/repo/ai-chat`, {
                    owner, repo: repoName,
                    filePath: path,
                    fileContent: currentFileContent.content,
                    messages: [initMessage]
                });
                const aiMsg = { role: 'assistant', content: res.data.response };
                const updated = { ...get().aiChatMessages, [path]: [initMessage, aiMsg] };
                set({ aiChatMessages: updated, aiChatLoading: false });
            } catch (err) {
                set({
                    aiChatError: err.response?.data?.error || err.message,
                    aiChatLoading: false
                });
            }
        }
    },

    sendAIChatMessage: async (message) => {
        const { selectedFile, currentFileContent, aiChatMessages } = get();
        if (!selectedFile || !currentFileContent?.content || !message.trim()) return;

        const path = selectedFile.path;
        const userMsg = { role: 'user', content: message.trim() };
        const existingMsgs = (aiChatMessages[path] || []).slice(-19);
        const updatedMsgs = [...existingMsgs, userMsg];
        set({
            aiChatMessages: { ...aiChatMessages, [path]: updatedMsgs },
            aiChatLoading: true,
            aiChatError: null
        });

        try {
            const { owner, repoName } = get();
            const res = await axios.post(`${API_BASE}/repo/ai-chat`, {
                owner, repo: repoName,
                filePath: path,
                fileContent: currentFileContent.content,
                messages: updatedMsgs
            });
            const aiMsg = { role: 'assistant', content: res.data.response };
            const finalMsgs = [...get().aiChatMessages[path], aiMsg];
            set({
                aiChatMessages: { ...get().aiChatMessages, [path]: finalMsgs },
                aiChatLoading: false
            });
        } catch (err) {
            set({
                aiChatError: err.response?.data?.error || err.message,
                aiChatLoading: false
            });
        }
    },

    closeAIChat: () => {
        set({ showAIChat: false, aiChatError: null });
    }
}));

export default useStore;
