export interface SourceReference {
  title: string;
  url: string;
  content: string;
  domain: string;
}

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestPayload {
  model: string;
  messages: ChatMessagePayload[];
  enableThinking?: boolean;
  enableWebSearch?: boolean;
  temperature?: number;
  systemPrompt?: string;
}

export interface SearchDecision {
  needSearch: boolean;
  query: string;
}
