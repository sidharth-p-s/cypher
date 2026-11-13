import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { Message, AppSettings, OllamaModelTag, ChatSession } from './types/chat';
import { OllamaService, StreamUpdate } from './services/ollama';
import { ConversationService } from './services/conversationService';

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

  // Conversations list loaded from SQLite backend
  const [sessions, setSessions] = useState<ChatSession[]>([]);

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

  // Initial load: migrate legacy sessions once (if needed) & fetch conversations from SQLite
  useEffect(() => {
    let isMounted = true;

    async function initStorage() {
      try {
        const migrated = localStorage.getItem('cypher_db_migrated');
        if (migrated !== 'true') {
          // Check for legacy sessions in localStorage
          let legacySessions: ChatSession[] = [];
          const savedSessions = localStorage.getItem('cypher_sessions');
          if (savedSessions) {
            try {
              const parsed = JSON.parse(savedSessions);
              if (Array.isArray(parsed) && parsed.length > 0) {
                legacySessions = parsed;
              }
            } catch (e) {
              console.error('Failed to parse cypher_sessions for migration:', e);
            }
          }

          // Also check legacy cypher_messages if cypher_sessions was empty
          if (legacySessions.length === 0) {
            const savedMessages = localStorage.getItem('cypher_messages');
            if (savedMessages) {
              try {
                const parsedMsgs = JSON.parse(savedMessages);
                if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
                  const firstUserMsg = parsedMsgs.find((m: Message) => m.role === 'user');
                  const title = firstUserMsg ? firstUserMsg.content.slice(0, 35) : 'Previous Conversation';
                  legacySessions = [
                    {
                      id: `session_migrated_${Date.now()}`,
                      title,
                      messages: parsedMsgs,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
                  ];
                }
              } catch (e) {
                console.error('Failed to parse cypher_messages for migration:', e);
              }
            }
          }

          if (legacySessions.length > 0) {
            console.log(`Migrating ${legacySessions.length} legacy sessions to SQLite...`);
            const res = await ConversationService.migrateLegacySessions(legacySessions);
            if (res && res.success) {
              console.log('Migration to SQLite successful:', res);
              localStorage.setItem('cypher_db_migrated', 'true');
            }
          } else {
            localStorage.setItem('cypher_db_migrated', 'true');
          }
        }

        // Fetch conversations list from SQLite
        const convList = await ConversationService.listConversations();
        if (!isMounted) return;
        setSessions(convList);

        // Restore active conversation
        const savedActiveId = localStorage.getItem('cypher_active_session');
        const targetId = savedActiveId && convList.some((c) => c.id === savedActiveId)
          ? savedActiveId
          : null;

        if (targetId) {
          setActiveSessionId(targetId);
          const activeConv = await ConversationService.getConversation(targetId);
          if (isMounted && activeConv) {
            setMessages(activeConv.messages || []);
          }
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      } catch (err) {
        console.error('Error initializing chat database persistence:', err);
      }
    }

    initStorage();

    return () => {
      isMounted = false;
    };
  }, []);

  // Persist active session ID in localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('cypher_active_session', activeSessionId);
    } else {
      localStorage.removeItem('cypher_active_session');
    }
  }, [activeSessionId]);

  // Persist settings in localStorage
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
    setActiveSessionId(null);
    localStorage.removeItem('cypher_active_session');
    setMessages([]);
  };

  // Select session
  const handleSelectSession = async (id: string) => {
    if (isStreaming) {
      handleStopStreaming();
    }
    if (id === activeSessionId) return;

    setActiveSessionId(id);
    localStorage.setItem('cypher_active_session', id);

    try {
      const conv = await ConversationService.getConversation(id);
      if (conv) {
        setMessages(conv.messages || []);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setMessages([]);
    }
  };

  // Delete session
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming && activeSessionId === id) {
      handleStopStreaming();
    }

    try {
      await ConversationService.deleteConversation(id);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }

    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);

    if (activeSessionId === id) {
      if (remaining.length > 0) {
        const nextId = remaining[0].id;
        setActiveSessionId(nextId);
        localStorage.setItem('cypher_active_session', nextId);
        try {
          const conv = await ConversationService.getConversation(nextId);
          setMessages(conv ? conv.messages || [] : []);
        } catch {
          setMessages([]);
        }
      } else {
        setActiveSessionId(null);
        localStorage.removeItem('cypher_active_session');
        setMessages([]);
      }
    }
  };

  // Clear messages in current session
  const handleClearChat = async () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    if (activeSessionId) {
      try {
        await ConversationService.clearConversationMessages(activeSessionId);
      } catch (err) {
        console.error('Failed to clear messages in database:', err);
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: 'New Conversation' } : s))
      );
    }
    setMessages([]);
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

    const sessionTitle = text.slice(0, 35);

    if (isNewSession) {
      const newSession: ChatSession = {
        id: targetSessionId!,
        title: sessionTitle,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSessions((prev) => [newSession, ...prev.filter((s) => s.id !== targetSessionId)]);
      setActiveSessionId(targetSessionId);
      localStorage.setItem('cypher_active_session', targetSessionId!);

      // Create conversation in SQLite asynchronously
      ConversationService.createConversation({
        id: targetSessionId!,
        title: sessionTitle,
      }).catch((err) => console.error('Failed to create conversation in SQLite:', err));
    } else {
      // Update session title if it was a default placeholder
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetSessionId) {
            const firstUserMsg = newMessages.find((m) => m.role === 'user');
            const title =
              (s.title === 'New Conversation' || !s.title) && firstUserMsg
                ? firstUserMsg.content.slice(0, 35)
                : s.title;
            return {
              ...s,
              title,
              updatedAt: Date.now(),
            };
          }
          return s;
        })
      );
    }

    // Persist user message to SQLite
    ConversationService.saveMessage(targetSessionId!, userMessage).catch((err) =>
      console.error('Failed to save user message to SQLite:', err)
    );

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

            // If done, persist final assistant message to SQLite
            if (update.done) {
              const finalAssistantMsg = updated.find((m) => m.id === assistantMessageId);
              if (finalAssistantMsg) {
                ConversationService.saveMessage(targetSessionId!, {
                  id: finalAssistantMsg.id,
                  role: 'assistant',
                  content: finalAssistantMsg.content,
                  thinking: finalAssistantMsg.thinking,
                  searchQuery: finalAssistantMsg.searchQuery,
                  sources: finalAssistantMsg.sources,
                  metrics: finalAssistantMsg.metrics,
                  timestamp: finalAssistantMsg.timestamp,
                }).catch((err) => console.error('Failed to save assistant message to SQLite:', err));
              }

              // Update session updatedAt and move to top
              setSessions((all) => {
                const existing = all.find((s) => s.id === targetSessionId);
                if (!existing) return all;
                const updatedSession = { ...existing, updatedAt: Date.now() };
                return [updatedSession, ...all.filter((s) => s.id !== targetSessionId)];
              });
            }

            return updated;
          });
        },
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                isStreaming: false,
                isThinkingActive: false,
                searchStatus: undefined,
              };
            }
            return msg;
          });
          const currentAsst = updated.find((m) => m.id === assistantMessageId);
          if (currentAsst && (currentAsst.content || currentAsst.thinking)) {
            ConversationService.saveMessage(targetSessionId!, {
              id: currentAsst.id,
              role: 'assistant',
              content: currentAsst.content,
              thinking: currentAsst.thinking,
              searchQuery: currentAsst.searchQuery,
              sources: currentAsst.sources,
              metrics: currentAsst.metrics,
              timestamp: currentAsst.timestamp,
            }).catch((e) => console.error('Failed to save aborted message:', e));
          }
          return updated;
        });
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
