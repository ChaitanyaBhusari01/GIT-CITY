import React from 'react';
import useStore from '../store';
import { X, FileCode, Clock, User } from 'lucide-react';
import { format } from 'date-fns';

const FileDetails = () => {
    const { selectedFile, fileHistory, fileHistoryLoading, clearSelectedFile } = useStore();

    if (!selectedFile) return null;

    const fileName = selectedFile.path.split('/').pop();
    const ext = fileName.split('.').pop();
    const sizeKB = (selectedFile.size / 1024).toFixed(1);

    // Count unique authors from fileHistory
    const authorMap = {};
    fileHistory.forEach(c => {
        if (!authorMap[c.author_name]) {
            authorMap[c.author_name] = { count: 0, avatar: c.avatar };
        }
        authorMap[c.author_name].count++;
    });
    const topAuthors = Object.entries(authorMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

    return (
        <div className="absolute left-4 top-[200px] bottom-24 w-96 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl pointer-events-auto z-30 flex flex-col overflow-hidden custom-shadow">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div className="flex items-center gap-2 min-w-0">
                    <FileCode size={18} className="text-blue-400 shrink-0" />
                    <span className="font-bold text-white truncate">{fileName}</span>
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">.{ext}</span>
                </div>
                <button onClick={clearSelectedFile} className="text-slate-400 hover:text-white transition shrink-0">
                    <X size={18} />
                </button>
            </div>

            {/* File Info */}
            <div className="p-4 border-b border-slate-700 text-sm text-slate-300 space-y-1">
                <div className="text-xs text-slate-500 font-mono truncate">{selectedFile.path}</div>
                <div className="flex gap-4 mt-2">
                    <span>{sizeKB} KB</span>
                    <span>{fileHistory.length} revisions</span>
                </div>
            </div>

            {/* Top Authors */}
            {topAuthors.length > 0 && (
                <div className="p-4 border-b border-slate-700">
                    <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                        <User size={12} /> Top Editors
                    </h3>
                    <div className="flex flex-col gap-2">
                        {topAuthors.map(([name, { count, avatar }], i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    {avatar && <img src={avatar} alt="" className="w-5 h-5 rounded-full" />}
                                    <span className="text-slate-200 truncate max-w-[200px]">{name}</span>
                                </div>
                                <span className="text-blue-400 font-mono text-xs">{count} edits</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Commit History */}
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                    <Clock size={12} /> Recent Changes
                </h3>
                {fileHistoryLoading ? (
                    <div className="text-slate-400 text-sm animate-pulse">Loading history...</div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {fileHistory.map((commit, i) => (
                            <div key={i} className="bg-slate-800/50 rounded-lg p-3 text-sm border border-slate-700/50">
                                <div className="text-white font-medium truncate">{commit.message.split('\n')[0]}</div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                    <span className="text-blue-400">{commit.author_name}</span>
                                    <span>·</span>
                                    <span>{format(new Date(commit.date), 'MMM d, yyyy')}</span>
                                </div>
                                <div className="text-xs text-slate-600 font-mono mt-1">{commit.hash.substring(0, 8)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileDetails;
