import { SourceReference } from './types';

export class SearXNGClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.SEARXNG_URL || 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Healthcheck for SearXNG
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/search?q=ping&format=json`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Execute search and extract structured results with intelligent filtering and ranking
   */
  async search(query: string, limit: number = 6): Promise<SourceReference[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();

    try {
      // 1. Fetch search results with reliable engines first
      const primaryUrl = `${this.baseUrl}/search?q=${encodeURIComponent(
        trimmedQuery
      )}&format=json&engines=bing,qwant,yahoo,duckduckgo,google`;

      let rawResults: any[] = [];

      try {
        const res = await fetch(primaryUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CypherChat/1.0',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.results)) {
            rawResults = data.results;
          }
        }
      } catch (primaryErr) {
        console.warn('SearXNG primary engine query failed, falling back to general:', primaryErr);
      }

      // If primary engine query returned no results, fallback to general SearXNG search
      if (rawResults.length === 0) {
        const fallbackUrl = `${this.baseUrl}/search?q=${encodeURIComponent(trimmedQuery)}&format=json`;
        const res = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CypherChat/1.0',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.results)) {
            rawResults = data.results;
          }
        }
      }

      if (rawResults.length === 0) {
        return [];
      }

      // 2. Extract salient search terms from query to score relevance
      const stopwords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'and', 'or', 'about', 'latest', 'news', 'update', 'updates', 'today', 'get',
        'what', 'when', 'where', 'who', 'why', 'how', 'did', 'does', 'do', 'i', 'you', 'he', 'she', 'it'
      ]);

      const searchTerms = trimmedQuery
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopwords.has(t));

      interface ScoredResult {
        title: string;
        url: string;
        content: string;
        domain: string;
        isRootDomain: boolean;
        relevanceScore: number;
        contentLength: number;
      }

      const seenUrls = new Set<string>();
      const scoredCandidates: ScoredResult[] = [];

      for (const item of rawResults) {
        const itemUrl = item.url?.trim();
        if (!itemUrl || seenUrls.has(itemUrl)) continue;

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(itemUrl);
        } catch {
          continue;
        }

        const domain = parsedUrl.hostname.replace(/^www\./, '') || 'web';
        const isRootDomain =
          !parsedUrl.pathname || parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html';

        const title = (item.title || domain || 'Web Document').trim();
        const content = (item.content || '').trim();
        const textToMatch = `${title} ${content}`.toLowerCase();

        let relevanceScore = 0;
        for (const term of searchTerms) {
          if (textToMatch.includes(term)) {
            relevanceScore += 1;
            // Bonus points if keyword is in the article title
            if (title.toLowerCase().includes(term)) {
              relevanceScore += 2;
            }
          }
        }

        // Drop results with zero keyword relevance if search terms exist
        if (searchTerms.length > 0 && relevanceScore === 0) {
          continue;
        }

        seenUrls.add(itemUrl);
        scoredCandidates.push({
          title,
          url: itemUrl,
          content,
          domain,
          isRootDomain,
          relevanceScore,
          contentLength: content.length,
        });
      }

      // 3. Rank results: Prioritize real articles over root homepages, higher relevance, and informative snippets
      scoredCandidates.sort((a, b) => {
        // Articles before root landing pages
        if (a.isRootDomain !== b.isRootDomain) {
          return a.isRootDomain ? 1 : -1;
        }
        // Higher relevance score
        if (a.relevanceScore !== b.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        // More descriptive snippet content
        return b.contentLength - a.contentLength;
      });

      // 4. Return top formatted results
      return scoredCandidates.slice(0, limit).map((c) => ({
        title: c.title,
        url: c.url,
        content: c.content,
        domain: c.domain,
      }));
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error('SearXNG search request timed out');
      }
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        throw new Error('SearXNG search service is unreachable at ' + this.baseUrl);
      }
      throw err;
    }
  }
}

