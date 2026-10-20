import React, { useState } from 'react';
import useStore from './store';
import { Play, Pause, Github, Flame, Palette, GitBranch, Sparkles, BarChart3, Building2, Clock, Brain, ArrowRight, Loader2, Users, Filter, SlidersHorizontal, ChevronDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import SearchPanel from './components/SearchPanel';
import LanguageFilter from './components/LanguageFilter';

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
        setRepoUrl,
        loading,
        error,
        commits,
        currentCommitIndex,
        previewCommitIndex,
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
        toggleLanguageStats,
        closeCodeViewer
    } = useStore();

    const [inputUrl, setInputUrl] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [showContributors, setShowContributors] = useState(false);
    const [showLanguageFilter, setShowLanguageFilter] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const toolsPopoverRef = React.useRef(null);

    const closeOtherPanels = (except) => {
        if (except !== 'graph' && showCommitGraph) toggleCommitGraph();
        if (except !== 'stats' && showLanguageStats) toggleLanguageStats();
        if (except !== 'ai' && showAISummary) toggleAISummary();
        if (except !== 'contributors') setShowContributors(false);
        if (except !== 'filter') setShowLanguageFilter(false);
    };

    React.useEffect(() => {
        if (!showTools && !showContributors && !showLanguageFilter) return undefined;

        const closePopover = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'pointerdown' && toolsPopoverRef.current?.contains(event.target)) return;
            setShowTools(false);
            setShowContributors(false);
            setShowLanguageFilter(false);
        };

        document.addEventListener('pointerdown', closePopover);
        document.addEventListener('keydown', closePopover);
        return () => {
            document.removeEventListener('pointerdown', closePopover);
            document.removeEventListener('keydown', closePopover);
        };
    }, [showTools, showContributors, showLanguageFilter]);

    // Auto-play interval
    React.useEffect(() => {
        let interval;
        if (isPlaying && commits.length > 0) {
            interval = setInterval(() => {
                const { currentCommitIndex, commits } = useStore.getState();
                if (currentCommitIndex >= commits.length - 1) {
                    setIsPlaying(false);
                } else {
                    const nextIndex = currentCommitIndex + 1;
                    const treeUpdateInterval = Math.max(1, Math.ceil(commits.length / 8));
                    if (nextIndex === commits.length - 1 || nextIndex % treeUpdateInterval === 0) {
                        setCommitIndex(nextIndex);
                    } else {
                        previewCommitIndex(nextIndex);
                    }
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, commits.length, previewCommitIndex, setCommitIndex]);

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
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 sm:p-4 lg:p-5">

            {/* Top Bar */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                <div className="flex flex-col items-start gap-2 min-w-0 max-w-full">
                    {/* Repository loading stays in its own card, separate from view controls. */}
                    <div className="flex items-center gap-2 pointer-events-auto max-w-full rounded-2xl border border-slate-700/90 bg-slate-950/90 p-2 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-blue-400">
                            <Github size={21} />
                        </div>
                        <input
                            type="text"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
                            placeholder="https://github.com/owner/repo"
                            aria-label="GitHub repository URL"
                            className="min-w-0 w-32 sm:w-56 lg:w-64 xl:w-72 max-w-[38vw] rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                            onClick={handleLoad}
                            disabled={loading}
                            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 sm:px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:bg-slate-700"
                        >
                            {loading && !commits.length ? <Loader2 size={15} className="animate-spin" /> : null}
                            <span>{loading && !commits.length ? 'Loading' : 'Load repo'}</span>
                        </button>
                    </div>

                    {owner && repoName && (
                        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 px-2 text-xs text-slate-300">
                            <span className="font-semibold text-white">{owner}/{repoName}</span>
                            <span className="text-slate-600">•</span>
                            <span>{commits.length} commits</span>
                            <span className="text-slate-600">•</span>
                            <span>{branches.length} branches</span>
                        </div>
                    )}
                </div>

                {/* Visualization controls live in a separate dock. */}
                {commits.length > 0 && (
                    <div className="pointer-events-auto relative flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-700/90 bg-slate-950/90 p-1.5 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
                        <div className="flex items-center gap-0.5 rounded-xl bg-slate-900/80 p-1">
                            <button
                                onClick={() => setColorMode('filetype')}
                                aria-pressed={colorMode === 'filetype'}
                                className={`flex items-center gap-2 rounded-lg px-2.5 sm:px-3 py-2.5 text-sm transition ${colorMode === 'filetype' ? 'bg-blue-600 text-white shadow-md shadow-blue-950/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <Palette size={16} /> <span className="hidden sm:inline">File type</span>
                            </button>
                            <button
                                onClick={() => setColorMode('heatmap')}
                                aria-pressed={colorMode === 'heatmap'}
                                className={`flex items-center gap-2 rounded-lg px-2.5 sm:px-3 py-2.5 text-sm transition ${colorMode === 'heatmap' ? 'bg-blue-600 text-white shadow-md shadow-blue-950/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <Flame size={16} /> <span className="hidden sm:inline">Heatmap</span>
                            </button>
                        </div>

                        <div className="relative" ref={toolsPopoverRef}>
                                <button
                                    onClick={() => {
                                        if (showTools) {
                                            setShowTools(false);
                                        } else {
                                            closeOtherPanels('menu');
                                            setShowTools(true);
                                        }
                                    }}
                                    className={`flex items-center gap-2 rounded-xl px-2.5 sm:px-3 py-2.5 text-sm transition ${showTools || showContributors || showLanguageFilter || showCommitGraph || showLanguageStats || showAISummary ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                                    aria-expanded={showTools}
                                    aria-haspopup="menu"
                                >
                                    <SlidersHorizontal size={16} /> <span>Explore</span><ChevronDown size={14} className={`transition-transform ${showTools ? 'rotate-180' : ''}`} />
                                </button>
                                {showTools && (
                                    <div className="absolute right-0 top-full z-[70] mt-2 max-h-[calc(100vh-7rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl" role="menu" aria-label="Repository tools">
                                        <div className="px-3 pb-2 pt-1">
                                            <div className="text-sm font-semibold text-white">Explore repository</div>
                                            <div className="mt-0.5 text-xs text-slate-500">Insights and ways to focus the city</div>
                                        </div>
                                        <div className="space-y-1 border-t border-slate-800 pt-2">
                                            <button role="menuitem" onClick={() => { closeOtherPanels('contributors'); setShowContributors(true); setShowTools(false); }} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-900">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><Users size={17} /></span>
                                                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-100">Top contributors</span><span className="mt-0.5 block text-xs text-slate-500">See who shaped this repository</span></span>
                                                <span className="text-xs tabular-nums text-slate-500">{contributors.length}</span>
                                            </button>
                                            <button role="menuitem" onClick={() => { closeOtherPanels('filter'); setShowLanguageFilter(true); setShowTools(false); }} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-900">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Filter size={17} /></span>
                                                <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-100">Filter by language</span><span className="mt-0.5 block text-xs text-slate-500">Focus on selected file types</span></span>
                                                <ArrowRight size={14} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
                                            </button>
                                        </div>
                                        <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Repository insights</div>
                                        <div className="space-y-1 border-t border-slate-800 pt-2">
                                            <button role="menuitem" onClick={() => { closeOtherPanels('stats'); if (!showLanguageStats) closeCodeViewer(); toggleLanguageStats(); setShowTools(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-900">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-300"><BarChart3 size={16} /></span><span className="flex-1 text-sm text-slate-200">Language stats</span>{showLanguageStats && <Check size={15} className="text-blue-400" />}
                                            </button>
                                            <button role="menuitem" onClick={() => { closeOtherPanels('graph'); toggleCommitGraph(); setShowTools(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-900">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><GitBranch size={16} /></span><span className="flex-1 text-sm text-slate-200">Commit graph</span>{showCommitGraph && <Check size={15} className="text-blue-400" />}
                                            </button>
                                            <button role="menuitem" onClick={() => { closeOtherPanels('ai'); if (!showAISummary) closeCodeViewer(); toggleAISummary(); setShowTools(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-900">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300"><Sparkles size={16} /></span><span className="flex-1 text-sm text-slate-200">AI summary</span>{showAISummary && <Check size={15} className="text-blue-400" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {showContributors && (
                                    <div className="absolute right-0 top-full z-[70] mt-2 max-h-[min(60vh,32rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div><h2 className="text-sm font-semibold text-white">Top contributors</h2><p className="mt-0.5 text-xs text-slate-500">Ranked by commits in this history</p></div>
                                            <button onClick={() => setShowContributors(false)} aria-label="Close contributors" className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={16} /></button>
                                        </div>
                                        <div className="space-y-1 border-t border-slate-800 pt-2">
                                            {contributors.slice(0, 10).map((contributor, index) => (
                                                <div key={`${contributor.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-900/70">
                                                    <div className="flex min-w-0 items-center gap-2.5">
                                                        {contributor.avatar ? <img src={contributor.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full ring-1 ring-slate-700" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-400">{contributor.name?.[0] || '?'}</span>}
                                                        <span className="truncate text-slate-200">{contributor.name}</span>
                                                    </div>
                                                    <span className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 font-mono text-xs text-blue-300">{contributor.commits}</span>
                                                </div>
                                            ))}
                                            {contributors.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">No contributor data available.</p>}
                                        </div>
                                    </div>
                                )}
                                {showLanguageFilter && (
                                    <div className="absolute right-0 top-full z-[70] mt-2 w-[min(20rem,calc(100vw-1.5rem))]">
                                        <LanguageFilter />
                                    </div>
                                )}
                            </div>
                        <div className="relative">
                            <SearchPanel />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="pointer-events-auto max-w-md rounded-xl border border-red-500/40 bg-red-950/90 p-4 text-sm text-red-200 shadow-xl backdrop-blur">
                        {error}
                    </div>
                )}
            </div>

            {/* Bottom Timeline */}
            {commits.length > 0 && (
                <div className="pointer-events-auto bg-slate-900/90 p-6 rounded-xl backdrop-blur border border-slate-700 w-full max-w-4xl mx-auto flex flex-col gap-4 custom-shadow">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => {
                                if (isPlaying) {
                                    setIsPlaying(false);
                                    setCommitIndex(currentCommitIndex);
                                } else {
                                    setIsPlaying(true);
                                }
                            }}
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
                            onChange={(e) => previewCommitIndex(Number(e.target.value))}
                            onPointerUp={() => setCommitIndex(useStore.getState().currentCommitIndex)}
                            onKeyUp={() => setCommitIndex(useStore.getState().currentCommitIndex)}
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
