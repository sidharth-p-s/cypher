import { OllamaClient } from './ollamaClient';
import { SearXNGClient } from './searxngClient';
import { ChatMessagePayload, SourceReference } from './types';

export interface OrchestrationResult {
  messages: ChatMessagePayload[];
  sources: SourceReference[];
  searchPerformed: boolean;
  searchQuery?: string;
  searchError?: string;
}

export type StatusCallback = (status: string, query?: string) => void;

export class SearchOrchestrator {
  private ollamaClient: OllamaClient;
  private searxngClient: SearXNGClient;

  constructor(ollamaClient: OllamaClient, searxngClient: SearXNGClient) {
    this.ollamaClient = ollamaClient;
    this.searxngClient = searxngClient;
  }

  /**
   * Orchestrate search detection, query generation, SearXNG querying, and context construction
   */
  async process({
    model,
    messages,
    enableWebSearch,
    userSystemPrompt,
    onStatus,
  }: {
    model: string;
    messages: ChatMessagePayload[];
    enableWebSearch: boolean;
    userSystemPrompt?: string;
    onStatus: StatusCallback;
  }): Promise<OrchestrationResult> {
    // If web search is disabled, proceed directly
    if (!enableWebSearch) {
      const preparedMessages = this.applySystemPrompt(messages, userSystemPrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    // Identify last user message
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1 || !messages[lastUserIdx].content.trim()) {
      const preparedMessages = this.applySystemPrompt(messages, userSystemPrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    const lastUserMessage = messages[lastUserIdx];

    // Step 1: Decision - check if search is necessary
    onStatus('Checking if web search is needed...');
    const decision = await this.ollamaClient.classifySearch(model, lastUserMessage.content);

    if (!decision.needSearch || !decision.query) {
      // Model decided search is not needed for this query
      const preparedMessages = this.applySystemPrompt(messages, userSystemPrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    // Step 2: Querying SearXNG
    const query = decision.query;
    onStatus(`Searching the web for "${query}"...`, query);

    let sources: SourceReference[] = [];
    let searchError: string | undefined;

    try {
      sources = await this.searxngClient.search(query, 6);
    } catch (err: any) {
      console.warn('SearXNG search failed:', err.message);
      searchError = err.message || 'SearXNG search service unavailable';
      onStatus(`Web search warning: ${searchError}. Generating response with model knowledge...`, query);
    }

    if (sources.length === 0) {
      if (!searchError) {
        onStatus(`No search results found for "${query}". Answering with model knowledge...`, query);
      }
      const preparedMessages = this.applySystemPrompt(messages, userSystemPrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: true,
        searchQuery: query,
        searchError: searchError || 'No search results found',
      };
    }

    // Step 3: Formatting retrieved context for Qwen
    onStatus('Analysing search results and synthesizing answer...', query);

    const currentDate = new Date().toISOString().split('T')[0];
    const formattedSnippets = sources
      .map(
        (src, idx) =>
          `[${idx + 1}] Title: ${src.title}\nDomain: ${src.domain}\nURL: ${src.url}\nExcerpt: ${src.content}`
      )
      .join('\n\n');

    // 1. Anti-refusal System Directive
    const searchSystemDirective = `You are Cypher, an intelligent AI assistant equipped with real-time web search capabilities via SearXNG. You have access to real-time search results provided directly in the prompt. Synthesize a direct, well-structured, and factual answer using the retrieved sources. Cite your sources using inline reference tags like [1], [2] corresponding to the numbered sources. Never claim that you lack real-time access or internet access when search results are provided.`;

    const combinedSystemPrompt = userSystemPrompt
      ? `${userSystemPrompt}\n\n${searchSystemDirective}`
      : searchSystemDirective;

    // Apply system prompt
    const augmentedMessages = this.applySystemPrompt(messages, combinedSystemPrompt);

    // 2. Put search context directly in the user turn so instruction-tuned models like Qwen use it directly
    const targetUserIdx = augmentedMessages.map((m) => m.role).lastIndexOf('user');
    if (targetUserIdx !== -1) {
      const originalUserText = augmentedMessages[targetUserIdx].content;
      augmentedMessages[targetUserIdx] = {
        role: 'user',
        content: `Context from real-time web search for "${query}" (Date: ${currentDate}):\n\n${formattedSnippets}\n\nUser Question: ${originalUserText}`,
      };
    }

    return {
      messages: augmentedMessages,
      sources,
      searchPerformed: true,
      searchQuery: query,
    };
  }

  private applySystemPrompt(
    messages: ChatMessagePayload[],
    systemContent?: string
  ): ChatMessagePayload[] {
    const list = [...messages];
    if (!systemContent?.trim()) return list;

    const existingIdx = list.findIndex((m) => m.role === 'system');
    if (existingIdx >= 0) {
      list[existingIdx] = { role: 'system', content: systemContent.trim() };
    } else {
      list.unshift({ role: 'system', content: systemContent.trim() });
    }
    return list;
  }
}
