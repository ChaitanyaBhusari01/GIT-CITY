import React, { useEffect, useState } from 'react';
import useStore from '../store';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-yaml';
import { X, Loader2, FileCode2, AlertTriangle, Bot } from 'lucide-react';

const CodeViewerPanel = () => {
    const {
        showCodeViewer,
        currentFileContent,
        codeViewerLoading,
        codeViewerError,
        closeCodeViewer,
        selectedFile,
        fileStats,
        openAIChat,
        showAIChat
    } = useStore();

    const [width, setWidth] = useState(600);
    const [isDragging, setIsDragging] = useState(false);

    // Run Prism highlighting when content changes
    useEffect(() => {
        if (currentFileContent && !codeViewerLoading && !codeViewerError) {
            Prism.highlightAll();
        }
    }, [currentFileContent, codeViewerLoading, codeViewerError]);

    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            // Calculate new width relative to right side of screen
            // Minimum 400px, maximum 1200px or 80vw
            const newWidth = window.innerWidth - e.clientX;
            const constrainedWidth = Math.min(Math.max(newWidth, 400), Math.min(1200, window.innerWidth * 0.8));
            setWidth(constrainedWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Map file extension to Prism language
    const getLanguage = (path) => {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx': return 'javascript';
            case 'ts':
            case 'tsx': return 'typescript';
            case 'json': return 'json';
            case 'md': return 'markdown';
            case 'html': return 'markup';
            case 'css': return 'css';
            case 'yml':
            case 'yaml': return 'yaml';
            default: return 'markup';
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        return (bytes / 1024).toFixed(1) + ' KB';
    };

    if (!showCodeViewer || !selectedFile) return null;

    const stat = fileStats?.[selectedFile?.path] || { commitCount: 0, topContributor: 'Unknown' };
    const language = selectedFile ? getLanguage(selectedFile.path) : 'markup';

    return (
        <div
            className="absolute top-0 right-0 h-full bg-slate-900/95 backdrop-blur-md border-l border-slate-700/50 flex flex-col z-50 shadow-2xl transition-transform duration-300 ease-in-out"
            style={{ width: `${width}px` }}
        >
            {/* Resizer Handle */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 transition-colors z-50 ${isDragging ? 'bg-blue-500/50' : ''}`}
                onMouseDown={handleMouseDown}
            />

            {/* Header */}
            <div className="flex-none p-4 border-b border-slate-800 flex justify-between items-start bg-slate-900">
                <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                        <FileCode2 className="w-5 h-5 text-blue-400" />
                        <h2 className="text-lg font-bold text-slate-200 truncate" title={selectedFile.path.split('/').pop()}>
                            {selectedFile.path.split('/').pop()}
                        </h2>
                    </div>
                    <p className="text-xs text-slate-400 truncate" title={selectedFile.path}>
                        {selectedFile.path}
                    </p>

                    {/* Meta Stats Row */}
                    <div className="flex gap-4 mt-3 text-xs">
                        <div className="flex flex-col">
                            <span className="text-slate-500">Commits</span>
                            <span className="font-mono text-slate-300">{stat.commitCount}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-500">Top Contributor</span>
                            <span className="text-slate-300 truncate max-w-[120px]" title={stat.topContributor}>
                                {stat.topContributor}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-500">Size</span>
                            <span className="font-mono text-slate-300">
                                {currentFileContent ? formatSize(currentFileContent.size) : formatSize(selectedFile.size)}
                            </span>
                        </div>
                    </div>

                    {/* Ask AI Button */}
                    {currentFileContent?.content && !codeViewerLoading && (
                        <button
                            onClick={openAIChat}
                            className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                showAIChat
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                    : 'bg-gradient-to-r from-violet-600/20 to-purple-600/20 border border-purple-500/30 text-purple-300 hover:from-violet-600/30 hover:to-purple-600/30 hover:text-white'
                            }`}
                        >
                            <Bot size={16} />
                            {showAIChat ? 'AI Active' : '🤖 Ask AI'}
                        </button>
                    )}
                </div>

                <button
                    onClick={closeCodeViewer}
                    className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto bg-[#1d1f21] custom-scrollbar relative">
                {codeViewerLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/50 backdrop-blur-sm z-10">
                        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p className="text-sm">Fetching repository content...</p>
                    </div>
                ) : codeViewerError ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center h-full text-slate-400">
                        <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Unable to Load File</h3>
                        <p className="text-sm bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 max-w-sm text-yellow-200/80">
                            {codeViewerError}
                        </p>
                    </div>
                ) : currentFileContent && currentFileContent.content ? (
                    <pre className="!m-0 !bg-transparent !p-4 !text-sm">
                        <code className={`language-${language}`}>
                            {currentFileContent.content}
                        </code>
                    </pre>
                ) : null}
            </div>
        </div>
    );
};

export default CodeViewerPanel;
