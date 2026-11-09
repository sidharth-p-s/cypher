import { ProcessedSearchResult, RawSearchResult, SearchProcessingMetrics, SourceReference } from './types';

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
   * 3. Evaluate results against both original query AND generated search heading.
   * 4. Enforce a minimum relevance threshold against core subject terms (penalizing matches solely on "latest").
   * 5. Prioritize technical documentation, GitHub repositories, developer blogs, tutorials, working code.
   * 6. Penalize generic news portals and landing pages.
   * 7. Select up to 8 max, preferring 4 highly relevant results without forcing 5-8 count.
   */
  processAndRankResultsDetailed(
    rawResults: RawSearchResult[],
    originalUserQuery: string,
    searchHeading?: string
  ): ProcessedSearchResult {
    const originalCount = rawResults ? rawResults.length : 0;
    if (!rawResults || rawResults.length === 0) {
      return {
        sources: [],
        metrics: {
          originalCount: 0,
          duplicatesRemoved: 0,
          rejectedIrrelevant: 0,
          finalSelectedCount: 0,
        },
      };
    }

    // Modifiers and generic filler words that should not qualify a result on their own
    const stopwordsAndModifiers = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'and', 'or', 'about', 'latest', 'recent', 'today', 'new', 'news', 'update', 'updates',
      'breaking', 'top', 'best', 'current', 'developments', 'what', 'happened', 'happend', 'find',
      'show', 'want', 'build', 'make', 'create', 'how', 'when', 'where', 'who', 'why', 'did', 'does',
      'do', 'between', 'from', 'last', 'week', 'month', 'year', 'ideas', 'projects', 'major', 'events',
      'which', 'can', 'give', 'me', 'i', 'you', 'he', 'she', 'it'
    ]);

    // Extract core subject keywords from BOTH the original query and generated heading
    const combinedQueryText = `${originalUserQuery} ${searchHeading || ''}`.toLowerCase();
    const rawTokens = combinedQueryText
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const coreKeywords = Array.from(new Set(rawTokens.filter((t) => !stopwordsAndModifiers.has(t))));

    // Generic news aggregators and tabloids to penalize/discard on non-general-news queries
    const genericNewsDomains = new Set([
      'ndtv.com',
      'timesofindia.com',
      'm.timesofindia.com',
      'hindustantimes.com',
      'm.hindustantimes.com',
      'eenadu.net',
      'news.google.com',
      'indiatimes.com',
      'dailymail.co.uk',
      'thesun.co.uk',
    ]);

    // Grammar/dictionary sites that falsely match words like "happened"
    const grammarDomains = new Set([
      'twominenglish.com',
      'dictionary.cambridge.org',
      'grammrify.com',
      'grammarmax.com',
    ]);

    const isTechnicalQuery =
      /\b(code|python|program|app|application|framework|library|gui|ui|api|github|install|script|build|develop|example|tutorial|terminal|cli|gpu|nvidia|hardware|driver)\b/i.test(
        combinedQueryText
      );

    const seenNormalizedUrls = new Set<string>();
    let duplicatesRemoved = 0;
    let rejectedIrrelevant = 0;

    interface ScoredCandidate {
      raw: RawSearchResult;
      domain: string;
      isRootDomain: boolean;
      score: number;
      coreMatchCount: number;
    }

    const scoredCandidates: ScoredCandidate[] = [];

    for (const item of rawResults) {
      // 1. Remove empty or unusable results
      if (!item.url || (!item.title && !item.content)) {
        rejectedIrrelevant++;
        continue;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(item.url);
      } catch {
        rejectedIrrelevant++;
        continue; // Unusable / invalid URL
      }

      // 2. Normalize URL and remove duplicates
      const normalized = this.normalizeUrl(item.url);
      if (seenNormalizedUrls.has(normalized)) {
        duplicatesRemoved++;
        continue;
      }
      seenNormalizedUrls.add(normalized);

      const domain = parsedUrl.hostname.replace(/^www\./, '') || 'web';
      const pathname = parsedUrl.pathname.toLowerCase();
      const isRootDomain =
        !pathname || pathname === '/' || pathname === '/index.html' || pathname === '/news' || pathname === '/latest';

      const titleLower = item.title.toLowerCase();
      const contentLower = item.content.toLowerCase();

      // 3. Evaluate Core Keyword Matches (Must match at least one substantive core topic term)
      let coreMatchCount = 0;
      let score = 0;

      for (const kw of coreKeywords) {
        let matched = false;
        if (titleLower.includes(kw)) {
          score += 4;
          matched = true;
        }
        if (pathname.includes(kw)) {
          score += 3;
          matched = true;
        }
        if (contentLower.includes(kw)) {
          score += 2;
          matched = true;
        }
        if (matched) {
          coreMatchCount++;
        }
      }

      // If the result matched NONE of the core keywords (e.g. matched ONLY "latest" or "news"), discard it!
      if (coreKeywords.length > 0 && coreMatchCount === 0) {
        rejectedIrrelevant++;
        continue;
      }

      // 4. Quality, Authority & Technical Weighting
      const isOfficialDocs =
        domain.startsWith('docs.') ||
        domain.endsWith('.readthedocs.io') ||
        domain === 'python.org' ||
        domain.startsWith('developer.') ||
        domain.includes('nvidia.com') ||
        domain === 'history.com' ||
        domain === 'britannica.com' ||
        domain === 'timeanddate.com';
      if (isOfficialDocs) score += 5;

      const isGithub = domain === 'github.com' || domain === 'gitlab.com';
      if (isGithub) score += 5;

      const isTechBlog =
        domain === 'geeksforgeeks.org' ||
        domain === 'pythonguis.com' ||
        domain === 'realpython.com' ||
        domain === 'openpython.org' ||
        domain === 'reflex.dev' ||
        domain === 'codedex.io' ||
        domain === 'libhunt.com' ||
        domain === 'pcmag.com' ||
        domain === 'buildideas.co' ||
        domain === 'onthisday.com' ||
        domain === 'letsdatascience.com';
      if (isTechBlog) score += 4;

      const isDiscussion = domain.includes('reddit.com') || domain === 'stackoverflow.com';
      if (isDiscussion) score += 3;

      // Working code signals
      if (
        /\b(pip install|import |def |class |github\.com|bash|npm |const |function |git clone)\b/i.test(
          item.content
        )
      ) {
        score += 2;
      }

      // 5. Penalties for unrelated sites, generic news portals, and root landing pages
      if (genericNewsDomains.has(domain)) {
        score -= 8;
      }
      if (grammarDomains.has(domain)) {
        score -= 8;
      }
      if (isRootDomain) {
        score -= 6;
      }
      if (item.content.length < 30) {
        score -= 3;
      }

      // 6. Minimum Relevance Threshold (score must be at least 5)
      const MIN_RELEVANCE_SCORE = 5;
      if (score < MIN_RELEVANCE_SCORE) {
        rejectedIrrelevant++;
        continue;
      }

      scoredCandidates.push({
        raw: item,
        domain,
        isRootDomain,
        score,
        coreMatchCount,
      });
    }

    // Sort by relevance score descending
    scoredCandidates.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return b.raw.content.length - a.raw.content.length;
    });

    // 7. Select final results: prefer 4 highly relevant results over 8 mixed-quality results.
    // Do not force 5-8 if fewer pass. Maximum cap is 8.
    const selectedSlice = scoredCandidates.slice(0, 8);

    const sources: SourceReference[] = selectedSlice.map((candidate, idx) => ({
      id: `S${idx + 1}`,
      title: candidate.raw.title || candidate.domain || 'Web Document',
      url: candidate.raw.url,
      content: candidate.raw.content,
      domain: candidate.domain,
      publishedDate: candidate.raw.publishedDate,
      engine: candidate.raw.engine,
    }));

    return {
      sources,
      metrics: {
        originalCount,
        duplicatesRemoved,
        rejectedIrrelevant,
        finalSelectedCount: sources.length,
      },
    };
  }

  /**
   * Convenience wrapper returning only sources
   */
  processAndRankResults(
    rawResults: RawSearchResult[],
    originalUserQuery: string,
    searchHeading?: string
  ): SourceReference[] {
    const result = this.processAndRankResultsDetailed(rawResults, originalUserQuery, searchHeading);
    return result.sources;
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

