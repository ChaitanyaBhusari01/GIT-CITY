import React, { useMemo } from 'react';
import useStore from '../store';
import { getLanguageStats } from '../utils/getFileType';
import LANGUAGE_COLORS from '../utils/languageColors';
import { BarChart3, X } from 'lucide-react';

const LanguageStats = () => {
    const { tree, showLanguageStats, toggleLanguageStats } = useStore();

    const stats = useMemo(() => getLanguageStats(tree), [tree]);

    if (!showLanguageStats || stats.length === 0) return null;

    const maxPercentage = stats[0]?.percentage || 1;

    return (
        <div className="absolute left-4 top-[200px] w-72 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl pointer-events-auto z-20 overflow-hidden custom-shadow">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <BarChart3 size={14} className="text-cyan-400" />
                    <span className="font-semibold text-sm text-white">Languages</span>
                </div>
                <button onClick={toggleLanguageStats} className="text-slate-400 hover:text-white transition">
                    <X size={14} />
                </button>
            </div>

            {/* Stats list */}
            <div className="p-3 max-h-[300px] overflow-y-auto space-y-2">
                {stats.map(({ language, count, percentage }) => (
                    <div key={language} className="flex items-center gap-2">
                        {/* Color dot */}
                        <div
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: LANGUAGE_COLORS[language] || '#888' }}
                        />
                        {/* Label */}
                        <span className="text-xs text-slate-300 w-16 truncate">{language}</span>
                        {/* Bar */}
                        <div className="flex-1 h-4 bg-slate-800 rounded-sm overflow-hidden relative">
                            <div
                                className="h-full rounded-sm transition-all duration-500"
                                style={{
                                    width: `${(percentage / maxPercentage) * 100}%`,
                                    backgroundColor: LANGUAGE_COLORS[language] || '#888',
                                    opacity: 0.7
                                }}
                            />
                        </div>
                        {/* Percentage */}
                        <span className="text-xs text-slate-400 font-mono w-10 text-right">{percentage}%</span>
                    </div>
                ))}
            </div>

            {/* Total files */}
            <div className="px-4 py-2 border-t border-slate-700/50 text-xs text-slate-500">
                {stats.reduce((sum, s) => sum + s.count, 0)} total files
            </div>
        </div>
    );
};

export default LanguageStats;
