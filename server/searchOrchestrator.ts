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

const BASE_SYSTEM_DIRECTIVE = `You are Cypher, an intelligent local AI assistant.
Core Directives:
1. Consistency & Memory:
   - Maintain total continuity with all previous turns in this conversation.
   - Information, news developments, events, and facts established in earlier turns are verified ground truth.
   - NEVER contradict verified conversation turns or claim that earlier assistant messages were "hallucinations", "fabricated", or "unverified rumors".
2. Direct & Helpful Responses:
   - Answer the user's questions clearly, factually, and without unnecessary disclaimers.`;

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
    const basePrompt = userSystemPrompt
      ? `${userSystemPrompt}\n\n${BASE_SYSTEM_DIRECTIVE}`
      : BASE_SYSTEM_DIRECTIVE;

    // If web search is disabled, proceed directly with memory grounding
    if (!enableWebSearch) {
      const preparedMessages = this.applySystemPrompt(messages, basePrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    // Identify last user message
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1 || !messages[lastUserIdx].content.trim()) {
      const preparedMessages = this.applySystemPrompt(messages, basePrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    // Step 1: Decision & Query Generation with full conversation context
    onStatus('Checking if web search is needed...');
    const decision = await this.ollamaClient.classifySearch(model, messages);

    if (!decision.needSearch || !decision.query) {
      // Model decided search is not needed for this query
      const preparedMessages = this.applySystemPrompt(messages, basePrompt);
      return {
        messages: preparedMessages,
        sources: [],
        searchPerformed: false,
      };
    }

    // Step 2: Sanitize query to ensure it is context-complete and never generic
    const query = this.sanitizeSearchQuery(decision.query, messages);
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
      const preparedMessages = this.applySystemPrompt(messages, basePrompt);
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

    // 1. Anti-refusal and Non-contradiction System Directive
    const searchSystemDirective = `${basePrompt}

Search Guidelines:
- You have real-time web search results retrieved specifically for the user's question ("${query}").
- Synthesize an accurate, direct, well-structured answer citing your sources with inline reference numbers like [1], [2].
- Search Scope & Continuity:
  - The provided search results reflect the specific query just executed.
  - DO NOT assume that because an earlier topic is not repeated in the current search snippets, it didn't happen or was fake.
  - NEVER claim or suggest that earlier assistant responses or news in this conversation were "fabricated", "hallucinations", or "unverified rumors".
  - If the search results do not contain an answer to a specific question (e.g. no statement from a person was found), simply explain factually what the search results show without questioning the premise or contradicting previous turns.
- Never claim you lack real-time access or internet access when search results are provided.`;

    // Apply system prompt
    const augmentedMessages = this.applySystemPrompt(messages, searchSystemDirective);

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

  /**
   * Ensure search query never consists solely of generic terms like "latest news"
   */
  private sanitizeSearchQuery(rawQuery: string, messages: ChatMessagePayload[]): string {
    let clean = rawQuery.trim().replace(/^["']|["']$/g, '');
    const genericWords = new Set([
      'latest', 'news', 'breaking', 'update', 'updates', 'today', 'search', 'info',
      'get', 'the', 'a', 'an', 'is', 'current', 'recent', 'live'
    ]);
    const terms = clean.toLowerCase().split(/\s+/).filter((t) => t && !genericWords.has(t));

    // If query contains only generic words (e.g. "latest news", "breaking news", "updates")
    if (terms.length === 0) {
      const recentText = messages
        .slice(-4)
        .map((m) => m.content)
        .join(' ');

      const words = recentText.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
      const ignored = new Set([
        'Cypher', 'Assistant', 'User', 'Context', 'Date', 'Question', 'URL', 'Title',
        'Hello', 'Please', 'What', 'When', 'Where', 'Which', 'Why', 'How', 'There'
      ]);
      const salient = Array.from(new Set(words.filter((w) => !ignored.has(w))));

      if (salient.length > 0) {
        clean = `${salient.slice(0, 3).join(' ')} ${clean}`.trim();
      }
    }
    return clean;
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
