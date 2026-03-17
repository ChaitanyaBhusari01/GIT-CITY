import { create } from 'zustand';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://git-city-tsy3.onrender.com';

const useStore = create((set, get) => ({
    repoUrl: '',
    owner: null,
    repoName: null,
    commits: [],
    currentCommitIndex: 0,
    tree: [],
    fileStats: {},
    contributors: [],
    branches: [],
    loading: false,
    error: null,

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
        set({
            repoUrl: url, commits: [], tree: [], contributors: [], branches: [],
            currentCommitIndex: 0, error: null, owner: null, repoName: null,
            languageFilter: null,
            selectedFile: null, selectedFileDependencies: [], fileHistory: [],
            commitGraph: [], aiSummary: null, aiSummaryError: null,
            currentFileContent: null, showCodeViewer: false, codeViewerError: null,
            aiChatMessages: {}, showAIChat: false, aiChatError: null
        });
    },

    fetchFileContent: async (path) => {
        const state = get();
        const { repoUrl, fileContentCache } = state;
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
                params: { repoUrl, path },
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

        set({ loading: true, error: null });

        try {
            const loadRes = await axios.post(`${API_BASE}/repo/load`, { url: repoUrl });
            const { owner, repo } = loadRes.data;
            set({ owner, repoName: repo });

            const [commitsRes, contribsRes, branchesRes, fileStatsRes] = await Promise.all([
                axios.get(`${API_BASE}/repo/commits`),
                axios.get(`${API_BASE}/repo/contributors`),
                axios.get(`${API_BASE}/repo/branches`),
                axios.get(`${API_BASE}/repo/file-stats`)
            ]);

            const commits = commitsRes.data;
            set({
                loading: false,
                commits,
                contributors: contribsRes.data,
                branches: branchesRes.data,
                fileStats: fileStatsRes.data,
                currentCommitIndex: 0
            });

            if (commits.length > 0) {
                await get().fetchTree(commits[0].hash);
            } else {
                set({ loading: false, error: 'No commits found.' });
            }

            // Fetch commit graph data in background
            get().fetchCommitGraph();
        } catch (err) {
            set({ error: err.response?.data?.error || err.message, loading: false });
        }
    },

    fetchTree: async (sha) => {
        try {
            const treeRes = await axios.get(`${API_BASE}/repo/tree`, { params: { sha } });
            set({ tree: treeRes.data, loading: false });
        } catch (err) {
            set({ error: err.response?.data?.error || err.message, loading: false });
        }
    },

    setCommitIndex: async (index) => {
        const { commits } = get();
        if (index >= 0 && index < commits.length) {
            set({ currentCommitIndex: index, loading: true });
            await get().fetchTree(commits[index].hash);
        }
    },

    selectFile: async (fileData) => {
        set({ selectedFile: fileData, selectedFileDependencies: [], fileHistoryLoading: true, fileHistory: [] });

        // Trigger fetch for code viewer
        get().fetchFileContent(fileData.path);

        // Fetch file history
        try {
            const res = await axios.get(`${API_BASE}/repo/file-history`, { params: { path: fileData.path } });
            set({ fileHistory: res.data, fileHistoryLoading: false });
        } catch (err) {
            set({ fileHistoryLoading: false });
        }

        // Fetch dependencies if it's a JS/TS file
        if (/\.(jsx?|tsx?)$/.test(fileData.path)) {
            try {
                const response = await axios.get(`${API_BASE}/repo/dependencies?path=${encodeURIComponent(fileData.path)}`);
                set({ selectedFileDependencies: response.data || [] });
            } catch (err) {
                console.error('Failed to fetch file dependencies:', err);
                set({ selectedFileDependencies: [] });
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
            const res = await axios.get(`${API_BASE}/repo/commit-graph`);
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
        const { commits, contributors, branches, tree, owner, repoName } = get();
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
            const res = await axios.post(`${API_BASE}/repo/ai-summary`, stats);
            set({ aiSummary: res.data.summary, aiSummaryLoading: false });
        } catch (err) {
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
                const res = await axios.post(`${API_BASE}/repo/ai-chat`, {
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
        const existingMsgs = aiChatMessages[path] || [];
        const updatedMsgs = [...existingMsgs, userMsg];
        set({
            aiChatMessages: { ...aiChatMessages, [path]: updatedMsgs },
            aiChatLoading: true,
            aiChatError: null
        });

        try {
            const res = await axios.post(`${API_BASE}/repo/ai-chat`, {
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
