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
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage || !lastUserMessage.content.trim()) {
      const preparedMessages = this.applySystemPrompt(messages, userSystemPrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

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

    const searchContextBlock = `[LIVE WEB SEARCH CONTEXT]
Query: "${query}"
Date: ${currentDate}

${formattedSnippets}

[INSTRUCTIONS]
- Integrate relevant information from the web search results above to answer the user's inquiry accurately.
- Use inline reference citations like [1], [2] corresponding to the sources above where appropriate.
- Do not fabricate sources or URLs. Use only the provided links and facts.
- If the search results do not contain the answer, state so honestly.`;

    // Combine with system prompt or prepend
    const combinedSystemPrompt = userSystemPrompt
      ? `${userSystemPrompt}\n\n${searchContextBlock}`
      : searchContextBlock;

    const augmentedMessages = this.applySystemPrompt(messages, combinedSystemPrompt);

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

