import { Response } from 'express';
import { SourceReference } from './types';

export class ChatStreamer {
  private res: Response;
  private isClosed: boolean = false;

  constructor(res: Response) {
    this.res = res;

    // Set Server-Sent Events (SSE) headers
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders?.();

    this.res.on('close', () => {
      this.isClosed = true;
    });
  }

  get closed(): boolean {
    return this.isClosed;
  }

  sendEvent(event: any) {
    if (this.isClosed) return;
    try {
      this.res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      console.warn('Failed to write SSE event:', err);
    }
  }

  sendStatus(status: string, query?: string) {
    this.sendEvent({
      type: 'status',
      status,
      query,
    });
  }

  sendSources(sources: SourceReference[]) {
    this.sendEvent({
      type: 'sources',
      sources,
    });
  }

  sendChunk(data: {
    content: string;
    thinking?: string;
    isThinkingActive?: boolean;
    metrics?: any;
  }) {
    this.sendEvent({
      type: 'chunk',
      ...data,
    });
  }

  sendDone(metrics?: any) {
    this.sendEvent({
      type: 'done',
      metrics,
    });
    if (!this.isClosed) {
      this.res.end();
      this.isClosed = true;
    }
  }

  sendError(errorMessage: string) {
    this.sendEvent({
      type: 'error',
      error: errorMessage,
    });
    if (!this.isClosed) {
      this.res.end();
      this.isClosed = true;
    }
  }

  /**
   * Pipe Ollama stream directly to client with real-time thinking and content separation
   */
  async streamOllamaResponse(
    ollamaStreamResponse: globalThis.Response,
    enableThinking: boolean
  ): Promise<void> {
    if (!ollamaStreamResponse.body) {
      throw new Error('Ollama response body is empty');
    }

    const reader = ollamaStreamResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    let accumulatedContent = '';
    let accumulatedThinking = '';
    let isThinkingActive = false;

    while (true) {
      if (this.isClosed) {
        reader.cancel().catch(() => {});
        break;
      }

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

          if (rawThinkingChunk) {
            accumulatedThinking += rawThinkingChunk;
            isThinkingActive = true;
          }

          if (rawContentChunk) {
            if (isThinkingActive && !rawThinkingChunk) {
              isThinkingActive = false;
            }

            if (rawContentChunk.includes('<think>') || accumulatedContent.includes('<think>')) {
              accumulatedContent += rawContentChunk;
              const parsedInline = this.parseInlineThoughtTags(accumulatedContent);
              accumulatedThinking =
                (accumulatedThinking ? accumulatedThinking + '\n' : '') + parsedInline.thinking;
              accumulatedContent = parsedInline.content;
              isThinkingActive = parsedInline.isThinkingActive;
            } else {
              accumulatedContent += rawContentChunk;
            }
          }

          let metrics: any;
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

          const finalThinking = enableThinking ? accumulatedThinking : undefined;

          this.sendChunk({
            content: accumulatedContent,
            thinking: finalThinking,
            isThinkingActive,
            metrics,
          });

          if (parsed.done) {
            this.sendDone(metrics);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse stream line:', trimmed);
        }
      }
    }

    this.sendDone();
  }

  private parseInlineThoughtTags(text: string): {
    thinking: string;
    content: string;
    isThinkingActive: boolean;
  } {
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

