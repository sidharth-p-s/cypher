import { OllamaClient } from './ollamaClient';
import { SearXNGClient } from './searxngClient';
import { ChatMessagePayload, SourceReference } from './types';

export interface OrchestrationResult {
  messages: ChatMessagePayload[];
  sources: SourceReference[];
  searchPerformed: boolean;
  searchHeading?: string;
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
   * Two-Stage Intelligent Web Search Workflow:
   * Stage One: Generate search heading from user request using Qwen
   * Stage Two: Query local SearXNG API (retrieve 10 results, deduplicate, normalize, rank, select best 5-8)
   * Stage Three: Synthesize final answer using the dedicated web search prompt
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

    // When Web Search is disabled: send requests directly to Ollama
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

    const originalUserQuery = messages[lastUserIdx].content.trim();

    // Stage One: Search Heading Generation
    onStatus('Understanding your question...');
    onStatus('Preparing search query...');

    let searchHeading: string;
    try {
      searchHeading = await this.ollamaClient.generateSearchHeading(model, originalUserQuery);
    } catch (headingErr: any) {
      throw new Error(`Failed to generate search heading: ${headingErr.message || headingErr}`);
    }

    if (!searchHeading || !searchHeading.trim()) {
      throw new Error('Invalid search heading returned by Qwen.');
    }

    // Stage Two: SearXNG Search (retrieve 10 results initially)
    onStatus('Searching the web...', searchHeading);

    let rawResults: any[] = [];
    try {
      rawResults = await this.searxngClient.fetchInitialResults(searchHeading, 10);
    } catch (searchErr: any) {
      // Never silently fall back to a fabricated web-search answer
      throw searchErr;
    }

    onStatus(`Retrieved ${rawResults.length} results.`, searchHeading);

    if (rawResults.length === 0) {
      throw new Error(`No search results found on the web for "${searchHeading}".`);
    }

    // Search Result Processing: deduplicate, normalize, rank, select best 5–8 results
    onStatus('Filtering and ranking results...', searchHeading);
    const sources = this.searxngClient.processAndRankResults(rawResults, originalUserQuery);

    if (sources.length === 0) {
      throw new Error(
        `No usable or relevant search results remained after filtering for "${searchHeading}".`
      );
    }

    onStatus('Analyzing relevant sources...', searchHeading);

    // Format retrieved search results with [S1], [S2] identifiers
    const formattedSearchResults = sources
      .map((src) => {
        let meta = `[${src.id}] Title: ${src.title}\nDomain: ${src.domain}`;
        if (src.publishedDate) meta += `\nPublished Date: ${src.publishedDate}`;
        if (src.engine) meta += `\nEngine: ${src.engine}`;
        return `${meta}\nExcerpt: ${src.content}`;
      })
      .join('\n\n');

    // Stage Three: Final Answer Generation Instruction
    const stageThreeInstruction = `You are an AI assistant answering a user using information retrieved from a live web search.

Original user request:
${originalUserQuery}

Search heading:
${searchHeading}

Here are the actual results retrieved from the web:

${formattedSearchResults}

Instructions:

1. Understand and answer the user's original question.
2. Analyze the retrieved information rather than merely summarizing search snippets.
3. Use relevant examples, techniques, ideas and code from the retrieved results.
4. When the user asks to build or implement something, use the retrieved information as inspiration and produce your own useful implementation.
5. Do not blindly copy code. Explain and adapt it where appropriate.
6. Never invent facts, URLs, publication dates or sources.
7. If the retrieved information is insufficient, explicitly acknowledge the limitation.
8. Do not claim to have searched for information that was not included in the supplied results.
9. Reference sources using identifiers supplied by the application.`;

    const augmentedMessages = this.applySystemPrompt(messages, stageThreeInstruction);

    // Ensure the last user message turn contains the original user question
    const targetUserIdx = augmentedMessages.map((m) => m.role).lastIndexOf('user');
    if (targetUserIdx !== -1) {
      augmentedMessages[targetUserIdx] = {
        role: 'user',
        content: originalUserQuery,
      };
    }

    onStatus('Generating answer...', searchHeading);

    return {
      messages: augmentedMessages,
      sources,
      searchPerformed: true,
      searchHeading,
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
