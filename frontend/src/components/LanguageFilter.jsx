import React, { useMemo } from 'react';
import useStore from '../store';
import { getLanguageStats } from '../utils/getFileType';
import LANGUAGE_COLORS from '../utils/languageColors';
import { Check, Filter, X } from 'lucide-react';

const LanguageFilter = () => {
    const { tree, languageFilter, setLanguageFilter } = useStore();

    const stats = useMemo(() => getLanguageStats(tree), [tree]);

    if (stats.length === 0) return null;

    const topLanguages = stats.slice(0, 10);

    return (
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"><Filter size={15} /></span>
                    <div><h2 className="text-sm font-semibold text-white">Filter by language</h2><p className="text-xs text-slate-500">Show matching files in the city</p></div>
                </div>
                <button onClick={() => setLanguageFilter(null)} aria-label="Clear language filter" title="Clear filter" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-white"><X size={15} /></button>
            </div>
            <div className="max-h-[min(55vh,25rem)] overflow-y-auto p-2">
                <button
                    onClick={() => setLanguageFilter(null)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${languageFilter === null ? 'bg-blue-500/10 text-white' : 'text-slate-300 hover:bg-slate-900'}`}
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">*</span>
                    <span className="flex-1 text-sm">All languages</span>
                    {languageFilter === null && <Check size={15} className="text-blue-400" />}
                </button>
                <div className="my-1 border-t border-slate-800" />
                {topLanguages.map(({ language, count }) => {
                    const selected = languageFilter === language;
                    return (
                        <button
                            key={language}
                            onClick={() => setLanguageFilter(selected ? null : language)}
                            aria-pressed={selected}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900'}`}
                        >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10" style={{ backgroundColor: LANGUAGE_COLORS[language] || '#888' }} />
                            <span className="flex-1 truncate text-sm">{language}</span>
                            <span className="text-xs tabular-nums text-slate-500">{count} files</span>
                            {selected && <Check size={15} className="text-blue-400" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default LanguageFilter;
