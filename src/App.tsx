import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { Message, AppSettings, OllamaModelTag, ChatSession } from './types/chat';
import { OllamaService, StreamUpdate } from './services/ollama';

const DEFAULT_SETTINGS: AppSettings = {
  model: 'qwen3.5:9b',
  enableThinking: true,
  enableWebSearch: false,
  systemPrompt: '',
  temperature: 0.7,
  ollamaBaseUrl: '/api',
};

export const App: React.FC = () => {
  // App settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('cypher_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          ollamaBaseUrl: '/api',
        };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Sessions state with automatic migration from legacy cypher_messages
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('cypher_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // continue to migration
      }
    }

    // Check for legacy messages to migrate
    const legacyMessagesRaw = localStorage.getItem('cypher_messages');
    if (legacyMessagesRaw) {
      try {
        const legacyMessages = JSON.parse(legacyMessagesRaw);
        if (Array.isArray(legacyMessages) && legacyMessages.length > 0) {
          const firstUserMsg = legacyMessages.find((m: Message) => m.role === 'user');
          const title = firstUserMsg ? firstUserMsg.content.slice(0, 35) : 'Previous Conversation';
          const migratedSession: ChatSession = {
            id: `session_migrated_${Date.now()}`,
            title,
            messages: legacyMessages,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          localStorage.removeItem('cypher_messages');
          return [migratedSession];
        }
      } catch {
        // ignore
      }
    }

    return [];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('cypher_active_session') || null;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  const [models, setModels] = useState<OllamaModelTag[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync active session messages on initial load or activeSessionId change
  useEffect(() => {
    if (activeSessionId) {
      const current = sessions.find((s) => s.id === activeSessionId);
      if (current) {
        setMessages(current.messages);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('cypher_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Persist active session ID
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('cypher_active_session', activeSessionId);
    } else {
      localStorage.removeItem('cypher_active_session');
    }
  }, [activeSessionId]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('cypher_settings', JSON.stringify(settings));
  }, [settings]);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  // Poll / Check backend health & models
  const checkStatusAndModels = useCallback(async () => {
    const online = await OllamaService.checkHealth(settings.ollamaBaseUrl);
    setIsOnline(online);

    if (online) {
      const fetchedModels = await OllamaService.getModels(settings.ollamaBaseUrl);
      setModels(fetchedModels);

      if (fetchedModels.length > 0) {
        const hasCurrent = fetchedModels.some((m) => m.name === settings.model);
        if (!hasCurrent) {
          const qwenMatch = fetchedModels.find((m) => m.name.includes('qwen3.5:9b') || m.name.includes('qwen'));
          if (qwenMatch) {
            setSettings((prev) => ({ ...prev, model: qwenMatch.name }));
          } else {
            setSettings((prev) => ({ ...prev, model: fetchedModels[0].name }));
          }
        }
      }
    }
  }, [settings.ollamaBaseUrl, settings.model]);

  useEffect(() => {
    checkStatusAndModels();
    const interval = setInterval(checkStatusAndModels, 8000);
    return () => clearInterval(interval);
  }, [checkStatusAndModels]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isStreaming, scrollToBottom]);

  // Create new session
  const handleNewSession = () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    // If already in a fresh empty conversation, no need to duplicate
    if (messages.length === 0 && !activeSessionId) {
      return;
    }
    // Clean up empty sessions
    setSessions((prev) => prev.filter((s) => s.messages && s.messages.length > 0));
    setActiveSessionId(null);
    setMessages([]);
  };

  // Select session
  const handleSelectSession = (id: string) => {
    if (isStreaming) {
      handleStopStreaming();
    }
    // Clean up empty sessions when switching
    setSessions((prev) => prev.filter((s) => s.id === id || (s.messages && s.messages.length > 0)));
    setActiveSessionId(id);
  };

  // Delete session
  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming && activeSessionId === id) {
      handleStopStreaming();
    }
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
      return remaining;
    });
  };

  // Send message
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Determine target session ID
    let targetSessionId = activeSessionId;
    const isNewSession = !targetSessionId || !sessions.some((s) => s.id === targetSessionId);

    if (isNewSession) {
      targetSessionId = `session_${Date.now()}`;
    }

    const userMessage: Message = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMessageId = `asst_${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thinking: '',
      searchStatus: settings.enableWebSearch ? 'Checking if web search is needed...' : undefined,
      isStreaming: true,
      isThinkingActive: settings.enableThinking,
      timestamp: Date.now(),
    };

    const newMessages = isNewSession
      ? [userMessage, initialAssistantMessage]
      : [...messages, userMessage, initialAssistantMessage];

    setMessages(newMessages);

    // Save or update session in sessions list (single source of truth)
    const sessionTitle = text.slice(0, 35);
    if (isNewSession) {
      const newSession: ChatSession = {
        id: targetSessionId!,
        title: sessionTitle,
        messages: newMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSessions((prev) => [
        newSession,
        ...prev.filter((s) => s.id !== targetSessionId && s.messages && s.messages.length > 0),
      ]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetSessionId) {
            const firstUserMsg = newMessages.find((m) => m.role === 'user');
            const title =
              (s.title === 'New Conversation' || !s.title || s.messages.length === 0) && firstUserMsg
                ? firstUserMsg.content.slice(0, 35)
                : s.title;
            return {
              ...s,
              title,
              messages: newMessages,
              updatedAt: Date.now(),
            };
          }
          return s;
        })
      );
    }

    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const apiMessages = newMessages
        .slice(0, -1) // omit placeholder assistant message
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      await OllamaService.streamChat({
        baseUrl: settings.ollamaBaseUrl,
        messages: apiMessages,
        settings,
        signal: abortController.signal,
        onUpdate: (update: StreamUpdate) => {
          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                return {
                  ...msg,
                  content: update.content,
                  thinking: update.thinking,
                  isThinkingActive: update.isThinkingActive,
                  searchStatus: update.searchStatus,
                  searchQuery: update.searchQuery ?? msg.searchQuery,
                  sources: update.sources ?? msg.sources,
                  isStreaming: !update.done,
                  metrics: update.metrics || msg.metrics,
                };
              }
              return msg;
            });

            // If done, persist final messages to sessions list
            if (update.done) {
              setSessions((all) =>
                all.map((s) => (s.id === targetSessionId ? { ...s, messages: updated, updatedAt: Date.now() } : s))
              );
            }

            return updated;
          });
        },
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
      } else {
        console.error('Error generating response:', err);
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content:
                  msg.content ||
                  `⚠️ **Error communicating with Cypher Backend**: ${err.message || 'Unknown network error'}.\n\nPlease ensure your Ollama instance (\`http://127.0.0.1:11434\`) and SearXNG (\`http://127.0.0.1:8080\`) are running.`,
                isStreaming: false,
                isThinkingActive: false,
                searchStatus: undefined,
              };
            }
            return msg;
          });
          setSessions((all) =>
            all.map((s) => (s.id === targetSessionId ? { ...s, messages: updated, updatedAt: Date.now() } : s))
          );
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleClearChat = () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [], title: 'New Conversation' } : s))
      );
    }
    setMessages([]);
  };

  const handleUpdateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden text-zinc-100 font-sans">
      {/* Collapsible Left Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        modelName={settings.model}
      />

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <Header
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          models={models}
          isOnline={isOnline}
          onRefreshModels={checkStatusAndModels}
          onClearChat={handleClearChat}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isStreaming={isStreaming}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Main Chat Stream Container */}
        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto flex flex-col">
          {messages.length === 0 ? (
            <EmptyState
              modelName={settings.model}
              enableThinking={settings.enableThinking}
              enableWebSearch={settings.enableWebSearch}
              onSelectPrompt={handleSendMessage}
              isOnline={isOnline}
            />
          ) : (
            <div className="flex-1 pb-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  modelName={settings.model}
                />
              ))}
            </div>
          )}
        </main>

        {/* Bottom Floating Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isStreaming={isStreaming}
          onStopStreaming={handleStopStreaming}
          enableThinking={settings.enableThinking}
          onToggleThinking={() =>
            handleUpdateSettings({ enableThinking: !settings.enableThinking })
          }
          enableWebSearch={settings.enableWebSearch}
          onToggleWebSearch={() =>
            handleUpdateSettings({ enableWebSearch: !settings.enableWebSearch })
          }
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleUpdateSettings}
        models={models}
      />
    </div>
  );
};

export default App;
