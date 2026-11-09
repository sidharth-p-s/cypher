import { ChatMessagePayload, SearchDecision } from './types';

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.OLLAMA_URL || 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Health check for Ollama daemon
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch available models
   */
  async getTags(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as { models?: any[] };
    return data.models || [];
  }

  /**
   * Fast classification to decide if web search is needed, and extract query
   */
  async classifySearch(model: string, userMessage: string): Promise<SearchDecision> {
    try {
      const systemInstruction = `You are an intelligent search classifier. Output valid JSON in this exact structure:
{"needSearch": boolean, "query": string}

Rules:
1. Set "needSearch" to true ONLY IF answering accurately requires current/real-time information, latest news, recent documentation, today's events, weather, stock prices, or specific live facts.
2. Set "needSearch" to false for greetings, conversational chat, code generation, algorithms, math problems, summaries, translations, opinions, and general knowledge.
3. If "needSearch" is true, provide a concise, focused 2-5 word search query in "query".
4. If "needSearch" is false, set "query" to "".
Do not output any markdown formatting or extra text outside the JSON object.`;

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userMessage },
          ],
          format: 'json',
          think: false,
          stream: false,
          keep_alive: '10m',
          options: {
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`Ollama classification request failed (${res.status})`);
        return { needSearch: false, query: '' };
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const rawJson = data.message?.content?.trim() || '';
      const parsed = JSON.parse(rawJson);

      return {
        needSearch: Boolean(parsed.needSearch),
        query: typeof parsed.query === 'string' ? parsed.query.trim() : '',
      };
    } catch (err) {
      console.warn('Search classification error or timeout, defaulting to no search:', err);
      return { needSearch: false, query: '' };
    }
  }

  /**
   * Initiate streaming chat with Ollama
   */
  async createChatStream(params: {
    model: string;
    messages: ChatMessagePayload[];
    think: boolean;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        think: params.think,
        keep_alive: '10m',
        options: {
          temperature: params.temperature ?? 0.7,
        },
      }),
      signal: params.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama chat stream failed (${res.status}): ${errText || res.statusText}`);
    }

    return res;
  }
}

