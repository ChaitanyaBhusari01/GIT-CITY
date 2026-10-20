import React, { useState, useRef, useEffect } from 'react';
import useStore from '../store';
import { Search as SearchIcon, FileCode, GitCommit, X } from 'lucide-react';

const SearchPanel = () => {
    const { searchQuery, searchResults, setSearchQuery, selectFile, setCommitIndex, commits } = useStore();
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const closeSearch = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'pointerdown' && panelRef.current?.contains(event.target)) return;
            setIsOpen(false);
        };

        document.addEventListener('pointerdown', closeSearch);
        document.addEventListener('keydown', closeSearch);
        return () => {
            document.removeEventListener('pointerdown', closeSearch);
            document.removeEventListener('keydown', closeSearch);
        };
    }, [isOpen]);

    const handleSelect = (result) => {
        if (result.type === 'file') {
            selectFile(result);
        } else if (result.type === 'commit') {
            const idx = commits.findIndex(c => c.hash === result.hash);
            if (idx >= 0) setCommitIndex(idx);
        }
        setIsOpen(false);
        setSearchQuery('');
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                title="Search files, commits, authors"
                aria-label="Search files, commits, and authors"
            >
                <SearchIcon size={18} />
            </button>
        );
    }

    return (
        <div ref={panelRef} className="pointer-events-auto absolute right-0 top-full z-[80] mt-2 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2 border-b border-slate-800 p-3">
                <SearchIcon size={16} className="shrink-0 text-blue-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files, commits, authors..."
                    aria-label="Search files, commits, and authors"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button onClick={() => { setIsOpen(false); setSearchQuery(''); }} aria-label="Close search" className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white">
                    <X size={16} />
                </button>
            </div>

            {searchResults.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                    {searchResults.map((r, i) => (
                        <button
                            key={i}
                            onClick={() => handleSelect(r)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-900"
                        >
                            {r.type === 'file' ? (
                                <FileCode size={14} className="text-blue-400 shrink-0" />
                            ) : (
                                <GitCommit size={14} className="text-green-400 shrink-0" />
                            )}
                            <span className="truncate">
                                {r.type === 'file' ? r.path : r.message?.split('\n')[0]}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {searchQuery && searchResults.length === 0 && <div className="p-4 text-sm text-slate-500">No matching files or commits.</div>}
            {!searchQuery && <div className="px-4 py-3 text-xs text-slate-600">Search files, commits, or authors</div>}
        </div>
    );
};

export default SearchPanel;
