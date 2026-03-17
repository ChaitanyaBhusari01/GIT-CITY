import React, { useMemo } from 'react';
import useStore from '../store';
import { Sparkles, X, Loader2, AlertCircle, TrendingUp, User, Folder, File, Calendar, Database, Activity } from 'lucide-react';
import { format } from 'date-fns';

const AISummary = () => {
    const {
        showAISummary,
        toggleAISummary,
        aiSummary,
        aiSummaryLoading,
        aiSummaryError,
        generateAISummary,
        commits,
        tree,
        fileStats,
        contributors,
        owner,
        repoName
    } = useStore();

    const stats = useMemo(() => {
        if (!tree.length || !commits.length) return null;

        // Total files
        const filesCount = tree.filter(f => f.type === 'blob').length;

        // Biggest file
        let biggestFile = tree.reduce((max, f) => (f.size > max.size ? f : max), { size: 0 }).path;

        // Biggest folder
        const folderCounts = {};
        tree.forEach(f => {
            if (f.type !== 'blob') return;
            const parts = f.path.split('/');
            parts.pop();
            const folder = parts.length > 0 ? parts.join('/') : '/';
            folderCounts[folder] = (folderCounts[folder] || 0) + 1;
        });
        let biggestFolder = Object.entries(folderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

        // Most edited file
        let mostEdited = 'Unknown';
        if (fileStats && Object.keys(fileStats).length > 0) {
            mostEdited = Object.entries(fileStats).sort((a, b) => b[1].commitCount - a[1].commitCount)[0]?.[0];
        }

        // Most active day (from recent commits)
        const days = {};
        commits.forEach(c => {
            const day = c.date.split('T')[0];
            days[day] = (days[day] || 0) + 1;
        });
        const bestDayRaw = Object.entries(days).sort((a, b) => b[1] - a[1])[0]?.[0];
        const mostCommitsDay = bestDayRaw ? format(new Date(bestDayRaw), 'MMM d, yyyy') : 'Unknown';

        // Top contributor
        const topContr = contributors[0]?.name || 'Unknown';

        return [
            { label: 'Total Files', value: filesCount, icon: Database, color: 'text-blue-400' },
            { label: 'Recent Commits', value: commits.length, icon: Activity, color: 'text-emerald-400' },
            { label: 'Biggest Folder', value: biggestFolder.split('/').pop(), icon: Folder, color: 'text-amber-400', full: biggestFolder },
            { label: 'Biggest File', value: biggestFile?.split('/').pop(), icon: File, color: 'text-purple-400', full: biggestFile },
            { label: 'Most Edited File', value: mostEdited?.split('/').pop(), icon: TrendingUp, color: 'text-red-400', full: mostEdited },
            { label: 'Top Contributor', value: topContr, icon: User, color: 'text-orange-400' },
            { label: 'Most Active Day', value: mostCommitsDay, icon: Calendar, color: 'text-cyan-400' },
        ];
    }, [tree, commits, fileStats, contributors]);

    if (!showAISummary || commits.length === 0) return null;

    return (
        <div className="absolute right-4 top-28 w-96 max-h-[60vh] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl pointer-events-auto z-20 flex flex-col overflow-hidden custom-shadow">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-400" />
                    <span className="font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                        AI Summary
                    </span>
                </div>
                <button onClick={toggleAISummary} className="text-slate-400 hover:text-white transition">
                    <X size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {stats.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 flex items-start gap-3" title={s.full || s.value}>
                                    <Icon size={16} className={`${s.color} shrink-0 mt-0.5`} />
                                    <div className="min-w-0">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{s.label}</div>
                                        <div className="text-sm text-slate-200 font-medium truncate">{s.value}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!aiSummary && !aiSummaryLoading && !aiSummaryError && (
                    <div className="flex flex-col items-center text-center gap-4 py-6">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                            <Sparkles size={28} className="text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold mb-1">Repository Analysis</h3>
                            <p className="text-sm text-slate-400">
                                Generate an AI-powered summary of <strong className="text-slate-200">{owner}/{repoName}</strong>
                            </p>
                        </div>
                        <button
                            onClick={generateAISummary}
                            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-6 py-2.5 rounded-lg text-white font-semibold transition-all text-sm flex items-center gap-2 shadow-lg shadow-amber-900/30"
                        >
                            <Sparkles size={14} />
                            Generate Summary
                        </button>
                    </div>
                )}

                {aiSummaryLoading && (
                    <div className="flex flex-col items-center text-center gap-3 py-8">
                        <Loader2 size={32} className="text-amber-400 animate-spin" />
                        <p className="text-sm text-slate-400">Analyzing repository...</p>
                    </div>
                )}

                {aiSummaryError && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2 bg-red-900/30 border border-red-800/50 rounded-lg p-3">
                            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{aiSummaryError}</p>
                        </div>
                        <button
                            onClick={generateAISummary}
                            className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-white text-sm transition w-fit"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {aiSummary && !aiSummaryLoading && (
                    <div className="space-y-3">
                        {aiSummary.split('\n').map((paragraph, i) => {
                            if (!paragraph.trim()) return null;
                            return (
                                <p key={i} className="text-sm text-slate-300 leading-relaxed">
                                    {paragraph}
                                </p>
                            );
                        })}
                        <div className="pt-3 border-t border-slate-700/50">
                            <button
                                onClick={generateAISummary}
                                className="text-xs text-slate-500 hover:text-amber-400 transition flex items-center gap-1"
                            >
                                <Sparkles size={10} />
                                Regenerate
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AISummary;
