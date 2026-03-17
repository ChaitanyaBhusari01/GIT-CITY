import React, { useState, useRef, useEffect } from 'react';
import useStore from '../store';
import { Search as SearchIcon, FileCode, GitCommit, X } from 'lucide-react';

const SearchPanel = () => {
    const { searchQuery, searchResults, setSearchQuery, selectFile, setCommitIndex, commits } = useStore();
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
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
                className="pointer-events-auto bg-slate-900/80 backdrop-blur border border-slate-700 p-3 rounded-xl hover:border-blue-500 transition text-slate-400 hover:text-white"
                title="Search files, commits, authors"
            >
                <SearchIcon size={18} />
            </button>
        );
    }

    return (
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl w-96 custom-shadow overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-slate-700">
                <SearchIcon size={16} className="text-slate-400 shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files, commits, authors..."
                    className="bg-transparent text-white outline-none flex-1 text-sm"
                />
                <button onClick={() => { setIsOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-white">
                    <X size={16} />
                </button>
            </div>

            {searchResults.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                    {searchResults.map((r, i) => (
                        <button
                            key={i}
                            onClick={() => handleSelect(r)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-800 transition text-slate-300"
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

            {searchQuery && searchResults.length === 0 && (
                <div className="p-3 text-sm text-slate-500">No results found</div>
            )}
        </div>
    );
};

export default SearchPanel;
