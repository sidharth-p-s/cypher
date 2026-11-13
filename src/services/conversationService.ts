import { ChatSession, Message, SourceReference } from '../types/chat';

export class ConversationService {
  private static baseUrl = '/api';

  /**
   * List all conversations from SQLite
   */
  static async listConversations(): Promise<ChatSession[]> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations`);
      if (!res.ok) {
        throw new Error(`Failed to list conversations: ${res.statusText}`);
      }
      const data = await res.json();
      return (data.conversations || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: [],
      }));
    } catch (err) {
      console.error('ConversationService.listConversations error:', err);
      return [];
    }
  }

  /**
   * Retrieve a conversation and its messages from SQLite
   */
  static async getConversation(id: string): Promise<ChatSession | null> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Failed to get conversation: ${res.statusText}`);
      }
      const data = await res.json();
      const c = data.conversation;
      if (!c) return null;

      return {
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: c.messages || [],
      };
    } catch (err) {
      console.error('ConversationService.getConversation error:', err);
      return null;
    }
  }

  /**
   * Create a new conversation in SQLite
   */
  static async createConversation(payload: {
    id?: string;
    title: string;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<ChatSession | null> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Failed to create conversation: ${res.statusText}`);
      }
      const data = await res.json();
      return data.conversation;
    } catch (err) {
      console.error('ConversationService.createConversation error:', err);
      return null;
    }
  }

  /**
   * Update conversation metadata (e.g. title)
   */
  static async updateConversation(
    id: string,
    updates: { title?: string; updatedAt?: number }
  ): Promise<ChatSession | null> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        throw new Error(`Failed to update conversation: ${res.statusText}`);
      }
      const data = await res.json();
      return data.conversation;
    } catch (err) {
      console.error('ConversationService.updateConversation error:', err);
      return null;
    }
  }

  /**
   * Delete a conversation from SQLite
   */
  static async deleteConversation(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.error('ConversationService.deleteConversation error:', err);
      return false;
    }
  }

  /**
   * Save a message in SQLite
   */
  static async saveMessage(
    conversationId: string,
    message: Message
  ): Promise<Message | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        }
      );
      if (!res.ok) {
        throw new Error(`Failed to save message: ${res.statusText}`);
      }
      const data = await res.json();
      return data.message;
    } catch (err) {
      console.error('ConversationService.saveMessage error:', err);
      return null;
    }
  }

  /**
   * Update an existing message in SQLite
   */
  static async updateMessage(
    messageId: string,
    updates: Partial<Message>
  ): Promise<Message | null> {
    try {
      const res = await fetch(`${this.baseUrl}/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        throw new Error(`Failed to update message: ${res.statusText}`);
      }
      const data = await res.json();
      return data.message;
    } catch (err) {
      console.error('ConversationService.updateMessage error:', err);
      return null;
    }
  }

  /**
   * Delete a message from SQLite
   */
  static async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/messages/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.error('ConversationService.deleteMessage error:', err);
      return false;
    }
  }

  /**
   * Clear all messages in a conversation
   */
  static async clearConversationMessages(conversationId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: 'DELETE' }
      );
      return res.ok;
    } catch (err) {
      console.error('ConversationService.clearConversationMessages error:', err);
      return false;
    }
  }

  /**
   * One-time transactional migration from localStorage sessions
   */
  static async migrateLegacySessions(
    sessions: ChatSession[]
  ): Promise<{ success: boolean; migratedCount: number; messageCount: number } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/conversations/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      });
      if (!res.ok) {
        throw new Error(`Failed to migrate sessions: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.error('ConversationService.migrateLegacySessions error:', err);
      return null;
    }
  }
}
