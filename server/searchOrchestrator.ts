import { OllamaClient } from './ollamaClient';
import { SearXNGClient } from './searxngClient';
import { ChatMessagePayload, SourceReference } from './types';
import { SEARCH_CONFIG } from './searchConfig';
import { contentExtractor } from './contentExtractor';

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
   * Two-Stage Intelligent Web Search Workflow with Webpage Content Extraction:
   * Stage One: Generate search heading from user request using Qwen
   * Stage Two: Query local SearXNG API (retrieve initial results, deduplicate, normalize, rank, select best results)
   * Content Extraction: Fetch original webpages safely, extract readable content and code blocks with budget caps
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

    // Stage Two: SearXNG Search (retrieve initial results up to configured limit)
    onStatus('Searching the web...', searchHeading);

    let rawResults: any[] = [];
    try {
      rawResults = await this.searxngClient.fetchInitialResults(
        searchHeading,
        SEARCH_CONFIG.initialSearchResults
      );
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
    const rankedSources = this.searxngClient.processAndRankResults(
      rawResults,
      originalUserQuery,
      searchHeading
    );

    if (rankedSources.length === 0) {
      throw new Error(
        `No usable or relevant search results remained after filtering for "${searchHeading}".`
      );
    }

    // Limit to configured maxSelectedSearchResults (8)
    const selectedSources = rankedSources.slice(0, SEARCH_CONFIG.maxSelectedSearchResults);

    // Webpage Content Extraction
    onStatus('Extracting webpage content...', searchHeading);

    const extractedSources = await contentExtractor.extractBatch(
      selectedSources,
      originalUserQuery,
      searchHeading,
      (completed, total) => {
        onStatus(`Extracted content from ${completed} of ${total} webpages.`, searchHeading);
      }
    );

    onStatus('Analyzing retrieved information...', searchHeading);

    // Format retrieved search results and extracted webpage content with [S1], [S2] identifiers
    const formattedSearchResults = extractedSources
      .map((src) => {
        let text = `[${src.id}] Title: ${src.title}\nDomain: ${src.domain}\nURL: ${src.url}`;
        if (src.publishedDate) text += `\nPublished Date: ${src.publishedDate}`;
        if (src.engine) text += `\nEngine: ${src.engine}`;
        text += `\nSearch Snippet: ${src.content}`;

        if (src.extractionStatus === 'success' && src.extractedContent) {
          text += `\nExtracted Webpage Content:\n${src.extractedContent}`;
        } else if (src.extractionStatus === 'unavailable') {
          text += `\nExtraction Status: Content extraction unavailable for this webpage.`;
        } else if (src.extractionStatus === 'failed') {
          text += `\nExtraction Status: Failed to fetch webpage content.`;
        }

        return text;
      })
      .join('\n\n---\n\n');

    // Stage Three: Final Answer Generation Instruction
    const stageThreeInstruction = `You are answering the user's original question using information retrieved from the web.

Analyze the supplied search results and extracted webpage content.

Prioritize actual technical explanations, useful code examples, implementation steps and relevant documentation.

For programming requests, use the retrieved examples as references and inspiration to create an appropriate solution. Do not blindly copy code.

Never invent facts, code attribution, URLs or publication dates.

Use the supplied source identifiers when referencing information.

If the extracted information is insufficient, acknowledge the limitation.

Some sources may have extraction failures. Do not pretend to have read their full webpages.

Original user request:
${originalUserQuery}

Generated search heading:
${searchHeading}

Retrieved Web Sources and Content:
${formattedSearchResults}`;

    // Context budget discipline: avoid sending overly deep past turns alongside extracted webpage content
    let messagesToAugment = messages;
    if (messages.length > 5) {
      messagesToAugment = messages.slice(-5);
    }

    const augmentedMessages = this.applySystemPrompt(messagesToAugment, stageThreeInstruction);

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
      sources: extractedSources,
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
