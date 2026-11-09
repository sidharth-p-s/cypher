import React from 'react';
import { 
  Cpu, 
  Brain, 
  Globe,
  RotateCw, 
  Trash2, 
  Settings, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { AppSettings, OllamaModelTag } from '../types/chat';

interface HeaderProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  models: OllamaModelTag[];
  isOnline: boolean;
  onRefreshModels: () => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  isStreaming: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  models,
  isOnline,
  onRefreshModels,
  onClearChat,
  onOpenSettings,
  isStreaming,
}) => {
  return (
    <header className="h-14 border-b border-border bg-surface-100/90 backdrop-blur-md px-4 flex items-center justify-between z-20 select-none">
      {/* Brand & Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-100 shadow-inner">
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-wider text-zinc-100 uppercase">
              Cypher
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

        {/* Server Status Indicator */}
        <div 
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-mono border"
          style={{
            borderColor: isOnline ? '#14532d' : '#7f1d1d',
            backgroundColor: isOnline ? 'rgba(20, 83, 45, 0.2)' : 'rgba(127, 29, 29, 0.2)',
            color: isOnline ? '#4ade80' : '#f87171'
          }}
          title={isOnline ? 'Local backend online' : 'Backend unreachable'}
        >
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">LIVE</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span>OFFLINE</span>
            </>
          )}
        </div>
      </div>

      {/* Middle: Model Selector & Quick Switches */}
      <div className="flex items-center space-x-2">
        <div className="relative flex items-center bg-surface-200 border border-border rounded-md px-2.5 py-1 text-xs">
          <span className="text-zinc-500 mr-2 font-mono hidden md:inline">MODEL:</span>
          {models.length > 0 ? (
            <select
              value={settings.model}
              onChange={(e) => onUpdateSettings({ model: e.target.value })}
              disabled={isStreaming}
              className="bg-transparent text-zinc-200 font-mono focus:outline-none cursor-pointer pr-1"
            >
              {models.map((m) => (
                <option key={m.name} value={m.name} className="bg-zinc-900 text-zinc-100">
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={settings.model}
              onChange={(e) => onUpdateSettings({ model: e.target.value })}
              disabled={isStreaming}
              placeholder="e.g. qwen3.5:9b"
              className="bg-transparent text-zinc-200 font-mono w-28 sm:w-36 focus:outline-none"
            />
          )}

          <button
            onClick={onRefreshModels}
            title="Refresh models"
            className="ml-1 p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>

        {/* Think Mode Fast Switch */}
        <button
          onClick={() => onUpdateSettings({ enableThinking: !settings.enableThinking })}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all ${
            settings.enableThinking
              ? 'bg-blue-950/40 border-blue-600/50 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
              : 'bg-surface-200 border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
          title="Toggle deep reasoning / thinking mode"
        >
          <Brain className={`w-3.5 h-3.5 ${settings.enableThinking ? 'text-blue-400 animate-pulse' : 'text-zinc-500'}`} />
          <span className="hidden sm:inline">THINK</span>
          <span className={`text-[10px] uppercase px-1 py-0.2 rounded ${
            settings.enableThinking ? 'bg-blue-500/20 text-blue-300' : 'bg-zinc-800 text-zinc-500'
          }`}>
            {settings.enableThinking ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Web Search Fast Switch */}
        <button
          onClick={() => onUpdateSettings({ enableWebSearch: !settings.enableWebSearch })}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all ${
            settings.enableWebSearch
              ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
              : 'bg-surface-200 border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
          title="Toggle Web Search (SearXNG)"
        >
          <Globe className={`w-3.5 h-3.5 ${settings.enableWebSearch ? 'text-emerald-400' : 'text-zinc-500'}`} />
          <span className="hidden sm:inline">SEARCH</span>
          <span className={`text-[10px] uppercase px-1 py-0.2 rounded ${
            settings.enableWebSearch ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
          }`}>
            {settings.enableWebSearch ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-1">
        <button
          onClick={onClearChat}
          title="Clear conversation"
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent hover:border-border transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title="Configure parameters & endpoint"
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent hover:border-border transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
