import React from 'react';
import { X, Server, Sliders, MessageSquare, Terminal, Copy, Check } from 'lucide-react';
import { AppSettings, OllamaModelTag } from '../types/chat';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: Partial<AppSettings>) => void;
  models: OllamaModelTag[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  models,
}) => {
  const [localSettings, setLocalSettings] = React.useState<AppSettings>(settings);
  const [copiedCmd, setCopiedCmd] = React.useState(false);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    onSave(localSettings);
    onClose();
  };

  const serveCommand = 'OLLAMA_MODELS=/usr/share/ollama/.ollama/models ollama serve';

  const copyServeCommand = () => {
    navigator.clipboard.writeText(serveCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-[#111317] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[#14171d]">
          <div className="flex items-center space-x-2 font-mono text-sm">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span className="font-semibold tracking-wide uppercase text-zinc-100">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs font-sans">
          {/* Model selection */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-mono flex items-center justify-between">
              <span>Active Model</span>
              {models.length > 0 && (
                <span className="text-[10px] text-zinc-500">{models.length} model(s) detected</span>
              )}
            </label>
            <input
              type="text"
              value={localSettings.model}
              onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
              placeholder="e.g. qwen3.5:9b"
              className="w-full px-3 py-2 rounded-lg bg-surface-200 border border-border text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* API Endpoint */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-mono">Backend API Endpoint</label>
            <input
              type="text"
              value={localSettings.ollamaBaseUrl}
              onChange={(e) => setLocalSettings({ ...localSettings, ollamaBaseUrl: e.target.value })}
              placeholder="/api or http://127.0.0.1:3001/api"
              className="w-full px-3 py-2 rounded-lg bg-surface-200 border border-border text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            />
            <p className="text-[11px] text-zinc-500">
              Default <code className="text-zinc-400">/api</code> connects to the Cypher backend which orchestrates SearXNG (<code className="text-zinc-400">http://127.0.0.1:8080</code>) and Ollama (<code className="text-zinc-400">http://127.0.0.1:11434</code>).
            </p>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center font-mono">
              <label className="text-zinc-400">Sampling Temperature</label>
              <span className="text-blue-400 font-semibold">{localSettings.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={localSettings.temperature}
              onChange={(e) => setLocalSettings({ ...localSettings, temperature: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 bg-surface-200 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-600">
              <span>0.0 (Strict / Code)</span>
              <span>0.7 (Default)</span>
              <span>1.5 (Creative)</span>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5 pt-1">
            <label className="text-zinc-400 font-mono">System Prompt</label>
            <textarea
              rows={3}
              value={localSettings.systemPrompt}
              onChange={(e) => setLocalSettings({ ...localSettings, systemPrompt: e.target.value })}
              placeholder="Custom instructions or behavioral guidelines for the assistant..."
              className="w-full px-3 py-2 rounded-lg bg-surface-200 border border-border text-zinc-100 font-sans focus:outline-none focus:border-zinc-500 resize-none leading-relaxed"
            />
          </div>

          {/* Ollama Terminal Launch Helper */}
          <div className="pt-2">
            <div className="p-3 rounded-lg bg-[#0b0d11] border border-border-subtle space-y-2">
              <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                <div className="flex items-center space-x-1.5">
                  <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Start Ollama with downloaded models:</span>
                </div>
                <button
                  type="button"
                  onClick={copyServeCommand}
                  className="hover:text-white flex items-center space-x-1 text-zinc-500"
                >
                  {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="font-mono text-[11px] text-zinc-300 bg-black/40 p-2 rounded overflow-x-auto select-all">
                {serveCommand}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-[#14171d] flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-border text-zinc-400 hover:text-white hover:bg-zinc-800 transition font-mono text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition font-mono text-xs shadow"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

