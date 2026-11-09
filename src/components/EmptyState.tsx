import React from 'react';
import { Cpu, ArrowRight, Brain, Globe } from 'lucide-react';

interface EmptyStateProps {
  modelName: string;
  enableThinking: boolean;
  enableWebSearch?: boolean;
  onSelectPrompt: (prompt: string) => void;
  isOnline: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  modelName,
  enableThinking,
  enableWebSearch,
  onSelectPrompt,
  isOnline,
}) => {
  const suggestions = [
    {
      title: 'Real-time Web Search',
      desc: 'Retrieve current events, latest documentation, or recent facts.',
      prompt: 'What are the latest developments in AI and open-source models this week?',
      badge: 'Live Search',
    },
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
      title: 'First-Principles Science',
      desc: 'Explain quantum entanglement without using deceptive analogies.',
      prompt: 'Explain the mechanism and experimental proof of Bell inequality violations and quantum entanglement from first principles.',
      badge: 'Analysis',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full text-center">
      {/* Central Icon */}
      <div className="relative mb-5 flex items-center justify-center">
        <div className="w-14 h-14 rounded-2xl bg-surface-100 border border-border flex items-center justify-center text-zinc-100 shadow-2xl shadow-blue-950/20">
          <Cpu className="w-7 h-7 text-blue-400" />
        </div>
        {enableThinking && (
          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-950 border border-blue-500/60 flex items-center justify-center text-blue-300">
            <Brain className="w-3.5 h-3.5 text-blue-400" />
          </div>
        )}
        {enableWebSearch && (
          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-950 border border-emerald-500/60 flex items-center justify-center text-emerald-300">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        )}
      </div>

      {/* Model Title */}
      <h2 className="text-xl font-semibold tracking-tight text-zinc-100 mb-1">
        Local Intelligence Console
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6 font-mono text-xs text-zinc-400">
        <span>Active Model: <strong className="text-zinc-200">{modelName}</strong></span>
        {enableThinking && (
          <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/50">
            Think Mode
          </span>
        )}
        {enableWebSearch && (
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
            SearXNG Search
          </span>
        )}
      </div>

      {/* Connection warning if offline */}
      {!isOnline && (
        <div className="mb-6 w-full max-w-lg p-3.5 rounded-lg border border-red-900/50 bg-red-950/20 text-left text-xs font-mono text-zinc-300">
          <div className="flex items-center space-x-2 text-red-400 font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span>BACKEND SERVICES NOT DETECTED</span>
          </div>
          <p className="text-zinc-400 mb-2">
            Ensure the local services are running on localhost:
          </p>
          <div className="bg-[#0b0c10] p-2 rounded border border-zinc-800 text-zinc-200 select-all overflow-x-auto space-y-1">
            <div>Ollama: <code>http://127.0.0.1:11434</code></div>
            <div>SearXNG: <code>http://127.0.0.1:8080</code></div>
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
