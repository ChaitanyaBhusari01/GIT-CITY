import React, { useMemo } from 'react';
import useStore from '../store';
import { getLanguageStats } from '../utils/getFileType';
import LANGUAGE_COLORS from '../utils/languageColors';
import { Filter } from 'lucide-react';

const LanguageFilter = () => {
    const { tree, languageFilter, setLanguageFilter } = useStore();

    const stats = useMemo(() => getLanguageStats(tree), [tree]);

    if (stats.length === 0) return null;

    // Show top languages + "All" button
    const topLanguages = stats.slice(0, 8);

    return (
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-2 custom-shadow overflow-x-auto max-w-xl">
            <Filter size={14} className="text-slate-400 shrink-0 ml-1" />

            {/* All button */}
            <button
                onClick={() => setLanguageFilter(null)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${languageFilter === null
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
            >
                All
            </button>

            {/* Language filter buttons */}
            {topLanguages.map(({ language, count }) => (
                <button
                    key={language}
                    onClick={() => setLanguageFilter(languageFilter === language ? null : language)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${languageFilter === language
                            ? 'bg-slate-700 text-white ring-1 ring-slate-500'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: LANGUAGE_COLORS[language] || '#888' }}
                    />
                    {language}
                    <span className="text-slate-500">({count})</span>
                </button>
            ))}
        </div>
    );
};

export default LanguageFilter;
