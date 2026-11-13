import express from 'express';
import cors from 'cors';
import { OllamaClient } from './ollamaClient';
import { SearXNGClient } from './searxngClient';
import { SearchOrchestrator } from './searchOrchestrator';
import { ChatStreamer } from './chatStreamer';
import { ChatRequestPayload } from './types';
import { dbService } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
      database: {
        online: true,
        path: dbService.getPath(),
      },
    },
  });
});

/**
 * Conversations CRUD APIs
 */

// List all conversations
app.get('/api/conversations', (_req, res) => {
  try {
    const conversations = dbService.listConversations();
    res.json({ conversations });
  } catch (err: any) {
    console.error('Error listing conversations:', err);
    res.status(500).json({ error: err.message || 'Failed to list conversations' });
  }
});

// Retrieve a specific conversation with all its messages and sources
app.get('/api/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Conversation ID is required' });

    const conversation = dbService.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (err: any) {
    console.error('Error retrieving conversation:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve conversation' });
  }
});

// Create a conversation
app.post('/api/conversations', (req, res) => {
  try {
    const { id, title = 'New Conversation', createdAt, updatedAt } = req.body || {};
    const conversation = dbService.createConversation({
      id,
      title,
      createdAt,
      updatedAt,
    });
    res.status(201).json({ conversation });
  } catch (err: any) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: err.message || 'Failed to create conversation' });
  }
});

// Update conversation metadata (e.g. title)
app.patch('/api/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, updatedAt } = req.body || {};
    if (title === undefined && updatedAt === undefined) {
      return res.status(400).json({ error: 'At least one field (title, updatedAt) must be provided' });
    }

    const updated = dbService.updateConversation(id, { title, updatedAt });
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation: updated });
  } catch (err: any) {
    console.error('Error updating conversation:', err);
    res.status(500).json({ error: err.message || 'Failed to update conversation' });
  }
});

// Delete a conversation and all its messages (cascades)
app.delete('/api/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = dbService.deleteConversation(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting conversation:', err);
    res.status(500).json({ error: err.message || 'Failed to delete conversation' });
  }
});

// Clear all messages in a conversation
app.delete('/api/conversations/:id/messages', (req, res) => {
  try {
    const { id: conversationId } = req.params;
    dbService.clearConversationMessages(conversationId);
    res.json({ success: true, conversationId });
  } catch (err: any) {
    console.error('Error clearing conversation messages:', err);
    res.status(500).json({ error: err.message || 'Failed to clear messages' });
  }
});

// Save a new message in a conversation
app.post('/api/conversations/:id/messages', (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const {
      role,
      content,
      id,
      thinking,
      thinkingDurationMs,
      searchQuery,
      sources,
      metrics,
      timestamp,
    } = req.body || {};

    if (!role || content === undefined) {
      return res.status(400).json({ error: 'Fields "role" and "content" are required' });
    }
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user, assistant, or system' });
    }

    const saved = dbService.saveMessage(conversationId, {
      id,
      role,
      content,
      thinking,
      thinkingDurationMs,
      searchQuery,
      sources,
      metrics,
      timestamp,
    });

    res.status(201).json({ message: saved });
  } catch (err: any) {
    console.error('Error saving message:', err);
    res.status(500).json({ error: err.message || 'Failed to save message' });
  }
});

// Update an existing message
app.patch('/api/messages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { content, thinking, thinkingDurationMs, searchQuery, sources, metrics } = req.body || {};

    const updated = dbService.updateMessage(id, {
      content,
      thinking,
      thinkingDurationMs,
      searchQuery,
      sources,
      metrics,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: updated });
  } catch (err: any) {
    console.error('Error updating message:', err);
    res.status(500).json({ error: err.message || 'Failed to update message' });
  }
});

// Delete a message
app.delete('/api/messages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = dbService.deleteMessage(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: err.message || 'Failed to delete message' });
  }
});

// One-time transactional & idempotent migration from localStorage sessions
app.post('/api/conversations/migrate', (req, res) => {
  try {
    const { sessions } = req.body || {};
    if (!Array.isArray(sessions)) {
      return res.status(400).json({ error: 'Payload must include a "sessions" array' });
    }

    const result = dbService.migrateSessions(sessions);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Error migrating sessions:', err);
    res.status(500).json({ error: err.message || 'Failed to migrate sessions' });
  }
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
