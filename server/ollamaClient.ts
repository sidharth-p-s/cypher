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
   * Fast classification to decide if web search is needed, and extract contextual query
   */
  async classifySearch(model: string, messages: ChatMessagePayload[]): Promise<SearchDecision> {
    try {
      const systemInstruction = `You are Cypher's Search Query Optimizer.
Analyze the conversation history and the latest user request to decide if a web search is needed, and construct an optimal, standalone search query.

Output valid JSON in this exact structure:
{"needSearch": boolean, "query": string}

Decision Rules:
1. Set "needSearch" to true if the latest message asks about:
   - Current news, live events, recent developments, updates, or breaking stories (even if mixed with greetings like "hello", "hey").
   - Real-time data (weather, stock prices, sports scores, release dates, current status).
   - Specific recent statements, controversies, investigations, or actions by people or organizations.
   - Any follow-up question inquiring for "more news", "latest updates", or asking what someone said or did regarding a topic.
2. Set "needSearch" to false ONLY if the user is asking for:
   - Purely conversational greetings without any question (e.g. just "hi", "how are you doing").
   - Code generation, debugging, algorithms, math problems.
   - Conceptual explanations, translations, creative writing.
   - Questions strictly about the ongoing conversation that do not require external verification.

Query Formulation Rules (CRITICAL):
- The query MUST be standalone and context-complete.
- Resolve all ambiguous pronouns ("this", "he", "it", "that", "the news", "what happened", "something") using the conversation history.
- NEVER output generic bare words like "latest news", "breaking news", "news", or "updates".
- ALWAYS incorporate the specific entities, names, companies, and subjects from the conversation (e.g., if discussing Nvidia CEO Jensen Huang and Trump, output "Donald Trump Nvidia Jensen Huang news" or "Trump comments Jensen Huang affair investigation").
- Keep the query between 2 to 6 focused search keywords.
- If needSearch is false, set "query" to "".
Do not output any markdown formatting or extra text outside the JSON object.`;

      // Extract recent conversation turns (up to last 6 messages) to maintain context
      const recentHistory = messages.slice(-6).map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content.slice(0, 1000),
      }));

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            ...recentHistory,
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

