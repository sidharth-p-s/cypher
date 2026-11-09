export interface MessageMetrics {
  totalDurationMs?: number;
  evalCount?: number;
  evalDurationMs?: number;
  tokensPerSecond?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  isThinkingActive?: boolean;
  timestamp: number;
  metrics?: MessageMetrics;
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
  systemPrompt: string;
  temperature: number;
  ollamaBaseUrl: string;
}
