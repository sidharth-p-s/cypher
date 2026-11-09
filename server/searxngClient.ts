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
   * Execute search and extract structured results
   */
  async search(query: string, limit: number = 6): Promise<SourceReference[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();
    const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(trimmedQuery)}&format=json`;

    try {
      const res = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CypherChat/1.0',
        },
        signal: AbortSignal.timeout(6000), // 6 second timeout
      });

      if (!res.ok) {
        throw new Error(`SearXNG returned HTTP ${res.status}: ${res.statusText}`);
      }

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error('SearXNG returned invalid JSON');
      }

      const rawResults: any[] = Array.isArray(data.results) ? data.results : [];
      if (rawResults.length === 0) {
        return [];
      }

      const seenUrls = new Set<string>();
      const structuredSources: SourceReference[] = [];

      for (const item of rawResults) {
        const itemUrl = item.url?.trim();
        if (!itemUrl || seenUrls.has(itemUrl)) continue;

        let domain = '';
        try {
          const parsed = new URL(itemUrl);
          domain = parsed.hostname.replace(/^www\./, '');
        } catch {
          domain = 'web';
        }

        const title = (item.title || domain || 'Web Document').trim();
        const content = (item.content || '').trim();

        seenUrls.add(itemUrl);
        structuredSources.push({
          title,
          url: itemUrl,
          content,
          domain,
        });

        if (structuredSources.length >= limit) {
          break;
        }
      }

      return structuredSources;
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
