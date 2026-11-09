export interface MessageMetrics {
  totalDurationMs?: number;
  evalCount?: number;
  evalDurationMs?: number;
  tokensPerSecond?: number;
}

export interface SourceReference {
  title: string;
  url: string;
  content: string;
  domain: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  thinkingDurationMs?: number;
  isStreaming?: boolean;
  isThinkingActive?: boolean;
  searchStatus?: string;
  searchQuery?: string;
  sources?: SourceReference[];
  timestamp: number;
  metrics?: MessageMetrics;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface OllamaModelTag {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface AppSettings {
  model: string;
  enableThinking: boolean;
  enableWebSearch: boolean;
  systemPrompt: string;
  temperature: number;
  ollamaBaseUrl: string;
}
