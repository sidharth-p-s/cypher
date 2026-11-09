import express from 'express';
import cors from 'cors';
import { OllamaClient } from './ollamaClient';
import { SearXNGClient } from './searxngClient';
import { SearchOrchestrator } from './searchOrchestrator';
import { ChatStreamer } from './chatStreamer';
import { ChatRequestPayload } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize backend service instances
const ollamaClient = new OllamaClient(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
const searxngClient = new SearXNGClient(process.env.SEARXNG_URL || 'http://127.0.0.1:8080');
const searchOrchestrator = new SearchOrchestrator(ollamaClient, searxngClient);

/**
 * Health check endpoint for Ollama & SearXNG
 */
app.get('/api/health', async (_req, res) => {
  const [ollamaOk, searxngOk] = await Promise.all([
    ollamaClient.checkHealth(),
    searxngClient.checkHealth(),
  ]);

  res.json({
    status: 'ok',
    services: {
      ollama: {
        online: ollamaOk,
        url: 'http://127.0.0.1:11434',
      },
      searxng: {
        online: searxngOk,
        url: 'http://127.0.0.1:8080',
      },
    },
  });
});

/**
 * Proxy for available models
 */
app.get('/api/tags', async (_req, res) => {
  try {
    const models = await ollamaClient.getTags();
    res.json({ models });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Failed to fetch models from Ollama' });
  }
});

/**
 * Chat streaming endpoint with optional web-search orchestration
 */
app.post('/api/chat', async (req, res) => {
  const payload = req.body as ChatRequestPayload;
  const {
    model = 'qwen3.5:9b',
    messages = [],
    enableThinking = false,
    enableWebSearch = false,
    temperature = 0.7,
    systemPrompt = '',
  } = payload;

  const streamer = new ChatStreamer(res);
  const abortController = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    // 1. Process search orchestration if web search enabled
    const orchestrationResult = await searchOrchestrator.process({
      model,
      messages,
      enableWebSearch,
      userSystemPrompt: systemPrompt,
      onStatus: (status, query) => {
        streamer.sendStatus(status, query);
      },
    });

    if (streamer.closed) return;

    // Send sources if search was performed and sources were retrieved
    if (orchestrationResult.sources.length > 0) {
      streamer.sendSources(orchestrationResult.sources);
    }

    if (!enableWebSearch) {
      streamer.sendStatus('Generating response...');
    }

    // 2. Stream generation from Ollama
    const ollamaStreamRes = await ollamaClient.createChatStream({
      model,
      messages: orchestrationResult.messages,
      think: enableThinking,
      temperature,
      signal: abortController.signal,
    });

    await streamer.streamOllamaResponse(ollamaStreamRes, enableThinking);
  } catch (err: any) {
    if (abortController.signal.aborted) {
      console.log('Chat request aborted by client');
      return;
    }

    console.error('Chat endpoint error:', err);
    streamer.sendError(err.message || 'An error occurred while generating the response.');
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Cypher Server] Express backend running on http://127.0.0.1:${PORT}`);
});
