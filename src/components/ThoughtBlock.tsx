import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Copy, Check, Sparkles } from 'lucide-react';

interface ThoughtBlockProps {
  thinking: string;
  isActive?: boolean;
}

export const ThoughtBlock: React.FC<ThoughtBlockProps> = ({ thinking, isActive }) => {
  // If active, keep open; once finished, keep open or let user collapse
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!thinking && !isActive) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 border border-border-subtle rounded-lg bg-[#0c0e12] overflow-hidden text-xs">
      {/* Header bar of Thought Block */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#101217] hover:bg-[#15181f] text-zinc-400 hover:text-zinc-200 transition-colors select-none text-left"
      >
        <div className="flex items-center space-x-2">
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          )}

          <div className="flex items-center space-x-1.5 font-mono">
            <Brain className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-medium text-zinc-300">
              {isActive ? 'Reasoning step-by-step...' : 'Thought Process'}
            </span>
          </div>

          {isActive && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping ml-1" />
          )}
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-zinc-500">
            {thinking ? `${thinking.length} chars` : 'thinking...'}
          </span>

          {thinking && (
            <div
              role="button"
              onClick={handleCopy}
              className="p-1 hover:text-zinc-200 text-zinc-500 rounded transition-colors"
              title="Copy thought trace"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </div>
          )}
        </div>
      </button>

      {/* Thought Content */}
      {isOpen && (
        <div className="p-3 bg-[#0a0c0f] border-t border-border-subtle/60 text-zinc-400 font-mono text-[12px] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto selection:bg-zinc-800">
          {thinking || (
            <div className="flex items-center space-x-2 text-zinc-500 py-1 italic">
              <Sparkles className="w-3.5 h-3.5 text-blue-400/70 animate-spin" />
              <span>Analyzing context and formulating response...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
