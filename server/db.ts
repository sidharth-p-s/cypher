import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { ChatSession, Message, SourceReference } from '../src/types/chat';

export interface DBConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages?: Message[];
}

export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor(customPath?: string) {
    this.dbPath =
      customPath ||
      process.env.DATABASE_PATH ||
      '/home/sidharth/localmind/database/cypher.db';

    // Ensure the database directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Connect to SQLite
    this.db = new Database(this.dbPath);

    // Performance & integrity pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.initSchema();
  }

  public getPath(): string {
    return this.dbPath;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking TEXT,
        thinking_duration_ms INTEGER,
        search_query TEXT,
        metrics_json TEXT,
        timestamp INTEGER,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        source_id TEXT,
        title TEXT,
        url TEXT,
        domain TEXT,
        extraction_status TEXT,
        additional_data_json TEXT,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_message_sources_message ON message_sources(message_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    `);
  }

  // --- Conversations Operations ---

  listConversations(): DBConversation[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, 
        title, 
        created_at AS createdAt, 
        updated_at AS updatedAt 
      FROM conversations 
      ORDER BY updated_at DESC
    `);
    return stmt.all() as DBConversation[];
  }

  getConversation(id: string): DBConversation | null {
    const convStmt = this.db.prepare(`
      SELECT 
        id, 
        title, 
        created_at AS createdAt, 
        updated_at AS updatedAt 
      FROM conversations 
      WHERE id = ?
    `);
    const conv = convStmt.get(id) as DBConversation | undefined;
    if (!conv) return null;

    const msgStmt = this.db.prepare(`
      SELECT 
        id, 
        conversation_id, 
        role, 
        content, 
        thinking, 
        thinking_duration_ms, 
        search_query, 
        metrics_json, 
        timestamp 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY timestamp ASC
    `);
    const messageRows = msgStmt.all(id) as any[];

    if (messageRows.length === 0) {
      conv.messages = [];
      return conv;
    }

    const messageIds = messageRows.map((m) => m.id);
    const placeholders = messageIds.map(() => '?').join(',');
    const sourcesStmt = this.db.prepare(`
      SELECT 
        id, 
        message_id, 
        source_id, 
        title, 
        url, 
        domain, 
        extraction_status, 
        additional_data_json 
      FROM message_sources 
      WHERE message_id IN (${placeholders}) 
      ORDER BY id ASC
    `);
    const sourceRows = sourcesStmt.all(...messageIds) as any[];

    // Map sources by message_id
    const sourcesByMessage = new Map<string, SourceReference[]>();
    for (const s of sourceRows) {
      let additional: any = {};
      if (s.additional_data_json) {
        try {
          additional = JSON.parse(s.additional_data_json);
        } catch {}
      }

      const ref: SourceReference = {
        id: s.source_id || undefined,
        title: s.title || '',
        url: s.url || '',
        domain: s.domain || '',
        content: additional.content || '',
        publishedDate: additional.publishedDate || undefined,
        engine: additional.engine || undefined,
        extractionStatus: (s.extraction_status as any) || undefined,
      };

      if (!sourcesByMessage.has(s.message_id)) {
        sourcesByMessage.set(s.message_id, []);
      }
      sourcesByMessage.get(s.message_id)!.push(ref);
    }

    conv.messages = messageRows.map((row) => {
      let metrics: any = undefined;
      if (row.metrics_json) {
        try {
          metrics = JSON.parse(row.metrics_json);
        } catch {}
      }

      return {
        id: row.id,
        role: row.role,
        content: row.content,
        thinking: row.thinking || undefined,
        thinkingDurationMs: row.thinking_duration_ms ?? undefined,
        searchQuery: row.search_query || undefined,
        metrics,
        timestamp: row.timestamp,
        sources: sourcesByMessage.get(row.id) || undefined,
      };
    });

    return conv;
  }

  createConversation({
    id,
    title,
    createdAt,
    updatedAt,
  }: {
    id?: string;
    title: string;
    createdAt?: number;
    updatedAt?: number;
  }): DBConversation {
    const convId = id || `session_${Date.now()}`;
    const now = Date.now();
    const created = createdAt || now;
    const updated = updatedAt || now;

    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(convId, title, created, updated);

    return {
      id: convId,
      title,
      createdAt: created,
      updatedAt: updated,
      messages: [],
    };
  }

  updateConversation(
    id: string,
    updates: { title?: string; updatedAt?: number }
  ): DBConversation | null {
    const existing = this.getConversation(id);
    if (!existing) return null;

    const newTitle = updates.title !== undefined ? updates.title : existing.title;
    const newUpdated = updates.updatedAt !== undefined ? updates.updatedAt : Date.now();

    const stmt = this.db.prepare(`
      UPDATE conversations 
      SET title = ?, updated_at = ? 
      WHERE id = ?
    `);
    stmt.run(newTitle, newUpdated, id);

    return {
      ...existing,
      title: newTitle,
      updatedAt: newUpdated,
    };
  }

  deleteConversation(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM conversations WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  clearConversationMessages(conversationId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?');
    stmt.run(conversationId);
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId);
    return true;
  }

  // --- Messages Operations ---

  saveMessage(
    conversationId: string,
    msg: {
      id?: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      thinking?: string;
      thinkingDurationMs?: number;
      searchQuery?: string;
      sources?: SourceReference[];
      metrics?: any;
      timestamp?: number;
    }
  ): Message {
    const msgId = msg.id || (msg.role === 'user' ? `usr_${Date.now()}` : `asst_${Date.now()}`);
    const ts = msg.timestamp || Date.now();
    const metricsJson = msg.metrics ? JSON.stringify(msg.metrics) : null;

    const insertTx = this.db.transaction(() => {
      // Ensure parent conversation exists or update timestamp
      const convCheck = this.db
        .prepare('SELECT id FROM conversations WHERE id = ?')
        .get(conversationId);
      if (!convCheck) {
        // Create conversation if it doesn't exist
        const autoTitle = msg.content ? msg.content.slice(0, 35) : 'New Conversation';
        this.db
          .prepare(
            'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
          )
          .run(conversationId, autoTitle, ts, ts);
      } else {
        this.db
          .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
          .run(ts, conversationId);
      }

      // Upsert message
      const stmtMsg = this.db.prepare(`
        INSERT INTO messages (
          id, conversation_id, role, content, thinking, thinking_duration_ms, search_query, metrics_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          thinking = excluded.thinking,
          thinking_duration_ms = excluded.thinking_duration_ms,
          search_query = excluded.search_query,
          metrics_json = excluded.metrics_json,
          timestamp = excluded.timestamp
      `);
      stmtMsg.run(
        msgId,
        conversationId,
        msg.role,
        msg.content,
        msg.thinking || null,
        msg.thinkingDurationMs ?? null,
        msg.searchQuery || null,
        metricsJson,
        ts
      );

      // Replace sources if provided
      if (msg.sources && Array.isArray(msg.sources)) {
        this.db.prepare('DELETE FROM message_sources WHERE message_id = ?').run(msgId);
        const sourceStmt = this.db.prepare(`
          INSERT INTO message_sources (
            message_id, source_id, title, url, domain, extraction_status, additional_data_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const s of msg.sources) {
          const additionalData: any = {};
          if (s.content) additionalData.content = s.content;
          if (s.publishedDate) additionalData.publishedDate = s.publishedDate;
          if (s.engine) additionalData.engine = s.engine;

          sourceStmt.run(
            msgId,
            s.id || null,
            s.title || '',
            s.url || '',
            s.domain || '',
            s.extractionStatus || null,
            Object.keys(additionalData).length > 0 ? JSON.stringify(additionalData) : null
          );
        }
      }
    });

    insertTx();

    return {
      id: msgId,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      thinkingDurationMs: msg.thinkingDurationMs,
      searchQuery: msg.searchQuery,
      sources: msg.sources,
      metrics: msg.metrics,
      timestamp: ts,
    };
  }

  updateMessage(
    messageId: string,
    updates: {
      content?: string;
      thinking?: string;
      thinkingDurationMs?: number;
      searchQuery?: string;
      sources?: SourceReference[];
      metrics?: any;
    }
  ): Message | null {
    const existingStmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const existing = existingStmt.get(messageId) as any;
    if (!existing) return null;

    const newContent = updates.content !== undefined ? updates.content : existing.content;
    const newThinking = updates.thinking !== undefined ? updates.thinking : existing.thinking;
    const newThinkingDuration =
      updates.thinkingDurationMs !== undefined
        ? updates.thinkingDurationMs
        : existing.thinking_duration_ms;
    const newSearchQuery =
      updates.searchQuery !== undefined ? updates.searchQuery : existing.search_query;
    const newMetricsJson =
      updates.metrics !== undefined
        ? updates.metrics
          ? JSON.stringify(updates.metrics)
          : null
        : existing.metrics_json;

    const updateTx = this.db.transaction(() => {
      this.db
        .prepare(`
          UPDATE messages 
          SET 
            content = ?, 
            thinking = ?, 
            thinking_duration_ms = ?, 
            search_query = ?, 
            metrics_json = ? 
          WHERE id = ?
        `)
        .run(
          newContent,
          newThinking || null,
          newThinkingDuration ?? null,
          newSearchQuery || null,
          newMetricsJson,
          messageId
        );

      if (updates.sources && Array.isArray(updates.sources)) {
        this.db.prepare('DELETE FROM message_sources WHERE message_id = ?').run(messageId);
        const sourceStmt = this.db.prepare(`
          INSERT INTO message_sources (
            message_id, source_id, title, url, domain, extraction_status, additional_data_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const s of updates.sources) {
          const additionalData: any = {};
          if (s.content) additionalData.content = s.content;
          if (s.publishedDate) additionalData.publishedDate = s.publishedDate;
          if (s.engine) additionalData.engine = s.engine;

          sourceStmt.run(
            messageId,
            s.id || null,
            s.title || '',
            s.url || '',
            s.domain || '',
            s.extractionStatus || null,
            Object.keys(additionalData).length > 0 ? JSON.stringify(additionalData) : null
          );
        }
      }

      // Update parent conversation updated_at
      this.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(Date.now(), existing.conversation_id);
    });

    updateTx();

    let metricsParsed = undefined;
    if (newMetricsJson) {
      try {
        metricsParsed = JSON.parse(newMetricsJson);
      } catch {}
    }

    return {
      id: messageId,
      role: existing.role,
      content: newContent,
      thinking: newThinking || undefined,
      thinkingDurationMs: newThinkingDuration ?? undefined,
      searchQuery: newSearchQuery || undefined,
      sources: updates.sources,
      metrics: metricsParsed,
      timestamp: existing.timestamp,
    };
  }

  deleteMessage(messageId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
    const info = stmt.run(messageId);
    return info.changes > 0;
  }

  // --- Migration Operations ---

  migrateSessions(sessions: ChatSession[]): { migratedCount: number; messageCount: number } {
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return { migratedCount: 0, messageCount: 0 };
    }

    let messageCount = 0;
    let migratedCount = 0;

    const migrationTx = this.db.transaction(() => {
      const convStmt = this.db.prepare(`
        INSERT INTO conversations (id, title, created_at, updated_at) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          updated_at = excluded.updated_at
      `);

      const msgStmt = this.db.prepare(`
        INSERT INTO messages (
          id, conversation_id, role, content, thinking, thinking_duration_ms, search_query, metrics_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          thinking = excluded.thinking,
          thinking_duration_ms = excluded.thinking_duration_ms,
          search_query = excluded.search_query,
          metrics_json = excluded.metrics_json,
          timestamp = excluded.timestamp
      `);

      const delSourcesStmt = this.db.prepare(
        'DELETE FROM message_sources WHERE message_id = ?'
      );
      const sourceStmt = this.db.prepare(`
        INSERT INTO message_sources (
          message_id, source_id, title, url, domain, extraction_status, additional_data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const sess of sessions) {
        if (!sess || !sess.id) continue;
        const createdAt = sess.createdAt || Date.now();
        const updatedAt = sess.updatedAt || createdAt;
        convStmt.run(sess.id, sess.title || 'New Conversation', createdAt, updatedAt);
        migratedCount++;

        if (Array.isArray(sess.messages)) {
          for (const msg of sess.messages) {
            if (!msg || !msg.id || !msg.role) continue;
            const msgTs = msg.timestamp || createdAt;
            const metricsJson = msg.metrics ? JSON.stringify(msg.metrics) : null;

            msgStmt.run(
              msg.id,
              sess.id,
              msg.role,
              msg.content || '',
              msg.thinking || null,
              msg.thinkingDurationMs ?? null,
              msg.searchQuery || null,
              metricsJson,
              msgTs
            );
            messageCount++;

            if (msg.sources && Array.isArray(msg.sources)) {
              delSourcesStmt.run(msg.id);
              for (const s of msg.sources) {
                const additionalData: any = {};
                if (s.content) additionalData.content = s.content;
                if (s.publishedDate) additionalData.publishedDate = s.publishedDate;
                if (s.engine) additionalData.engine = s.engine;

                sourceStmt.run(
                  msg.id,
                  s.id || null,
                  s.title || '',
                  s.url || '',
                  s.domain || '',
                  s.extractionStatus || null,
                  Object.keys(additionalData).length > 0
                    ? JSON.stringify(additionalData)
                    : null
                );
              }
            }
          }
        }
      }
    });

    migrationTx();
    return { migratedCount, messageCount };
  }

  close(): void {
    this.db.close();
  }
}

export const dbService = new DatabaseService();
