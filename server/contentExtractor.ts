import * as dns from 'dns';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { SEARCH_CONFIG } from './searchConfig';
import { SourceReference } from './types';

export interface ExtractionResult {
  url: string;
  status: 'success' | 'unavailable' | 'failed';
  title?: string;
  extractedContent?: string;
  error?: string;
}

/**
 * SSRF Security Validator
 */
export class SSRFValidator {
  private static BLOCKED_PORTS = new Set([
    11434, // Ollama
    8080,  // SearXNG (local)
    3001,  // Cypher backend
    5173,  // Cypher frontend
    22,    // SSH
    25,    // SMTP
    23,    // Telnet
    3306,  // MySQL
    5432,  // PostgreSQL
    6379,  // Redis
    27017, // MongoDB
  ]);

  /**
   * Validate a URL against SSRF attack vectors.
   */
  static async validateUrl(urlString: string): Promise<{ safe: boolean; reason?: string }> {
    let parsed: URL;
    try {
      parsed = new URL(urlString.trim());
    } catch {
      return { safe: false, reason: 'Invalid URL format' };
    }

    // 1. Protocol check: Allow HTTP and HTTPS only
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    // 2. Reject embedded URL credentials
    if (parsed.username || parsed.password) {
      return { safe: false, reason: 'Embedded credentials are not permitted' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // 3. Reject localhost strings
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return { safe: false, reason: 'Localhost and internal domain names are forbidden' };
    }

    // 4. Reject blocked internal ports
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (this.BLOCKED_PORTS.has(portNum)) {
        return { safe: false, reason: `Port ${portNum} is restricted for security` };
      }
    }

    // 5. DNS Resolution & IP validation
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { safe: false, reason: `DNS resolution returned no addresses for ${hostname}` };
      }

      for (const record of addresses) {
        const ip = record.address;
        if (this.isPrivateOrReservedIP(ip)) {
          return { safe: false, reason: `Resolved IP ${ip} is in a private, loopback, or reserved range` };
        }
      }
    } catch (dnsErr: any) {
      return { safe: false, reason: `DNS resolution failed: ${dnsErr.message || dnsErr}` };
    }

    return { safe: true };
  }

  /**
   * Check if an IP address belongs to private, loopback, link-local, multicast, or reserved ranges.
   */
  static isPrivateOrReservedIP(ip: string): boolean {
    // Handle IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (ip.toLowerCase().startsWith('::ffff:')) {
      const remaining = ip.substring(7);
      if (remaining.includes('.')) {
        return this.isPrivateOrReservedIP(remaining);
      }
    }

    // IPv4 Checks
    if (ip.includes('.')) {
      const parts = ip.split('.').map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return true; // malformed IPv4 is treated as unsafe
      }

      const [b0, b1, b2, b3] = parts;

      // 0.0.0.0/8 (Current network)
      if (b0 === 0) return true;

      // 127.0.0.0/8 (Loopback)
      if (b0 === 127) return true;

      // 10.0.0.0/8 (Private)
      if (b0 === 10) return true;

      // 172.16.0.0/12 (Private: 172.16.0.0 – 172.31.255.255)
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

      // 192.168.0.0/16 (Private)
      if (b0 === 192 && b1 === 168) return true;

      // 169.254.0.0/16 (Link-local)
      if (b0 === 169 && b1 === 254) return true;

      // 100.64.0.0/10 (Carrier-Grade NAT: 100.64.0.0 - 100.127.255.255)
      if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

      // 192.0.0.0/24 (IETF Protocol Assignments)
      if (b0 === 192 && b1 === 0 && b2 === 0) return true;

      // 192.0.2.0/24 (TEST-NET-1)
      if (b0 === 192 && b1 === 0 && b2 === 2) return true;

      // 198.51.100.0/24 (TEST-NET-2)
      if (b0 === 198 && b1 === 51 && b2 === 100) return true;

      // 203.0.113.0/24 (TEST-NET-3)
      if (b0 === 203 && b1 === 0 && b2 === 113) return true;

      // 198.18.0.0/15 (Network benchmark tests)
      if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

      // 224.0.0.0/4 (Multicast: 224.0.0.0 – 239.255.255.255)
      if (b0 >= 224 && b0 <= 239) return true;

      // 240.0.0.0/4 (Reserved / Future Use)
      if (b0 >= 240) return true;

      return false;
    }

    // IPv6 Checks
    const lower = ip.toLowerCase();

    // ::1 (Loopback)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;

    // :: (Unspecified)
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;

    // fe80::/10 (Link-local)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true;
    }

    // fc00::/7 (Unique local / private: fc00::/8 and fd00::/8)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

    // ff00::/8 (Multicast)
    if (lower.startsWith('ff')) return true;

    return false;
  }
}

/**
 * Webpage Content Extractor
 */
export class WebpageContentExtractor {
  /**
   * Safe fetch with SSRF check, redirect limit (max 3), timeout, and download size cap (2MB).
   */
  async safeFetch(
    url: string,
    redirectHops: number = 0
  ): Promise<{ text: string; finalUrl: string; contentType?: string }> {
    if (redirectHops > SEARCH_CONFIG.maxRedirectHops) {
      throw new Error(`Exceeded maximum redirect limit (${SEARCH_CONFIG.maxRedirectHops})`);
    }

    // SSRF verification
    const ssrf = await SSRFValidator.validateUrl(url);
    if (!ssrf.safe) {
      throw new Error(`SSRF validation blocked request: ${ssrf.reason}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_CONFIG.requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': SEARCH_CONFIG.fetchUserAgent,
          Accept: 'text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error(`Webpage fetch timed out after ${SEARCH_CONFIG.requestTimeoutMs}ms`);
      }
      throw err;
    }

    // Handle HTTP Redirects manually to re-verify SSRF on each hop
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect HTTP ${res.status} missing Location header`);
      }
      const nextUrl = new URL(location, url).toString();
      return this.safeFetch(nextUrl, redirectHops + 1);
    }

    if (!res.ok) {
      clearTimeout(timer);
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // Verify readable mime types
    const isReadableType =
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml+xml') ||
      contentType.includes('text/plain') ||
      contentType.includes('text/markdown') ||
      contentType.includes('text/xml') ||
      contentType.includes('application/json');

    if (contentType && !isReadableType) {
      clearTimeout(timer);
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    // Stream body with strict size limit (2 MB)
    try {
      if (!res.body) {
        clearTimeout(timer);
        return { text: '', finalUrl: url, contentType };
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > SEARCH_CONFIG.maxDownloadedHtmlBytes) {
            await reader.cancel();
            throw new Error(
              `Response exceeded maximum download size limit (${SEARCH_CONFIG.maxDownloadedHtmlBytes} bytes)`
            );
          }
          chunks.push(value);
        }
      }

      clearTimeout(timer);

      // Concatenate and decode
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(combined);
      return { text, finalUrl: url, contentType };
    } catch (streamErr: any) {
      clearTimeout(timer);
      throw streamErr;
    }
  }

  /**
   * Special Handling for GitHub: extract README content via raw.githubusercontent.com or DOM
   */
  async extractGitHubRepository(
    url: string,
    originalQuery: string,
    searchHeading?: string
  ): Promise<ExtractionResult> {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/^\/([^\/]+)\/([^\/]+)(?:\/.*)?$/);
      if (!match) {
        return { url, status: 'unavailable', error: 'Invalid GitHub repository URL path' };
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');

      // Try fetching raw README directly
      const rawCandidates = [
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
      ];

      let rawContent = '';
      for (const rawUrl of rawCandidates) {
        try {
          const fetchRes = await this.safeFetch(rawUrl);
          if (fetchRes.text && fetchRes.text.trim()) {
            rawContent = fetchRes.text.trim();
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      if (rawContent) {
        const processed = this.filterAndScoreSections(rawContent, originalQuery, searchHeading, true);
        return {
          url,
          status: processed.length > 0 ? 'success' : 'unavailable',
          title: `${owner}/${repo}: GitHub Repository`,
          extractedContent: processed,
        };
      }

      // Fallback: fetch HTML page and look for README article element
      const htmlRes = await this.safeFetch(url);
      const { document } = parseHTML(htmlRes.text);

      const readmeEl =
        document.querySelector('article.markdown-body') ||
        document.querySelector('#readme') ||
        document.querySelector('[data-target="readme.content"]');

      if (readmeEl) {
        const text = this.extractFormattedTextFromDOM(readmeEl);
        if (text && text.trim()) {
          const processed = this.filterAndScoreSections(text, originalQuery, searchHeading, false);
          return {
            url,
            status: processed.length > 0 ? 'success' : 'unavailable',
            title: `${owner}/${repo}: GitHub Repository`,
            extractedContent: processed,
          };
        }
      }

      return {
        url,
        status: 'unavailable',
        error: 'GitHub README could not be retrieved',
      };
    } catch (err: any) {
      return {
        url,
        status: 'failed',
        error: err.message || String(err),
      };
    }
  }

  /**
   * Generic Webpage Extraction using LinkeDOM + Mozilla Readability
   */
  async extractGenericWebpage(
    url: string,
    originalQuery: string,
    searchHeading?: string
  ): Promise<ExtractionResult> {
    try {
      const { text: html, finalUrl } = await this.safeFetch(url);
      if (!html || !html.trim()) {
        return { url: finalUrl, status: 'unavailable', error: 'Webpage response was empty' };
      }

      // Parse HTML with linkedom
      const { document } = parseHTML(html);

      // Clean noisy elements before Readability
      const noisySelectors = [
        'script',
        'style',
        'noscript',
        'nav',
        'footer',
        'header',
        'aside',
        'svg',
        'canvas',
        'iframe',
        '.ad',
        '.ads',
        '.advertisement',
        '.cookie-banner',
        '.newsletter-signup',
        '#cookie-notice',
      ];

      for (const sel of noisySelectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach((el: any) => el.remove());
        } catch {
          // Ignore invalid selector issues
        }
      }

      // Run Mozilla Readability
      let readableArticle: any = null;
      try {
        const reader = new Readability(document, {
          charThreshold: 20,
          keepClasses: false,
        });
        readableArticle = reader.parse();
      } catch (readabilityErr) {
        // Fall back to direct DOM extraction if Readability throws
      }

      let rawExtracted = '';
      let pageTitle = document.title ? document.title.trim() : undefined;

      if (readableArticle && readableArticle.content) {
        if (readableArticle.title) pageTitle = readableArticle.title.trim();
        // Parse readability HTML content to extract formatted text with code blocks intact
        const contentDoc = parseHTML(`<div>${readableArticle.content}</div>`).document;
        rawExtracted = this.extractFormattedTextFromDOM(contentDoc.body);
      } else {
        // Fallback: extract from main, article, or body
        const mainEl = document.querySelector('main') || document.querySelector('article') || document.body;
        if (mainEl) {
          rawExtracted = this.extractFormattedTextFromDOM(mainEl);
        }
      }

      if (!rawExtracted || rawExtracted.trim().length < 30) {
        return {
          url: finalUrl,
          status: 'unavailable',
          title: pageTitle,
          error: 'Could not extract sufficient readable text from webpage',
        };
      }

      // Deterministic section scoring and content selection
      const filtered = this.filterAndScoreSections(rawExtracted, originalQuery, searchHeading, false);

      if (!filtered || !filtered.trim()) {
        return {
          url: finalUrl,
          status: 'unavailable',
          title: pageTitle,
          error: 'Extracted content did not meet relevance requirements',
        };
      }

      return {
        url: finalUrl,
        status: 'success',
        title: pageTitle,
        extractedContent: filtered,
      };
    } catch (err: any) {
      return {
        url,
        status: 'failed',
        error: err.message || String(err),
      };
    }
  }

  /**
   * Extract formatted text from a DOM container while preserving headings, lists, tables, and code blocks.
   */
  extractFormattedTextFromDOM(rootEl: any): string {
    const blocks: string[] = [];

    const traverse = (node: any) => {
      if (!node) return;

      const nodeName = (node.nodeName || '').toLowerCase();

      // Code blocks: preserve code formatting and indentation
      if (nodeName === 'pre') {
        const codeEl = node.querySelector ? node.querySelector('code') : null;
        const codeText = (codeEl ? codeEl.textContent : node.textContent) || '';
        const trimmed = codeText.trim();
        if (trimmed) {
          blocks.push(`\n\`\`\`\n${trimmed}\n\`\`\`\n`);
        }
        return; // do not recurse inside pre
      }

      // Headings
      if (/^h[1-6]$/.test(nodeName)) {
        const text = (node.textContent || '').trim();
        if (text) {
          const level = '#'.repeat(parseInt(nodeName[1], 10));
          blocks.push(`\n${level} ${text}\n`);
        }
        return;
      }

      // Paragraphs
      if (nodeName === 'p') {
        const text = (node.textContent || '').trim();
        if (text) {
          blocks.push(text);
        }
        return;
      }

      // List Items
      if (nodeName === 'li') {
        const text = (node.textContent || '').trim();
        if (text) {
          blocks.push(`- ${text}`);
        }
        return;
      }

      // Tables
      if (nodeName === 'table') {
        const rows = node.querySelectorAll ? node.querySelectorAll('tr') : [];
        if (rows && rows.length > 0) {
          const tableRows: string[] = [];
          rows.forEach((row: any) => {
            const cells = row.querySelectorAll ? row.querySelectorAll('th, td') : [];
            const cellTexts: string[] = [];
            cells.forEach((cell: any) => {
              cellTexts.push((cell.textContent || '').trim().replace(/\|/g, '-'));
            });
            if (cellTexts.length > 0) {
              tableRows.push(`| ${cellTexts.join(' | ')} |`);
            }
          });
          if (tableRows.length > 0) {
            blocks.push(`\n${tableRows.join('\n')}\n`);
          }
        }
        return;
      }

      // Recurse child nodes
      if (node.childNodes && node.childNodes.length > 0) {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
        }
      }
    };

    traverse(rootEl);
    return blocks.join('\n\n');
  }

  /**
   * Deterministic Section Filtering, Scoring, and Budget Enforcement
   */
  filterAndScoreSections(
    rawText: string,
    originalQuery: string,
    searchHeading?: string,
    isMarkdown: boolean = false
  ): string {
    if (!rawText || !rawText.trim()) return '';

    // Normalize whitespace
    const normalized = rawText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Split text into coherent sections/blocks
    const rawBlocks = normalized.split(/\n\n+/);

    // Stopwords for scoring
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'and', 'or', 'about', 'what', 'how', 'when', 'where', 'who', 'why', 'did',
      'does', 'do', 'i', 'you', 'he', 'she', 'it', 'can', 'from', 'this', 'that', 'these',
      'those', 'be', 'been', 'being', 'have', 'has', 'had', 'by', 'as'
    ]);

    const combinedQuery = `${originalQuery} ${searchHeading || ''}`.toLowerCase();
    const queryKeywords = Array.from(
      new Set(
        combinedQuery
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 2 && !stopwords.has(t))
      )
    );

    const isTechnicalQuery =
      /\b(code|python|program|app|application|framework|library|gui|ui|api|github|install|script|build|develop|example|tutorial|cli|terminal)\b/i.test(
        combinedQuery
      );
    const isDocQuery = /\b(doc|docs|documentation|api|reference|class|method|function|syntax|parameter)\b/i.test(
      combinedQuery
    );
    const dateMatch = combinedQuery.match(/\b(20\d\d)\b/);
    const targetYear = dateMatch ? dateMatch[1] : null;

    interface ScoredSection {
      text: string;
      score: number;
      isCode: boolean;
      index: number;
    }

    const scoredSections: ScoredSection[] = [];
    const seenHashes = new Set<string>();

    for (let i = 0; i < rawBlocks.length; i++) {
      const block = rawBlocks[i].trim();
      if (!block || block.length < 15) continue;

      // Duplicate removal (fast normalized snippet hash)
      const snippetKey = block.slice(0, 100).toLowerCase().replace(/\s+/g, '');
      if (seenHashes.has(snippetKey)) continue;
      seenHashes.add(snippetKey);

      // Boilerplate filter
      if (
        /^(privacy policy|terms of service|terms of use|all rights reserved|cookie policy|sign in|sign up|log in|copyright ©)/i.test(
          block
        )
      ) {
        continue;
      }

      let score = 0;
      const lowerBlock = block.toLowerCase();
      const isCode = block.includes('```') || /^\s*(pip install|npm install|git clone|import |def |class |curl )/m.test(block);

      // 1. Keyword matching
      for (const kw of queryKeywords) {
        if (lowerBlock.includes(kw)) {
          score += 4;
        }
      }

      // 2. Technical prioritization
      if (isTechnicalQuery) {
        if (isCode) {
          score += 15; // prioritize working code examples
        }
        if (/\b(pip install|npm i|cargo add|setup\.py|requirements\.txt|usage|quickstart)\b/i.test(lowerBlock)) {
          score += 12; // installation instructions
        }
        if (/\b(example|tutorial|getting started|how to|features|architecture)\b/i.test(lowerBlock)) {
          score += 8;
        }
      }

      // 3. Documentation prioritization
      if (isDocQuery) {
        if (/\b(parameters?|returns?|arguments?|methods?|attributes?|syntax|signature)\b/i.test(lowerBlock)) {
          score += 10;
        }
      }

      // 4. Date-specific matching
      if (targetYear && lowerBlock.includes(targetYear)) {
        score += 8;
      }

      // 5. Headings boost context
      if (block.startsWith('#')) {
        score += 3;
      }

      // Penalize excessively long non-code blocks that might just be spam/walls of text
      if (!isCode && block.length > 2500) {
        score -= 5;
      }

      scoredSections.push({
        text: block,
        score,
        isCode,
        index: i,
      });
    }

    // Sort by score descending to pick the best sections within budget
    scoredSections.sort((a, b) => b.score - a.score);

    // Collect sections until maxExtractedCharsPerPage (6000 chars) is reached
    const selected: ScoredSection[] = [];
    let currentLength = 0;
    const maxChars = SEARCH_CONFIG.maxExtractedCharsPerPage;

    for (const item of scoredSections) {
      if (currentLength + item.text.length > maxChars) {
        // If it's a code block and fits at least partially, or we have room for a truncated snippet
        const remaining = maxChars - currentLength;
        if (remaining > 200) {
          const truncated = item.text.slice(0, remaining - 15) + '... [truncated]';
          selected.push({ ...item, text: truncated });
          currentLength += truncated.length;
        }
        break;
      }
      selected.push(item);
      currentLength += item.text.length + 2;
    }

    // Re-sort selected sections back into document order for natural reading flow
    selected.sort((a, b) => a.index - b.index);

    return selected.map((s) => s.text).join('\n\n');
  }

  /**
   * Concurrently extract a batch of sources with concurrency pool limit (3)
   * and apply per-source and total context budgets.
   */
  async extractBatch(
    sources: SourceReference[],
    originalQuery: string,
    searchHeading?: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<SourceReference[]> {
    if (!sources || sources.length === 0) return [];

    const total = sources.length;
    let completedCount = 0;

    // Helper to process an individual source
    const processSource = async (src: SourceReference): Promise<SourceReference> => {
      let result: ExtractionResult;

      try {
        const parsed = new URL(src.url);
        const hostname = parsed.hostname.toLowerCase();

        if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
          result = await this.extractGitHubRepository(src.url, originalQuery, searchHeading);
        } else {
          result = await this.extractGenericWebpage(src.url, originalQuery, searchHeading);
        }
      } catch (err: any) {
        result = {
          url: src.url,
          status: 'failed',
          error: err.message || String(err),
        };
      }

      completedCount++;
      if (onProgress) {
        onProgress(completedCount, total);
      }

      return {
        ...src,
        title: result.title || src.title,
        extractionStatus: result.status,
        extractedContent: result.extractedContent,
      };
    };

    // Concurrency pool with SEARCH_CONFIG.concurrentWebpageRequests limit (3)
    const concurrency = SEARCH_CONFIG.concurrentWebpageRequests;
    const results: SourceReference[] = new Array(sources.length);
    let queueIdx = 0;

    const worker = async () => {
      while (queueIdx < sources.length) {
        const currentIdx = queueIdx++;
        results[currentIdx] = await processSource(sources[currentIdx]);
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, sources.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Budget Enforcement across all sources:
    // Limit to maxSourcesPassedToQwen (5) and totalExtractedContentBudgetChars (6000)
    let totalBudgetUsed = 0;
    const maxTotalBudget = SEARCH_CONFIG.totalExtractedContentBudgetChars;

    return results.map((src, idx) => {
      if (idx >= SEARCH_CONFIG.maxSourcesPassedToQwen) {
        // Exceeds max sources passed to Qwen; omit extracted content to save context tokens
        return {
          ...src,
          extractedContent: undefined,
        };
      }

      if (src.extractedContent && src.extractionStatus === 'success') {
        const availableBudget = maxTotalBudget - totalBudgetUsed;
        if (availableBudget <= 0) {
          return {
            ...src,
            extractedContent: undefined,
          };
        }

        if (src.extractedContent.length > availableBudget) {
          const truncated = src.extractedContent.slice(0, availableBudget - 20) + '\n... [budget reached]';
          totalBudgetUsed += truncated.length;
          return {
            ...src,
            extractedContent: truncated,
          };
        } else {
          totalBudgetUsed += src.extractedContent.length;
          return src;
        }
      }

      return src;
    });
  }
}

export const contentExtractor = new WebpageContentExtractor();

