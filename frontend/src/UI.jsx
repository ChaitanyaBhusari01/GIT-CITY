import React, { useState } from 'react';
import useStore from './store';
import { Play, Pause, Github, Flame, Palette, GitBranch, Sparkles, BarChart3, Building2, Clock, Brain, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

// ─── Landing Page (shown when no repo is loaded) ─────────────────────────────

const LandingPage = ({ inputUrl, setInputUrl, handleLoad, loading }) => {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-auto overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 30%, #1e1b4b 60%, #020617 100%)' }}
        >
            {/* Animated background grid */}
            <div className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px'
                }}
            />

            {/* Floating orbs for depth */}
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl animate-float" />
            <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
            <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />

            {/* Main content */}
            <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto px-6">

                {/* Logo & Title */}
                <div className="animate-fade-in-up mb-2">
                    <div className="flex items-center gap-4 mb-4 justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <Building2 size={32} className="text-white" />
                        </div>
                        <h1 className="text-6xl font-black tracking-tight">
                            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                                GitCity
                            </span>
                        </h1>
                    </div>
                </div>

                {/* Tagline */}
                <p className="text-xl text-slate-400 mb-10 text-center animate-fade-in-up animation-delay-200">
                    Visualize any GitHub repository as an interactive 3D city.<br />
                    <span className="text-slate-500">Files become buildings. Commits become history. Code becomes architecture.</span>
                </p>

                {/* Input Card */}
                <div className="w-full max-w-xl animate-fade-in-up animation-delay-400">
                    <div className="relative group">
                        {/* Glow border */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 rounded-2xl opacity-30 group-hover:opacity-50 blur-sm transition-all duration-500" />

                        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                            <div className="flex items-center gap-3 mb-4">
                                <Github size={20} className="text-blue-400" />
                                <span className="text-sm font-medium text-slate-300">Enter a GitHub Repository URL</span>
                            </div>

                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={inputUrl}
                                    onChange={(e) => setInputUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                                    placeholder="https://github.com/owner/repo"
                                    className="flex-1 bg-slate-800/80 text-white px-5 py-3.5 rounded-xl border border-slate-600/50 outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all duration-300 placeholder:text-slate-500"
                                />
                                <button
                                    onClick={handleLoad}
                                    disabled={loading || !inputUrl.trim()}
                                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 px-7 py-3.5 rounded-xl text-white font-semibold transition-all duration-300 flex items-center gap-2 min-w-[150px] justify-center shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            Loading...
                                        </>
                                    ) : (
                                        <>
                                            Explore
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feature Cards */}
                <div className="grid grid-cols-3 gap-4 mt-12 w-full max-w-xl animate-fade-in-up animation-delay-600">
                    {[
                        { icon: Building2, title: '3D City View', desc: 'Files as buildings, folders as districts', color: 'text-blue-400', bg: 'from-blue-500/10 to-blue-600/5' },
                        { icon: Clock, title: 'Time Travel', desc: 'Scrub through commit history', color: 'text-purple-400', bg: 'from-purple-500/10 to-purple-600/5' },
                        { icon: Brain, title: 'AI Analysis', desc: 'AI-powered repo summaries', color: 'text-cyan-400', bg: 'from-cyan-500/10 to-cyan-600/5' },
                    ].map((f, i) => (
                        <div key={i} className={`bg-gradient-to-b ${f.bg} border border-slate-800/80 rounded-xl p-4 text-center hover:border-slate-600/50 transition-all duration-300 hover:-translate-y-1`}>
                            <f.icon size={24} className={`${f.color} mx-auto mb-2`} />
                            <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                            <p className="text-xs text-slate-500">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom attribution */}
            <div className="absolute bottom-6 text-xs text-slate-600">
                Built with React Three Fiber • Zustand • GitHub API
            </div>
        </div>
    );
};

// ─── Main UI Component ───────────────────────────────────────────────────────

const UI = ({ colorMode, setColorMode }) => {
    const {
        repoUrl,
        setRepoUrl,
        fetchRepoData,
        loading,
        error,
        commits,
        currentCommitIndex,
        setCommitIndex,
        contributors,
        branches,
        owner,
        repoName,
        showCommitGraph,
        toggleCommitGraph,
        showAISummary,
        toggleAISummary,
        showLanguageStats,
        toggleLanguageStats
    } = useStore();

    const [inputUrl, setInputUrl] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);

    // Auto-play interval
    React.useEffect(() => {
        let interval;
        if (isPlaying && commits.length > 0) {
            interval = setInterval(() => {
                const { currentCommitIndex, commits } = useStore.getState();
                if (currentCommitIndex >= commits.length - 1) {
                    setIsPlaying(false);
                } else {
                    setCommitIndex(currentCommitIndex + 1);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, commits.length, setCommitIndex]);

    const commit = commits[currentCommitIndex];

    const handleLoad = () => {
        if (!inputUrl.trim()) return;
        setRepoUrl(inputUrl);
        setTimeout(() => {
            useStore.getState().fetchRepoData();
        }, 0);
    };

    // ─── Landing Page (no repo loaded yet) ───────────────────────────────────
    if (commits.length === 0 && !loading && !error) {
        return <LandingPage inputUrl={inputUrl} setInputUrl={setInputUrl} handleLoad={handleLoad} loading={loading} />;
    }

    // Loading state overlay
    if (loading && commits.length === 0) {
        return (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-auto"
                style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 30%, #1e1b4b 60%, #020617 100%)' }}
            >
                <div className="flex flex-col items-center gap-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse-glow">
                        <Building2 size={40} className="text-white" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">Building Your City</h2>
                        <p className="text-slate-400 text-sm">Fetching repository data from GitHub...</p>
                    </div>
                    <Loader2 size={28} className="text-blue-400 animate-spin" />
                </div>
            </div>
        );
    }

    // Error state — show landing page with error
    if (error && commits.length === 0) {
        return (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-auto"
                style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 30%, #1e1b4b 60%, #020617 100%)' }}
            >
                <div className="flex flex-col items-center gap-6 max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Building2 size={32} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black">
                        <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">GitCity</span>
                    </h1>

                    <div className="bg-red-900/40 border border-red-500/50 rounded-xl p-4 text-red-200 text-sm w-full text-center">
                        {error}
                    </div>

                    <div className="w-full">
                        <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={inputUrl}
                                    onChange={(e) => setInputUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                                    placeholder="https://github.com/owner/repo"
                                    className="flex-1 bg-slate-800/80 text-white px-4 py-3 rounded-xl border border-slate-600/50 outline-none focus:border-blue-500 text-sm"
                                />
                                <button
                                    onClick={handleLoad}
                                    disabled={loading}
                                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 px-6 py-3 rounded-xl text-white font-semibold transition-all flex items-center gap-2"
                                >
                                    Try Again <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── City View UI (repo loaded) ──────────────────────────────────────────
    return (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4">

            {/* Top Bar */}
            <div className="flex flex-col gap-3">
                <div className="flex gap-3 items-center flex-wrap">
                    <div className="flex gap-3 pointer-events-auto bg-slate-900/80 p-4 rounded-xl backdrop-blur border border-slate-700 w-fit custom-shadow items-center">
                        <Github size={24} className="text-blue-400 shrink-0" />
                        <input
                            type="text"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                            placeholder="https://github.com/owner/repo"
                            className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 outline-none focus:border-blue-500 w-96 text-sm"
                        />
                        <button
                            onClick={handleLoad}
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 px-6 py-2 rounded-lg text-white font-semibold transition min-w-[140px]"
                        >
                            {loading && !commits.length ? 'Loading...' : 'Load Repo'}
                        </button>
                    </div>

                    {/* Color Mode + Graph + AI + Stats Toggles */}
                    {commits.length > 0 && (
                        <div className="pointer-events-auto flex flex-wrap bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl overflow-hidden custom-shadow">
                            <button
                                onClick={() => setColorMode('filetype')}
                                className={`flex items-center gap-2 px-4 py-3 text-sm transition ${colorMode === 'filetype' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Palette size={16} /> File Type
                            </button>
                            <button
                                onClick={() => setColorMode('heatmap')}
                                className={`flex items-center gap-2 px-4 py-3 text-sm transition ${colorMode === 'heatmap' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Flame size={16} /> Heatmap
                            </button>
                            <div className="w-px bg-slate-700"></div>
                            <button
                                onClick={toggleCommitGraph}
                                className={`flex items-center gap-2 px-4 py-3 text-sm transition ${showCommitGraph ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                title="Toggle Commit Graph"
                            >
                                <GitBranch size={16} /> Graph
                            </button>
                            <button
                                onClick={toggleLanguageStats}
                                className={`flex items-center gap-2 px-4 py-3 text-sm transition ${showLanguageStats ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                title="Language Statistics"
                            >
                                <BarChart3 size={16} /> Stats
                            </button>
                            <button
                                onClick={toggleAISummary}
                                className={`flex items-center gap-2 px-4 py-3 text-sm transition ${showAISummary ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                title="AI Repository Summary"
                            >
                                <Sparkles size={16} /> AI
                            </button>
                        </div>
                    )}
                </div>

                {owner && repoName && (
                    <div className="pointer-events-auto bg-slate-900/60 px-4 py-2 rounded-lg backdrop-blur border border-slate-700 w-fit text-sm text-slate-300">
                        Viewing: <strong className="text-white">{owner}/{repoName}</strong>
                        {' · '}{commits.length} commits · {branches.length} branches
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/80 p-4 rounded-xl border border-red-500 text-red-200 pointer-events-auto max-w-md">
                        {error}
                    </div>
                )}
            </div>

            {/* Right Panel: Contributors (hidden when AI panel is shown) */}
            {commits.length > 0 && !showAISummary && (
                <div className="absolute top-28 right-4 bg-slate-900/80 p-6 rounded-xl backdrop-blur border border-slate-700 w-80 max-h-[60vh] overflow-y-auto pointer-events-auto custom-shadow">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-4">Top Contributors</h2>
                    <div className="flex flex-col gap-3">
                        {contributors.slice(0, 10).map((c, i) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2 truncate mr-2">
                                    {c.avatar && <img src={c.avatar} alt="" className="w-6 h-6 rounded-full" />}
                                    <span className="truncate max-w-[120px]">{c.name}</span>
                                </div>
                                <span className="text-blue-400 font-mono bg-slate-800 px-2 py-1 rounded text-xs">{c.commits}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bottom Timeline */}
            {commits.length > 0 && (
                <div className="pointer-events-auto bg-slate-900/90 p-6 rounded-xl backdrop-blur border border-slate-700 w-full max-w-4xl mx-auto flex flex-col gap-4 custom-shadow">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-full transition-colors text-white shrink-0"
                        >
                            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
                        </button>
                        <div className="flex-1 text-sm text-slate-300 min-w-0">
                            <span className="block font-bold text-white text-lg truncate">
                                {commit?.message?.split('\n')[0]}
                            </span>
                            <span className="block mt-1">
                                by <strong className="text-blue-400">{commit?.author_name}</strong> on {commit?.date && format(new Date(commit.date), 'MMM d, yyyy HH:mm')}
                            </span>
                            <span className="block text-slate-500 font-mono mt-1 text-xs truncate">
                                {commit?.hash}
                            </span>
                        </div>
                    </div>

                    {/* Slider */}
                    <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-slate-500 w-16 text-right">Latest</span>
                        <input
                            type="range"
                            min={0}
                            max={commits.length - 1}
                            value={currentCommitIndex}
                            onChange={(e) => setCommitIndex(Number(e.target.value))}
                            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-xs text-slate-500 w-16">Oldest</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UI;
