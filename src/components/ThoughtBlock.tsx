import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Brain, Copy, Check, Sparkles } from 'lucide-react';

interface ThoughtBlockProps {
  thinking: string;
  isActive?: boolean;
  durationMs?: number;
}

export const ThoughtBlock: React.FC<ThoughtBlockProps> = ({ thinking, isActive, durationMs }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: any;
    if (isActive) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      timer = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Date.now() - startTimeRef.current);
        }
      }, 100);
    } else {
      if (startTimeRef.current && !durationMs) {
        setElapsed(Date.now() - startTimeRef.current);
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isActive, durationMs]);

  if (!thinking && !isActive) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finalDurationSec = durationMs
    ? (durationMs / 1000).toFixed(1)
    : elapsed > 0
    ? (elapsed / 1000).toFixed(1)
    : null;

  return (
    <div className="my-2.5 border border-border-subtle rounded-lg bg-[#0c0e12] overflow-hidden text-xs">
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
              {isActive ? 'Reasoning in progress...' : 'Thought Process'}
            </span>
          </div>

          {isActive ? (
            <span className="font-mono text-[11px] text-blue-400 font-semibold px-1.5 py-0.2 rounded bg-blue-950/40 border border-blue-800/40">
              {(elapsed / 1000).toFixed(1)}s
            </span>
          ) : (
            finalDurationSec && (
              <span className="font-mono text-[11px] text-zinc-500">
                · {finalDurationSec}s
              </span>
            )
          )}
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
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
              <span>Analyzing context and formulating reasoning chain...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
