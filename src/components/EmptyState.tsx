import React from 'react';
import { Cpu, Terminal, ArrowRight, Brain, Zap, ShieldCheck } from 'lucide-react';

interface EmptyStateProps {
  modelName: string;
  enableThinking: boolean;
  onSelectPrompt: (prompt: string) => void;
  isOnline: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  modelName,
  enableThinking,
  onSelectPrompt,
  isOnline,
}) => {
  const suggestions = [
    {
      title: 'Deep Logical Reasoning',
      desc: 'Verify if a string of brackets is valid and explain time complexity.',
      prompt: 'Write an optimal TypeScript function to validate matching brackets (), [], {} with O(n) time and O(n) space. Walk through your invariant proof in thinking mode.',
      badge: 'Reasoning',
    },
    {
      title: 'System Architecture',
      desc: 'Design a distributed rate limiter using Redis and sliding window.',
      prompt: 'Design a high-throughput distributed rate limiting system. Outline the data structures, edge cases (race conditions), and tradeoffs between token bucket vs sliding window log.',
      badge: 'Architecture',
    },
    {
      title: 'First-Principles Physics',
      desc: 'Explain quantum entanglement without using deceptive analogies.',
      prompt: 'Explain the mechanism and experimental proof of Bell inequality violations and quantum entanglement from first principles.',
      badge: 'Analysis',
    },
    {
      title: 'Code Refactoring & Security',
      desc: 'Review potential vulnerabilities in local LLM endpoints.',
      prompt: 'What are the main security vectors when exposing local Ollama API instances over LAN or public reverse proxies? Give concrete mitigation configs.',
      badge: 'Security',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full text-center">
      {/* Central Icon */}
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-2xl bg-surface-100 border border-border flex items-center justify-center text-zinc-100 shadow-2xl shadow-blue-950/20">
          <Cpu className="w-7 h-7 text-blue-400" />
        </div>
        {enableThinking && (
          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-950 border border-blue-500/60 flex items-center justify-center text-blue-300">
            <Brain className="w-3.5 h-3.5 text-blue-400" />
          </div>
        )}
      </div>

      {/* Model Title */}
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100 mb-1">
        Local Intelligence Console
      </h2>
      <p className="text-sm text-zinc-400 max-w-md mb-6 font-mono">
        Active Model: <span className="text-zinc-200 font-semibold">{modelName}</span>
        {enableThinking && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/50">
            Thinking Mode Active
          </span>
        )}
      </p>

      {/* Connection warning if offline */}
      {!isOnline && (
        <div className="mb-6 w-full max-w-lg p-3.5 rounded-lg border border-red-900/50 bg-red-950/20 text-left text-xs font-mono text-zinc-300">
          <div className="flex items-center space-x-2 text-red-400 font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span>OLLAMA SERVER NOT DETECTED ON LOCALHOST:11434</span>
          </div>
          <p className="text-zinc-400 mb-2">
            To start Ollama with your downloaded Qwen 3.5 model, run:
          </p>
          <div className="bg-[#0b0c10] p-2 rounded border border-zinc-800 text-zinc-200 select-all overflow-x-auto">
            OLLAMA_MODELS=/usr/share/ollama/.ollama/models ollama serve
          </div>
        </div>
      )}

      {/* Suggestions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full text-left">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(item.prompt)}
            className="p-3.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border hover:border-zinc-700/80 transition-all group flex flex-col justify-between text-left"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-200 group-hover:text-white transition">
                  {item.title}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-200 text-zinc-500 border border-border-subtle">
                  {item.badge}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                {item.desc}
              </p>
            </div>

            <div className="mt-3 flex items-center space-x-1 text-[11px] text-zinc-500 group-hover:text-zinc-300 transition">
              <span>Send prompt</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

