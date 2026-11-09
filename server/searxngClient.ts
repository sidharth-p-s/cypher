import { RawSearchResult, SourceReference } from './types';

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
   * Normalize URLs to identify and eliminate duplicates effectively
   */
  normalizeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl.trim());
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      parsed.hash = '';

      // Strip common analytics and marketing tracking query parameters
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'ref',
      ];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));

      // Remove trailing slash from pathname if path is not root
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return rawUrl.trim();
    }
  }

  /**
   * Stage Two – SearXNG Search: Initially retrieve up to 10 raw search results
   */
  async fetchInitialResults(heading: string, count: number = 10): Promise<RawSearchResult[]> {
    if (!heading || !heading.trim()) {
      return [];
    }

    const trimmedHeading = heading.trim();
    const primaryUrl = `${this.baseUrl}/search?q=${encodeURIComponent(
      trimmedHeading
    )}&format=json&engines=bing,qwant,yahoo,duckduckgo,google`;

    let rawList: any[] = [];

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
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data.results)) {
            rawList = data.results;
          }
        } catch {
          throw new Error('SearXNG returned invalid JSON');
        }
      }
    } catch (primaryErr: any) {
      if (primaryErr.message && primaryErr.message.includes('invalid JSON')) {
        throw primaryErr;
      }
      if (primaryErr.name === 'TimeoutError' || primaryErr.name === 'AbortError') {
        throw new Error('SearXNG search request timed out');
      }
      if (primaryErr.code === 'ECONNREFUSED' || primaryErr.message?.includes('fetch failed')) {
        throw new Error('SearXNG search service is unreachable at ' + this.baseUrl);
      }
      console.warn('SearXNG primary engines query failed, attempting general fallback:', primaryErr.message);
    }

    // Fallback if primary returned 0 results
    if (rawList.length === 0) {
      const fallbackUrl = `${this.baseUrl}/search?q=${encodeURIComponent(trimmedHeading)}&format=json`;
      try {
        const res = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CypherChat/1.0',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          throw new Error(`SearXNG returned HTTP ${res.status}: ${res.statusText}`);
        }

        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data.results)) {
            rawList = data.results;
          }
        } catch {
          throw new Error('SearXNG returned invalid JSON');
        }
      } catch (fallbackErr: any) {
        if (fallbackErr.name === 'TimeoutError' || fallbackErr.name === 'AbortError') {
          throw new Error('SearXNG search request timed out');
        }
        if (fallbackErr.code === 'ECONNREFUSED' || fallbackErr.message?.includes('fetch failed')) {
          throw new Error('SearXNG search service is unreachable at ' + this.baseUrl);
        }
        throw fallbackErr;
      }
    }

    // Extract exactly up to the requested initial count (10)
    const initialSlice = rawList.slice(0, count);

    // Extract title, url, content, publishedDate (if available), engine (if available)
    return initialSlice.map((item) => ({
      title: (item.title || '').trim(),
      url: (item.url || '').trim(),
      content: (item.content || '').trim(),
      publishedDate: item.publishedDate ? String(item.publishedDate).trim() : undefined,
      engine: item.engine ? String(item.engine).trim() : undefined,
    }));
  }

  /**
   * Stage Two Result Processing:
   * 1. Remove duplicate URLs (with URL normalization).
   * 2. Remove empty or unusable results.
   * 3. Rank remaining results based on relevance to original user request.
   * 4. Prioritize technical explanations, implementation examples, code snippets, documentation, GitHub repos.
   * 5. Select the best 5–8 results (or available results if fewer than 5).
   */
  processAndRankResults(
    rawResults: RawSearchResult[],
    originalUserQuery: string
  ): SourceReference[] {
    if (!rawResults || rawResults.length === 0) {
      return [];
    }

    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'and', 'or', 'about', 'latest', 'news', 'update', 'updates', 'today', 'get',
      'what', 'when', 'where', 'who', 'why', 'how', 'did', 'does', 'do', 'i', 'you', 'he',
      'she', 'it', 'want', 'build', 'show', 'me', 'find', 'give', 'can'
    ]);

    const queryKeywords = originalUserQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stopwords.has(t));

    const isTechnicalQuery =
      /\b(code|python|program|app|application|framework|library|gui|ui|api|github|install|script|build|develop|example|tutorial|function|class)\b/i.test(
        originalUserQuery
      );

    const seenNormalizedUrls = new Set<string>();
    interface ScoredItem {
      raw: RawSearchResult;
      domain: string;
      isRootDomain: boolean;
      score: number;
    }

    const validCandidates: ScoredItem[] = [];

    for (const item of rawResults) {
      // 1. Remove empty or unusable results
      if (!item.url || (!item.title && !item.content)) {
        continue;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(item.url);
      } catch {
        continue; // Unusable / invalid URL
      }

      // 2. Normalize URL and remove duplicates
      const normalized = this.normalizeUrl(item.url);
      if (seenNormalizedUrls.has(normalized)) {
        continue;
      }
      seenNormalizedUrls.add(normalized);

      const domain = parsedUrl.hostname.replace(/^www\./, '') || 'web';
      const isRootDomain =
        !parsedUrl.pathname || parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html';

      const fullText = `${item.title} ${item.content}`.toLowerCase();

      // 3. Rank based on relevance to original user request
      let score = 0;
      for (const kw of queryKeywords) {
        if (fullText.includes(kw)) {
          score += 2;
        }
        if (item.title.toLowerCase().includes(kw)) {
          score += 3;
        }
      }

      // 4. Prioritize technical explanations, documentation, code, and GitHub repos
      if (isTechnicalQuery) {
        const techTerms = [
          'code', 'example', 'tutorial', 'library', 'framework', 'api', 'gui', 'ui',
          'design', 'github', 'documentation', 'guide', 'package', 'module'
        ];
        for (const term of techTerms) {
          if (fullText.includes(term)) {
            score += 1;
          }
        }

        if (
          item.url.includes('github.com') ||
          item.url.includes('docs.') ||
          item.url.includes('readthedocs.io') ||
          item.url.includes('developer.')
        ) {
          score += 4;
        }
      }

      // Root domain penalty (homepages usually contain no specific article content)
      if (isRootDomain) {
        score -= 4;
      }

      validCandidates.push({
        raw: item,
        domain,
        isRootDomain,
        score,
      });
    }

    if (validCandidates.length === 0) {
      return [];
    }

    // Sort by relevance score descending
    validCandidates.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return b.raw.content.length - a.raw.content.length;
    });

    // 5. Select the best 5–8 results (or available results if fewer than 5)
    // If fewer than five valid results are available, pass available results.
    // Do not fabricate results to fill the target count.
    let selectedCount = validCandidates.length;
    if (validCandidates.length >= 8) {
      selectedCount = 8;
    } else if (validCandidates.length >= 5) {
      selectedCount = validCandidates.length; // between 5 and 7
    } else {
      selectedCount = validCandidates.length; // fewer than 5
    }

    const selectedSlice = validCandidates.slice(0, selectedCount);

    return selectedSlice.map((candidate, idx) => ({
      id: `S${idx + 1}`,
      title: candidate.raw.title || candidate.domain || 'Web Document',
      url: candidate.raw.url,
      content: candidate.raw.content,
      domain: candidate.domain,
      publishedDate: candidate.raw.publishedDate,
      engine: candidate.raw.engine,
    }));
  }

  /**
   * Convenience search method
   */
  async search(query: string, limit: number = 8): Promise<SourceReference[]> {
    const raw10 = await this.fetchInitialResults(query, 10);
    const processed = this.processAndRankResults(raw10, query);
    return processed.slice(0, limit);
  }
}

