import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { Message, AppSettings, OllamaModelTag } from './types/chat';
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
  // App state
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('cypher_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          ollamaBaseUrl: '/api', // Ensure backend orchestrator is used
        };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('cypher_messages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [models, setModels] = useState<OllamaModelTag[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('cypher_settings', JSON.stringify(settings));
  }, [settings]);

  // Save messages to localStorage (excluding streaming state)
  useEffect(() => {
    if (!isStreaming) {
      localStorage.setItem('cypher_messages', JSON.stringify(messages));
    }
  }, [messages, isStreaming]);

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

  // Send message
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

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

    const newMessages = [...messages, userMessage, initialAssistantMessage];
    setMessages(newMessages);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const apiMessages = newMessages
        .slice(0, -1) // omit the placeholder assistant message
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
          setMessages((prev) =>
            prev.map((msg) => {
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
            })
          );
        },
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
      } else {
        console.error('Error generating response:', err);
        setMessages((prev) =>
          prev.map((msg) => {
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
          })
        );
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
    setMessages([]);
    localStorage.removeItem('cypher_messages');
  };

  const handleUpdateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden text-zinc-100 font-sans">
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
