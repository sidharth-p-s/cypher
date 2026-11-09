/**
 * Central configuration for Web Search and Webpage Content Extraction.
 */
export const SEARCH_CONFIG = {
  // Number of initial search results to fetch from SearXNG
  initialSearchResults: 10,

  // Maximum number of ranked search results to select for content extraction
  maxSelectedSearchResults: 8,

  // Concurrency limit for fetching webpages
  concurrentWebpageRequests: 3,

  // Webpage fetch request timeout in milliseconds (10 seconds)
  requestTimeoutMs: 10000,

  // Maximum downloaded HTML bytes per page (2 MB)
  maxDownloadedHtmlBytes: 2 * 1024 * 1024,

  // Maximum extracted readable content characters per page (6,000 characters)
  maxExtractedCharsPerPage: 6000,

  // Maximum sources with extracted content passed to final Qwen prompt
  maxSourcesPassedToQwen: 5,

  // Initial total extracted content budget across all sources (approx 6,000 characters / ~1,500 tokens)
  totalExtractedContentBudgetChars: 6000,

  // Maximum redirect hops permitted during webpage fetch
  maxRedirectHops: 3,

  // Default User-Agent header for fetching webpages
  fetchUserAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 CypherBot/1.0',
};

