/**
 * @fileoverview Universal API Connector — KAFI AI Agent
 * Supports: OpenAI GPT, Anthropic Claude, Google Gemini, Manus AI, Cursor AI, Custom API
 * 
 * Zero dependencies — vanilla ES module.
 */

export class APIConnector {
  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Loads API settings from localStorage
   * @returns {Object} { provider, apiKey, endpoint, model }
   */
  loadSettings() {
    try {
      const s = localStorage.getItem('kafi_api_settings');
      return s ? JSON.parse(s) : { provider: 'local', apiKey: '', endpoint: '', model: '' };
    } catch (e) {
      return { provider: 'local', apiKey: '', endpoint: '', model: '' };
    }
  }

  /**
   * Saves API settings to localStorage
   * @param {Object} settings
   */
  saveSettings(settings) {
    if (settings && typeof settings === 'object') {
      localStorage.setItem('kafi_api_settings', JSON.stringify(settings));
      this.settings = settings;
    }
  }

  /**
   * Checks if an external API provider is active and configured
   * @returns {boolean}
   */
  isEnabled() {
    const s = this.loadSettings();
    return s && s.provider && s.provider !== 'local' && s.apiKey && s.apiKey.trim().length > 0;
  }

  /**
   * Generates a response using the external LLM provider
   * 
   * @param {string} userMessage — raw message from the user
   * @param {Object} context — conversation history and state
   * @param {Array} productCatalog — list of products from knowledge base
   * @returns {Promise<string|null>} response text or null if failed/disabled
   */
  async generateResponse(userMessage, context = {}, productCatalog = []) {
    const s = this.loadSettings();
    if (!this.isEnabled()) return null;

    const systemPrompt = this._buildSystemPrompt(context, productCatalog);
    const messages = this._buildMessageHistory(userMessage, context.messageHistory || []);

    try {
      switch (s.provider) {
        case 'openai':
          return await this._callOpenAI(s.apiKey, s.model || 'gpt-4o', systemPrompt, messages);
        case 'anthropic':
          return await this._callAnthropic(s.apiKey, s.model || 'claude-3-5-sonnet-latest', systemPrompt, messages);
        case 'gemini':
          return await this._callGemini(s.apiKey, s.model || 'gemini-2.5-flash', systemPrompt, messages);
        case 'manus':
        case 'cursor':
        case 'custom':
          // Most providers like Manus, Cursor use OpenAI-compatible completions endpoints
          const endpoint = s.endpoint || 'https://api.openai.com/v1/chat/completions';
          return await this._callCustom(s.apiKey, endpoint, s.model || 'gpt-4o', systemPrompt, messages);
        default:
          return null;
      }
    } catch (e) {
      console.error('[KAFI API] External API error:', e);
      return null; // Fallback to local NLP
    }
  }

  /**
   * Build system instructions injected with the KAFI product catalog
   * @private
   */
  _buildSystemPrompt(context, products) {
    const prodList = products.map(p => `- ${p.name} (Category: ${p.category}): ${p.desc || p.description || ''}`).join('\n');
    return `You are the official AI Sales & Information Assistant for KAFI Group, a premier food commodities exporter from Pakistan established in 1982.
Respond in a helpful, professional, and friendly tone.
You can respond in English or Romanized Urdu/Hindi depending on the user's language. Keep answers concise.

KAFI Group Info:
- Address: Kafi House, F-50/1, Block-8, KDA Scheme-5, Clifton, Karachi, Pakistan
- Email: exports@kafi-group.com
- Phone: +92-300-8206633 (WhatsApp available)
- Certifications: ISO 9001, ISO 22000, HACCP, HALAL
- Private labeling and custom packaging are available.

Product Catalogue:
${prodList}

Response rules:
1. If the user asks for product names, list only the names.
2. If the user asks for packaging or weight, provide only that.
3. If they want to order, guide them to contact exports@kafi-group.com or use WhatsApp.
4. Keep descriptions concise and never contradict product details.`;
  }

  /**
   * Builds OpenAI format message history from context history
   * @private
   */
  _buildMessageHistory(userMessage, history) {
    const formatted = [];
    const recent = history.slice(-10); // Keep context window short
    recent.forEach(m => {
      formatted.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      });
    });
    formatted.push({ role: 'user', content: userMessage });
    return formatted;
  }

  async _callOpenAI(key, model, system, messages) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const payload = {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.7
    };
    const res = await this._fetchAPI(url, key, payload);
    return res?.choices?.[0]?.message?.content || null;
  }

  async _callAnthropic(key, model, system, messages) {
    const url = 'https://api.anthropic.com/v1/messages';
    const payload = {
      model,
      system,
      messages,
      max_tokens: 1024,
      temperature: 0.7
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Anthropic error: ${response.statusText}`);
    const data = await response.json();
    return data?.content?.[0]?.text || null;
  }

  async _callGemini(key, model, system, messages) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const contents = [];
    messages.forEach(m => {
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      });
    });
    const payload = {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: 0.7 }
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Gemini error: ${response.statusText}`);
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  async _callCustom(key, url, model, system, messages) {
    const payload = {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.7
    };
    const res = await this._fetchAPI(url, key, payload);
    return res?.choices?.[0]?.message?.content || null;
  }

  async _fetchAPI(url, key, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
}

export default APIConnector;
