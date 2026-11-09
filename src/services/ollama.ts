import { AppSettings, MessageMetrics, OllamaModelTag } from '../types/chat';

export interface StreamUpdate {
  content: string;
  thinking?: string;
  isThinkingActive?: boolean;
  done?: boolean;
  metrics?: MessageMetrics;
}

export class OllamaService {
  /**
   * Fetch available models from Ollama
   */
  static async getModels(baseUrl: string): Promise<OllamaModelTag[]> {
    try {
      const url = `${baseUrl}/tags`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return (data.models || []) as OllamaModelTag[];
    } catch (err) {
      console.warn('Failed to fetch models from Ollama:', err);
      return [];
    }
  }

  /**
   * Healthcheck to verify Ollama status
   */
  static async checkHealth(baseUrl: string): Promise<boolean> {
    try {
      const tagsUrl = `${baseUrl}/tags`;
      const res = await fetch(tagsUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Stream a chat response from Ollama
   */
  static async streamChat({
    baseUrl,
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
    const chatUrl = `${baseUrl}/chat`;

    // Prepare system messages and conversation history
    const payloadMessages = [...messages];

    let systemContent = settings.systemPrompt?.trim() || '';
    if (settings.enableThinking) {
      const thinkInstruction = 'You are in deep reasoning mode. Provide a meticulous, thorough step-by-step analysis and reasoning process before answering.';
      systemContent = systemContent ? `${systemContent}\n\n${thinkInstruction}` : thinkInstruction;
    } else {
      const directInstruction = 'Be direct, clear, and concise. Provide the final response directly without verbose reasoning traces.';
      systemContent = systemContent ? `${systemContent}\n\n${directInstruction}` : directInstruction;
    }

    if (systemContent) {
      const existingSysIdx = payloadMessages.findIndex((m) => m.role === 'system');
      if (existingSysIdx >= 0) {
        payloadMessages[existingSysIdx] = { role: 'system', content: systemContent };
      } else {
        payloadMessages.unshift({ role: 'system', content: systemContent });
      }
    }

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        messages: payloadMessages,
        stream: true,
        options: {
          temperature: settings.temperature,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let accumulatedThinking = '';
    let accumulatedContent = '';
    let isThinkingActive = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          const rawThinkingChunk = parsed.message?.thinking || '';
          const rawContentChunk = parsed.message?.content || '';

          // 1. Check for native Ollama thinking field (supported by qwen3.5, deepseek, etc.)
          if (rawThinkingChunk) {
            accumulatedThinking += rawThinkingChunk;
            isThinkingActive = true;
          }

          if (rawContentChunk) {
            // Once content starts arriving, thinking phase is completed
            if (isThinkingActive && !rawThinkingChunk) {
              isThinkingActive = false;
            }

            // Check if model emitted inline <think> tags within content
            if (rawContentChunk.includes('<think>') || accumulatedContent.includes('<think>')) {
              accumulatedContent += rawContentChunk;
              const parsedInline = this.parseInlineThoughtTags(accumulatedContent);
              accumulatedThinking = (accumulatedThinking ? accumulatedThinking + '\n' : '') + parsedInline.thinking;
              accumulatedContent = parsedInline.content;
              isThinkingActive = parsedInline.isThinkingActive;
            } else {
              accumulatedContent += rawContentChunk;
            }
          }

          let metrics: MessageMetrics | undefined;
          if (parsed.done) {
            isThinkingActive = false;
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

          // If user disabled thinking mode, don't surface thinking if they didn't want it
          const finalThinking = settings.enableThinking ? accumulatedThinking : undefined;

          onUpdate({
            content: accumulatedContent,
            thinking: finalThinking || undefined,
            isThinkingActive,
            done: parsed.done,
            metrics,
          });
        } catch (e) {
          console.warn('Failed to parse line chunk:', trimmed, e);
        }
      }
    }
  }

  /**
   * Helper to parse inline <think>...</think> tags if present in content
   */
  static parseInlineThoughtTags(text: string): { thinking: string; content: string; isThinkingActive: boolean } {
    const thinkOpenIndex = text.indexOf('<think>');
    if (thinkOpenIndex === -1) {
      return { thinking: '', content: text, isThinkingActive: false };
    }

    const thinkCloseIndex = text.indexOf('</think>');
    if (thinkCloseIndex === -1) {
      const preThink = text.slice(0, thinkOpenIndex);
      const thinking = text.slice(thinkOpenIndex + 7);
      return {
        thinking: thinking.trimStart(),
        content: preThink.trim(),
        isThinkingActive: true,
      };
    }

    const preThink = text.slice(0, thinkOpenIndex);
    const thinking = text.slice(thinkOpenIndex + 7, thinkCloseIndex).trim();
    const postThink = text.slice(thinkCloseIndex + 8).trimStart();

    return {
      thinking,
      content: (preThink + (preThink && postThink ? '\n' : '') + postThink).trim(),
      isThinkingActive: false,
    };
  }
}
