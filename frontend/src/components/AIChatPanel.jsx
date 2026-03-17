import React, { useEffect, useRef, useState } from 'react';
import useStore from '../store';
import { X, Send, Bot, User, Loader2, AlertCircle, Sparkles, MessageSquare } from 'lucide-react';

const AIChatPanel = () => {
    const {
        showAIChat,
        closeAIChat,
        selectedFile,
        aiChatMessages,
        aiChatLoading,
        aiChatError,
        sendAIChatMessage,
        currentFileContent
    } = useStore();

    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const filePath = selectedFile?.path;
    const messages = filePath ? (aiChatMessages[filePath] || []) : [];

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, aiChatLoading]);

    // Focus input when panel opens
    useEffect(() => {
        if (showAIChat && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [showAIChat]);

    const handleSend = () => {
        if (!input.trim() || aiChatLoading) return;
        sendAIChatMessage(input);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Simple markdown-like rendering for AI responses
    const renderContent = (content) => {
        return content.split('\n').map((line, i) => {
            // Bold
            let rendered = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Inline code
            rendered = rendered.replace(/`([^`]+)`/g, '<code class="bg-slate-700/60 px-1.5 py-0.5 rounded text-blue-300 text-xs font-mono">$1</code>');
            // Bullet points
            if (rendered.trim().startsWith('- ') || rendered.trim().startsWith('• ')) {
                rendered = rendered.replace(/^(\s*)([-•])\s/, '$1<span class="text-blue-400 mr-1">•</span>');
                return <p key={i} className="ml-3 mb-1" dangerouslySetInnerHTML={{ __html: rendered }} />;
            }
            // Numbered lists
            if (/^\s*\d+\.\s/.test(rendered)) {
                return <p key={i} className="ml-3 mb-1" dangerouslySetInnerHTML={{ __html: rendered }} />;
            }
            // Headers (###)
            if (rendered.startsWith('### ')) {
                return <h4 key={i} className="font-semibold text-white mt-3 mb-1 text-sm" dangerouslySetInnerHTML={{ __html: rendered.slice(4) }} />;
            }
            if (rendered.startsWith('## ')) {
                return <h3 key={i} className="font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: rendered.slice(3) }} />;
            }
            // Empty lines
            if (!rendered.trim()) return <br key={i} />;
            // Normal paragraph
            return <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: rendered }} />;
        });
    };

    if (!showAIChat || !selectedFile) return null;

    return (
        <div
            className="absolute top-0 right-0 h-full flex flex-col z-[60] shadow-2xl"
            style={{ width: '440px' }}
        >
            {/* Glassmorphism background */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/98 via-slate-900/95 to-slate-950/98 backdrop-blur-xl border-l border-slate-700/50" />

            {/* Content container */}
            <div className="relative flex flex-col h-full">

                {/* Header */}
                <div className="flex-none border-b border-slate-700/60 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                                <Bot size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-white truncate">AI Code Assistant</h2>
                                <p className="text-[11px] text-slate-400 truncate" title={filePath}>
                                    {filePath?.split('/').pop()}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={closeAIChat}
                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {/* Welcome message if no messages yet */}
                    {messages.length === 0 && !aiChatLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                                <Sparkles size={28} className="text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold mb-1">Analyzing your code...</h3>
                                <p className="text-sm text-slate-400">The AI is reading the file and preparing an explanation.</p>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {/* Avatar */}
                            <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
                                msg.role === 'assistant'
                                    ? 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-purple-500/20'
                                    : 'bg-gradient-to-br from-blue-500 to-cyan-600 shadow-md shadow-blue-500/20'
                            }`}>
                                {msg.role === 'assistant'
                                    ? <Bot size={14} className="text-white" />
                                    : <User size={14} className="text-white" />
                                }
                            </div>

                            {/* Bubble */}
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'assistant'
                                    ? 'bg-slate-800/60 border border-slate-700/40 text-slate-300'
                                    : 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
                            }`}>
                                {msg.role === 'assistant' ? renderContent(msg.content) : <p>{msg.content}</p>}
                            </div>
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {aiChatLoading && (
                        <div className="flex gap-3">
                            <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                                <Bot size={14} className="text-white" />
                            </div>
                            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3 flex items-center gap-2">
                                <Loader2 size={14} className="text-purple-400 animate-spin" />
                                <span className="text-sm text-slate-400">Thinking...</span>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {aiChatError && (
                        <div className="flex items-start gap-2 bg-red-900/30 border border-red-800/50 rounded-xl p-3">
                            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{aiChatError}</p>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="flex-none border-t border-slate-700/60 p-3 bg-slate-900/50">
                    <div className="flex gap-2 items-end">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about this code..."
                                rows={1}
                                className="w-full bg-slate-800/70 text-white text-sm px-4 py-3 pr-4 rounded-xl border border-slate-600/50 outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15 resize-none transition-all placeholder:text-slate-500"
                                style={{ maxHeight: '120px', minHeight: '44px' }}
                                onInput={e => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                            />
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || aiChatLoading}
                            className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 flex items-center justify-center text-white transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 disabled:shadow-none"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2 text-center">
                        Press Enter to send · Shift+Enter for new line
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AIChatPanel;
