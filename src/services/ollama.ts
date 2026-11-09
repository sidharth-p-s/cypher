import { AppSettings, MessageMetrics, OllamaModelTag, SourceReference } from '../types/chat';

export interface StreamUpdate {
  content: string;
  thinking?: string;
  isThinkingActive?: boolean;
  searchStatus?: string;
  searchQuery?: string;
  sources?: SourceReference[];
  done?: boolean;
  metrics?: MessageMetrics;
}

export class OllamaService {
  /**
   * Fetch available models
   */
  static async getModels(baseUrl: string = '/api'): Promise<OllamaModelTag[]> {
    try {
      const resolvedBase = !baseUrl || baseUrl === '/ollama-api' ? '/api' : baseUrl;
      const url = `${resolvedBase}/tags`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return (data.models || []) as OllamaModelTag[];
    } catch (err) {
      console.warn('Failed to fetch models:', err);
      return [];
    }
  }

  /**
   * Healthcheck to verify backend status
   */
  static async checkHealth(baseUrl: string = '/api'): Promise<boolean> {
    try {
      const resolvedBase = !baseUrl || baseUrl === '/ollama-api' ? '/api' : baseUrl;
      // Try /api/health first, then /tags
      const healthUrl = `${resolvedBase}/health`;
      const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;

      const tagsUrl = `${resolvedBase}/tags`;
      const tagsRes = await fetch(tagsUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return tagsRes.ok;
    } catch {
      return false;
    }
  }

  /**
   * Stream a chat response from Cypher Backend (with SearXNG & Ollama support)
   */
  static async streamChat({
    baseUrl = '/api',
    messages,
    settings,
    onUpdate,
    signal,
  }: {
    baseUrl: string;
    messages: { role: string; content: string }[];
    settings: AppSettings;
    onUpdate: (update: StreamUpdate) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const resolvedBase = !baseUrl || baseUrl === '/ollama-api' ? '/api' : baseUrl;
    const chatUrl = `${resolvedBase}/chat`;

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        enableThinking: settings.enableThinking,
        enableWebSearch: settings.enableWebSearch,
        temperature: settings.temperature,
        systemPrompt: settings.systemPrompt,
        // Also include raw Ollama parameters in case baseUrl points directly to Ollama
        stream: true,
        think: settings.enableThinking,
        keep_alive: '10m',
        options: {
          temperature: settings.temperature,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let accumulatedContent = '';
    let accumulatedThinking = '';
    let currentSources: SourceReference[] = [];
    let currentSearchStatus: string | undefined;
    let currentSearchQuery: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check for Server-Sent Events format (data: {...})
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'status') {
              currentSearchStatus = event.status;
              if (event.query) currentSearchQuery = event.query;
              onUpdate({
                content: accumulatedContent,
                thinking: accumulatedThinking || undefined,
                searchStatus: currentSearchStatus,
                searchQuery: currentSearchQuery,
                sources: currentSources,
              });
            } else if (event.type === 'sources') {
              currentSources = event.sources || [];
              onUpdate({
                content: accumulatedContent,
                thinking: accumulatedThinking || undefined,
                searchStatus: currentSearchStatus,
                searchQuery: currentSearchQuery,
                sources: currentSources,
              });
            } else if (event.type === 'chunk') {
              accumulatedContent = event.content ?? accumulatedContent;
              if (event.thinking !== undefined) {
                accumulatedThinking = event.thinking;
              }
              onUpdate({
                content: accumulatedContent,
                thinking: accumulatedThinking || undefined,
                isThinkingActive: event.isThinkingActive,
                searchStatus: currentSearchStatus,
                searchQuery: currentSearchQuery,
                sources: currentSources,
                metrics: event.metrics,
              });
            } else if (event.type === 'done') {
              onUpdate({
                content: accumulatedContent,
                thinking: accumulatedThinking || undefined,
                isThinkingActive: false,
                searchStatus: undefined,
                searchQuery: currentSearchQuery,
                sources: currentSources,
                done: true,
                metrics: event.metrics,
              });
              return;
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Server error occurred');
            }
          } catch (e: any) {
            if (e.message && e.message.includes('Server error')) throw e;
            console.warn('Failed to parse SSE event data:', trimmed, e);
          }
          continue;
        }

        // Direct NDJSON fallback (if pointing directly to Ollama without server)
        try {
          const parsed = JSON.parse(trimmed);
          const rawThinking = parsed.message?.thinking || '';
          const rawContent = parsed.message?.content || '';

          if (rawThinking) accumulatedThinking += rawThinking;
          if (rawContent) accumulatedContent += rawContent;

          let metrics: MessageMetrics | undefined;
          if (parsed.done) {
            const evalCount = parsed.eval_count || 0;
            const evalDurationNs = parsed.eval_duration || 0;
            const totalDurationNs = parsed.total_duration || 0;
            const tokensPerSecond =
              evalDurationNs > 0 ? evalCount / (evalDurationNs / 1e9) : undefined;

            metrics = {
              totalDurationMs: Math.round(totalDurationNs / 1e6),
              evalCount,
              evalDurationMs: Math.round(evalDurationNs / 1e6),
              tokensPerSecond: tokensPerSecond ? Math.round(tokensPerSecond * 10) / 10 : undefined,
            };
          }

          onUpdate({
            content: accumulatedContent,
            thinking: settings.enableThinking ? accumulatedThinking : undefined,
            isThinkingActive: Boolean(rawThinking),
            done: parsed.done,
            metrics,
          });
        } catch {
          // ignore non-json line
        }
      }
    }

    onUpdate({
      content: accumulatedContent,
      thinking: accumulatedThinking || undefined,
      isThinkingActive: false,
      searchStatus: undefined,
      searchQuery: currentSearchQuery,
      sources: currentSources,
      done: true,
    });
  }
}
