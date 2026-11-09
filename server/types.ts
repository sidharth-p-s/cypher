export interface SourceReference {
  id?: string;
  title: string;
  url: string;
  content: string;
  domain: string;
  publishedDate?: string;
  engine?: string;
  extractionStatus?: 'success' | 'unavailable' | 'failed';
  extractedContent?: string;
}

export interface RawSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  engine?: string;
}

export interface SearchProcessingMetrics {
  originalCount: number;
  duplicatesRemoved: number;
  rejectedIrrelevant: number;
  finalSelectedCount: number;
}

export interface ProcessedSearchResult {
  sources: SourceReference[];
  metrics: SearchProcessingMetrics;
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

