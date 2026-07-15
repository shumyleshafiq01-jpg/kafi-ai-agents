/**
 * @fileoverview Web Intelligence Scraper — Frontend Module
 * 
 * Calls the local Python backend API endpoints for:
 *   - Keyword-based web search (DuckDuckGo)
 *   - Single URL deep-scrape analysis
 *   - Batch URL analysis
 * 
 * Zero external dependencies — vanilla ES module.
 */

export class WebScraper {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || window.location.origin;
  }

  /**
   * Search the web for keywords and classify results
   * @param {string} query - Search keywords
   * @param {number} maxResults - Max results to return (default 20)
   * @returns {Promise<Object>} { query, count, results[] }
   */
  async search(query, maxResults = 20) {
    const resp = await fetch(`${this.baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, maxResults }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Search failed (HTTP ${resp.status})`);
    }

    return await resp.json();
  }

  /**
   * Deep-scrape a single URL for business intelligence
   * @param {string} url - URL to analyze
   * @returns {Promise<Object>} scraped data with emails, phones, products, certifications, etc.
   */
  async scrapeUrl(url) {
    const resp = await fetch(`${this.baseUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Scrape failed (HTTP ${resp.status})`);
    }

    return await resp.json();
  }

  /**
   * Batch-analyze multiple URLs
   * @param {string[]} urls - Array of URLs (max 10)
   * @returns {Promise<Object>} { count, results[] }
   */
  async analyzeBatch(urls) {
    const resp = await fetch(`${this.baseUrl}/api/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: urls.slice(0, 10) }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Batch analysis failed (HTTP ${resp.status})`);
    }

    return await resp.json();
  }

  /**
   * Generate KAFI-specific search queries for different intelligence needs
   */
  static generateQueries(keyword, searchType) {
    const base = keyword.trim();
    
    const queryTemplates = {
      competitors: [
        `${base} exporter manufacturer supplier`,
        `${base} export company producer`,
        `${base} trading company wholesale`,
      ],
      clients: [
        `${base} importer distributor buyer`,
        `${base} wholesale import company`,
        `${base} grocery supermarket chain ${base}`,
      ],
      market: [
        `${base} market trends demand 2024 2025`,
        `${base} import statistics trade data`,
      ],
    };

    return queryTemplates[searchType] || queryTemplates.competitors;
  }
}

export default WebScraper;
