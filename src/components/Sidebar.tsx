import React from 'react';
import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft, Bot } from 'lucide-react';
import { ChatSession } from '../types/chat';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  modelName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  modelName,
}) => {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-surface-100 hover:bg-surface-50 border border-border text-zinc-400 hover:text-zinc-100 transition shadow-lg"
        title="Open conversation history"
      >
        <PanelLeft className="w-4 h-4" />
      </button>
    );
  }

  const formatTimestamp = (ts: number) => {
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="w-64 h-screen flex-shrink-0 bg-[#0d0e12] border-r border-border flex flex-col z-30 select-none">
      {/* Top Sidebar Header */}
      <div className="p-3 border-b border-border-subtle flex items-center justify-between">
        <button
          onClick={onNewSession}
          className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-surface-100 hover:bg-surface-50 border border-border hover:border-zinc-700 text-xs font-mono font-medium text-zinc-200 transition shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>New Chat</span>
        </button>

        <button
          onClick={onToggle}
          className="ml-2 p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-100 border border-transparent hover:border-border transition"
          title="Close sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Conversations ({sessions.length})
        </div>

        {sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-zinc-500 text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p>No chat history yet.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition ${
                  isActive
                    ? 'bg-surface-100 text-zinc-100 border border-border shadow-sm'
                    : 'text-zinc-400 hover:bg-surface-200/50 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                  <MessageSquare
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isActive ? 'text-blue-400' : 'text-zinc-500'
                    }`}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-sans font-medium text-[12px] leading-tight">
                      {session.title || 'New Conversation'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-600 mt-0.5">
                      {formatTimestamp(session.updatedAt || session.createdAt)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => onDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom info footer */}
      <div className="p-3 border-t border-border-subtle bg-[#0a0c0f] flex items-center justify-between text-[11px] font-mono text-zinc-500">
        <div className="flex items-center space-x-1.5 truncate">
          <Bot className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="truncate">{modelName}</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-200 border border-border-subtle text-zinc-400">
          Local
        </span>
      </div>
    </aside>
  );
};
