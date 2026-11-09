import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Brain, Globe } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  enableThinking: boolean;
  onToggleThinking: () => void;
  enableWebSearch: boolean;
  onToggleWebSearch: () => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  enableThinking,
  onToggleThinking,
  enableWebSearch,
  onToggleWebSearch,
  disabled = false,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming || disabled) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative max-w-4xl mx-auto w-full px-4 pb-4 pt-2">
      <div className="relative rounded-xl bg-surface-100 border border-border focus-within:border-zinc-500/80 shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-all">
        {/* Main Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything or request complex analysis..."
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-sm px-4 pt-3.5 pb-12 focus:outline-none resize-none font-sans leading-relaxed"
        />

        {/* Bottom bar of input container */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
          {/* Left tools inside input */}
          <div className="flex items-center space-x-2 pointer-events-auto">
            {/* Thinking Mode Toggle */}
            <button
              type="button"
              onClick={onToggleThinking}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border ${
                enableThinking
                  ? 'bg-blue-950/40 border-blue-600/50 text-blue-300'
                  : 'bg-surface-200 border-border text-zinc-500 hover:text-zinc-300'
              }`}
              title="Toggle Thinking Mode for step-by-step reasoning"
            >
              <Brain className={`w-3.5 h-3.5 ${enableThinking ? 'text-blue-400' : 'text-zinc-500'}`} />
              <span className="text-[11px] hidden sm:inline">Thinking:</span>
              <span className={`text-[10px] font-semibold ${enableThinking ? 'text-blue-300' : 'text-zinc-500'}`}>
                {enableThinking ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Web Search Toggle */}
            <button
              type="button"
              onClick={onToggleWebSearch}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border ${
                enableWebSearch
                  ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                  : 'bg-surface-200 border-border text-zinc-500 hover:text-zinc-300'
              }`}
              title="Toggle Web Search (SearXNG)"
            >
              <Globe className={`w-3.5 h-3.5 ${enableWebSearch ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span className="text-[11px] hidden sm:inline">Search:</span>
              <span className={`text-[10px] font-semibold ${enableWebSearch ? 'text-emerald-300' : 'text-zinc-500'}`}>
                {enableWebSearch ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Right actions: Stop or Send */}
          <div className="flex items-center space-x-2 pointer-events-auto">
            <span className="text-[11px] text-zinc-600 font-mono hidden md:inline mr-1">
              Shift + Enter for new line
            </span>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-950/70 text-red-300 border border-red-800/60 hover:bg-red-900 transition text-xs font-mono"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!input.trim() || disabled}
                className={`p-2 rounded-lg transition-all ${
                  input.trim() && !disabled
                    ? 'bg-zinc-100 hover:bg-white text-zinc-950 shadow-md cursor-pointer'
                    : 'bg-zinc-800/60 text-zinc-600 cursor-not-allowed'
                }`}
                title="Send message (Enter)"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
