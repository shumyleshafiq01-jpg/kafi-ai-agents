/**
 * @fileoverview B2B Sales Agent Engine — KAFI AI Agent Phase 2
 * 
 * Handles LinkedIn/website text parsing, lead scoring, B2B quotation generation,
 * B2B upselling, and auto-outreach drafts.
 * 
 * Zero dependencies — vanilla ES module.
 */

// Local fallback database of national days by nationality
const NATIONAL_DAYS = {
  saudi: { date: '09-23', name: 'Saudi National Day' },
  emirati: { date: '12-02', name: 'UAE National Day' },
  qatari: { date: '12-18', name: 'Qatar National Day' },
  omani: { date: '11-18', name: 'Oman National Day' },
  kuwaiti: { date: '02-25', name: 'Kuwait National Day' },
  bahraini: { date: '12-16', name: 'Bahrain National Day' },
  american: { date: '07-04', name: 'US Independence Day' },
  british: { date: '06-15', name: 'King\'s Official Birthday' },
  canadian: { date: '07-01', name: 'Canada Day' },
  german: { date: '10-03', name: 'German Unity Day' },
  french: { date: '07-14', name: 'Bastille Day' },
  pakistani: { date: '08-14', name: 'Pakistan Independence Day' }
};

export class SalesAgent {
  /**
   * @param {Object} apiConnector — instance of APIConnector
   */
  constructor(apiConnector) {
    this.apiConnector = apiConnector;
  }

  /**
   * Evaluates a lead based on unstructured LinkedIn / website text
   * Falls back to local heuristic analysis if API is not enabled
   * 
   * @param {string} rawText — pasted profile/website/history text
   * @param {Array} productCatalog — list of products from knowledge base
   * @returns {Promise<Object>} evaluated lead profile
   */
  async evaluateLead(rawText, productCatalog = []) {
    if (!rawText || !rawText.trim()) {
      throw new Error('Input text is empty.');
    }

    if (this.apiConnector && this.apiConnector.isEnabled()) {
      return await this._evaluateWithAPI(rawText, productCatalog);
    } else {
      return this._evaluateLocalFallback(rawText, productCatalog);
    }
  }

  /**
   * Generates a B2B quotation with upselling / cross-selling recommendations
   * 
   * @param {Object} lead — lead profile
   * @param {Array} items — selected items [{ id, quantity }]
   * @param {Array} productCatalog — list of products
   * @returns {Object} quotation data
   */
  generateB2BQuote(lead, items, productCatalog = []) {
    const quoteItems = [];
    const recommendations = [];

    // Map items
    items.forEach(item => {
      const prod = productCatalog.find(p => p.id === item.id);
      if (prod) {
        quoteItems.push({
          id: prod.id,
          name: prod.name,
          category: prod.category,
          quantity: item.quantity,
          weights: prod.weights || [],
          packaging: prod.packaging || 'Standard export packaging',
          imageUrl: prod.image || prod.imageUrl || ''
        });

        // Generate cross-selling based on category
        if (prod.category === 'rice' && !recommendations.some(r => r.category === 'spices')) {
          const spices = productCatalog.filter(p => p.category === 'spices').slice(0, 2);
          spices.forEach(s => {
            recommendations.push({
              id: s.id,
              name: s.name,
              reason: 'Excellent cross-sell opportunity for Biryani/Rice exporters.',
              category: 'spices'
            });
          });
        }
        if (prod.category === 'salt' && !recommendations.some(r => r.id === 'pink-salt-tiles')) {
          const tiles = productCatalog.find(p => p.id === 'pink-salt-tiles');
          if (tiles) {
            recommendations.push({
              id: tiles.id,
              name: tiles.name,
              reason: 'Highly popular value-add upgrade for pink salt importers.',
              category: 'salt'
            });
          }
        }
      }
    });

    // General B2B upselling recommendation (Private Labeling)
    if (lead.leadScore === 'HOT' || lead.leadScore === 'WARM') {
      recommendations.push({
        type: 'service',
        name: 'Private Labeling & OEM Branding',
        reason: 'Client imports in retail volumes. Suggest private labeling with their custom branding.'
      });
    }

    return {
      quoteId: `Q-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleDateString(),
      items: quoteItems,
      recommendations: recommendations,
      buyerName: lead.buyerName || 'Valued Lead',
      company: lead.company || 'Direct Buyer',
      nationality: lead.nationality || 'Unknown'
    };
  }

  /**
   * Drafts a cold outreach message
   * 
   * @param {Object} lead — lead profile
   * @param {string} type — 'email' | 'linkedin' | 'whatsapp'
   * @param {string} [language='english']
   * @returns {Promise<string>} drafted text
   */
  async draftOutreach(lead, type, language = 'english') {
    if (this.apiConnector && this.apiConnector.isEnabled()) {
      return await this._draftWithAPI(lead, type, language);
    } else {
      return this._draftLocalFallback(lead, type, language);
    }
  }

  /**
   * Generates auto greetings (Birthday / National Day / Promotion)
   */
  async generateGreeting(lead, greetingType) {
    if (this.apiConnector && this.apiConnector.isEnabled()) {
      return await this._generateGreetingWithAPI(lead, greetingType);
    } else {
      return this._generateGreetingLocal(lead, greetingType);
    }
  }

  // ── Private API Methods ─────────────────────

  async _evaluateWithAPI(rawText, productCatalog) {
    const s = this.apiConnector.loadSettings();
    const systemPrompt = `You are a B2B Sales Intelligence parser for KAFI Group. 
Analyze the pasted text (LinkedIn profile, website text, or email thread) and return a JSON object EXACTLY in the format below.
Do not wrap in markdown code blocks. Just return raw JSON.

Output format:
{
  "buyerName": "extracted buyer name or contact person",
  "company": "extracted company name",
  "designation": "extracted title/designation (e.g. Purchasing Manager)",
  "nationality": "extracted nationality or country (e.g. Emirati, Saudi, American)",
  "dob": "extracted date of birth in format YYYY-MM-DD or MM-DD, or null if not found",
  "productHandling": "products they sell or import (e.g. spices, rice, commodity salt)",
  "promotions": "any info about recent job promotions, or null",
  "leadScore": "HOT" or "WARM" or "COLD",
  "rationale": "one-sentence explanation for the assigned lead score based on their import potential for Rice, Himalayan Pink Salt, Spices, or Desserts"
}`;

    const messages = [{ role: 'user', content: rawText }];
    let rawJson = '';

    try {
      if (s.provider === 'openai') {
        rawJson = await this.apiConnector._callOpenAI(s.apiKey, s.model || 'gpt-4o', systemPrompt, messages);
      } else if (s.provider === 'anthropic') {
        rawJson = await this.apiConnector._callAnthropic(s.apiKey, s.model || 'claude-3-5-sonnet-latest', systemPrompt, messages);
      } else if (s.provider === 'gemini') {
        rawJson = await this.apiConnector._callGemini(s.apiKey, s.model || 'gemini-2.5-flash', systemPrompt, messages);
      } else {
        const endpoint = s.endpoint || 'https://api.openai.com/v1/chat/completions';
        rawJson = await this.apiConnector._callCustom(s.apiKey, endpoint, s.model || 'gpt-4o', systemPrompt, messages);
      }

      // Clean response (sometimes models wrap in ```json ... ```)
      let cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn('[SalesAgent] LLM parsing failed, falling back to local regex:', e);
      return this._evaluateLocalFallback(rawText, productCatalog);
    }
  }

  async _draftWithAPI(lead, type, language) {
    const s = this.apiConnector.loadSettings();
    const systemPrompt = `You are a B2B sales copywriter for KAFI Group. 
Draft a B2B cold pitch of type "${type}" in "${language}" for the following buyer:
- Name: ${lead.buyerName}
- Company: ${lead.company}
- Title: ${lead.designation}
- Nationality/Country: ${lead.nationality}
- Products they handle: ${lead.productHandling}
- Assigned Lead Score: ${lead.leadScore}

B2B Sales rules:
- For 'email': Professional subject line, short body (3 paragraphs max), clear Call to Action (schedule a call / WhatsApp).
- For 'linkedin': Under 300 characters, warm, focus on business synergy.
- For 'whatsapp': Short, professional, with bullet points.
- Highlight KAFI Group's ISO 22000/HACCP/Halal certifications and custom packaging/private labeling services.`;

    const messages = [{ role: 'user', content: 'Generate outreach message' }];

    try {
      if (s.provider === 'openai') {
        return await this.apiConnector._callOpenAI(s.apiKey, s.model || 'gpt-4o', systemPrompt, messages);
      } else if (s.provider === 'anthropic') {
        return await this.apiConnector._callAnthropic(s.apiKey, s.model || 'claude-3-5-sonnet-latest', systemPrompt, messages);
      } else if (s.provider === 'gemini') {
        return await this.apiConnector._callGemini(s.apiKey, s.model || 'gemini-2.5-flash', systemPrompt, messages);
      } else {
        const endpoint = s.endpoint || 'https://api.openai.com/v1/chat/completions';
        return await this.apiConnector._callCustom(s.apiKey, endpoint, s.model || 'gpt-4o', systemPrompt, messages);
      }
    } catch (e) {
      return this._draftLocalFallback(lead, type, language);
    }
  }

  async _generateGreetingWithAPI(lead, greetingType) {
    const s = this.apiConnector.loadSettings();
    const systemPrompt = `You are a relations manager at KAFI Group.
Generate a warm B2B congratulatory greeting of type "${greetingType}" for:
- Name: ${lead.buyerName}
- Company: ${lead.company}
- Title: ${lead.designation}
- Country/Nationality: ${lead.nationality}

Greeting type rules:
- 'birthday': Warm, professional, wishing them success.
- 'national_day': Celebrate their country's national day, highlighting friendship.
- 'promotion': Congratulate them on their career advancement, wishing success.
Keep it under 150 words.`;

    const messages = [{ role: 'user', content: 'Generate greeting message' }];

    try {
      if (s.provider === 'openai') {
        return await this.apiConnector._callOpenAI(s.apiKey, s.model || 'gpt-4o', systemPrompt, messages);
      } else if (s.provider === 'anthropic') {
        return await this.apiConnector._callAnthropic(s.apiKey, s.model || 'claude-3-5-sonnet-latest', systemPrompt, messages);
      } else if (s.provider === 'gemini') {
        return await this.apiConnector._callGemini(s.apiKey, s.model || 'gemini-2.5-flash', systemPrompt, messages);
      } else {
        const endpoint = s.endpoint || 'https://api.openai.com/v1/chat/completions';
        return await this.apiConnector._callCustom(s.apiKey, endpoint, s.model || 'gpt-4o', systemPrompt, messages);
      }
    } catch (e) {
      return this._generateGreetingLocal(lead, greetingType);
    }
  }

  // ── Local Fallback Methods (Regex/Heuristic) ───────────────

  _evaluateLocalFallback(rawText, productCatalog) {
    const lower = rawText.toLowerCase();
    
    // Heuristic extraction
    let buyerName = 'Buyer Representative';
    let company = 'Direct Importer';
    let designation = 'Purchasing Manager';
    let nationality = 'UAE';
    let dob = null;
    let productHandling = 'Food commodities';
    let promotions = null;
    let leadScore = 'WARM';

    // Regex matchers
    const nameMatch = rawText.match(/(?:name|contact|buyer|person)\s*:\s*([^\n\r]+)/i);
    if (nameMatch) buyerName = nameMatch[1].trim();

    const companyMatch = rawText.match(/(?:company|firm|employer)\s*:\s*([^\n\r]+)/i);
    if (companyMatch) company = companyMatch[1].trim();

    const titleMatch = rawText.match(/(?:title|designation|position|job)\s*:\s*([^\n\r]+)/i);
    if (titleMatch) designation = titleMatch[1].trim();

    const countryMatch = rawText.match(/(?:nationality|country|region)\s*:\s*([^\n\r]+)/i);
    if (countryMatch) nationality = countryMatch[1].trim();

    const dobMatch = rawText.match(/(?:dob|birthday|birth)\s*:\s*([^\n\r]+)/i);
    if (dobMatch) dob = dobMatch[1].trim();

    // Check product keywords to score lead
    const hasRice = lower.includes('rice') || lower.includes('chawal') || lower.includes('basmati');
    const hasSalt = lower.includes('salt') || lower.includes('namak') || lower.includes('khewra');
    const hasSpices = lower.includes('spices') || lower.includes('masala') || lower.includes('condiments');
    const hasDessert = lower.includes('custard') || lower.includes('jelly') || lower.includes('dessert');

    const productsFound = [];
    if (hasRice) productsFound.push('Rice');
    if (hasSalt) productsFound.push('Himalayan Salt');
    if (hasSpices) productsFound.push('Spices');
    if (hasDessert) productsFound.push('Desserts');
    
    if (productsFound.length > 0) {
      productHandling = productsFound.join(', ');
    }

    // Lead Scoring rules
    const isMiddleEast = lower.includes('uae') || lower.includes('dubai') || lower.includes('saudi') || lower.includes('riyadh') || lower.includes('qatar') || lower.includes('kuwait');
    const isWestern = lower.includes('usa') || lower.includes('america') || lower.includes('uk') || lower.includes('canada') || lower.includes('europe');
    
    if ((hasRice || hasSalt) && (isMiddleEast || isWestern)) {
      leadScore = 'HOT';
    } else if (hasSpices || hasDessert) {
      leadScore = 'WARM';
    } else {
      leadScore = 'COLD';
    }

    const rationale = `Local engine assigned ${leadScore} score because the lead handles ${productHandling} and operates in ${nationality}.`;

    return {
      buyerName,
      company,
      designation,
      nationality,
      dob,
      productHandling,
      promotions,
      leadScore,
      rationale
    };
  }

  _draftLocalFallback(lead, type, language) {
    const isUrdu = language.toLowerCase() === 'urdu';
    const company = lead.company || 'your company';
    const products = lead.productHandling || 'food commodities';

    if (type === 'whatsapp') {
      return isUrdu
        ? `Hi ${lead.buyerName},\n\nMain KAFI Group Pakistan se baat kar raha hoon. Hum premium Basmati Rice aur Himalayan Pink Salt export karte hain. Aap ki company ${company} ke sath business synergies explore karni thi. Kya hum call par baat kar sakte hain?`
        : `Hi ${lead.buyerName},\n\nI hope you are well. I represent KAFI Group Pakistan, a leading exporter of premium Basmati Rice and Himalayan Pink Salt (ISO 22000 certified). We noticed ${company} handles ${products}. Let us know if we can share our digital catalogue.`;
    }

    if (type === 'linkedin') {
      return `Hello ${lead.buyerName},\n\nI noticed you handle ${products} at ${company}. KAFI Group is a premier Pakistani exporter of premium Rice, Himalayan Pink Salt, and Spices. I would love to connect and explore wholesale export opportunities with your team.`;
    }

    // Default Email
    return `Subject: Partnership Opportunity: Premium Rice & Pink Salt Exports to ${company}

Dear ${lead.buyerName},

I hope this email finds you well. 

I am writing to you on behalf of KAFI Group, a premium manufacturer and exporter of high-quality food commodities based in Pakistan since 1982. We hold ISO 9001, ISO 22000, HACCP, and HALAL certifications, ensuring the highest standards of food safety.

We understand that ${company} is a leading player in importing and distribution. We specialize in Basmati & Non-Basmati Rice and Himalayan Pink Salt (Fine, Coarse, tiles/blocks), and we offer complete private labeling and custom packaging services.

Would you be open to a brief introductory call next week to discuss how we can support your supply chain with competitive pricing?

Best regards,

KAFI Group Sales Team
exports@kafi-group.com
WhatsApp: +92-300-8206633`;
  }

  _generateGreetingLocal(lead, greetingType) {
    if (greetingType === 'birthday') {
      return `Dear ${lead.buyerName},\n\nOn behalf of the entire team at KAFI Group, we wish you a very Happy Birthday! 🎂 May this year bring you abundant happiness, good health, and continued success in all your personal and professional endeavors. We value our partnership and look forward to growing together.\n\nWarm regards,\nKAFI Group Team`;
    }
    
    if (greetingType === 'promotion') {
      return `Dear ${lead.buyerName},\n\nCongratulations on your recent promotion at ${lead.company}! 👏 We are absolutely thrilled to hear about this well-deserved recognition of your hard work and dedication. We wish you the absolute best in your new leadership role and look forward to continuing our successful collaboration.\n\nWarmest regards,\nKAFI Group Team`;
    }

    // National Day Greeting
    const country = lead.nationality || 'your country';
    return `Dear ${lead.buyerName},\n\nSending warm congratulations and best wishes to you and the people of ${country} on the historic occasion of your National Day! 🎆 May your nation continue to prosper, and may our bilateral business relations grow stronger in the years to come. Enjoy the celebrations!\n\nWarm regards,\nKAFI Group Team`;
  }

  /**
   * Helper to scan buyer list and match upcoming greetings
   * @param {Array} buyers 
   * @returns {Array} alerts list
   */
  getGreetingAlerts(buyers) {
    const alerts = [];
    if (!Array.isArray(buyers)) return alerts;

    const todayObj = new Date();
    const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
    const dd = String(todayObj.getDate()).padStart(2, '0');
    const todayMD = `${mm}-${dd}`; // '12-02' for UAE national day etc.

    buyers.forEach(buyer => {
      // 1. Check Birthdays
      if (buyer.dob) {
        // Handle formats like YYYY-MM-DD or MM-DD
        const parts = buyer.dob.split('-');
        let buyerMD = '';
        if (parts.length === 3) {
          buyerMD = `${parts[1]}-${parts[2]}`;
        } else if (parts.length === 2) {
          buyerMD = `${parts[0]}-${parts[1]}`;
        }
        
        if (buyerMD === todayMD) {
          alerts.push({
            type: 'birthday',
            buyerId: buyer.id,
            buyerName: buyer.buyerName,
            company: buyer.company,
            message: `🎂 Today is ${buyer.buyerName}'s birthday! Send a birthday card.`
          });
        }
      }

      // 2. Check National Days
      if (buyer.nationality) {
        const nationKey = buyer.nationality.toLowerCase().replace(/[^a-z]/g, '');
        // Search in keys or matching nationalities
        for (const [key, nat] of Object.entries(NATIONAL_DAYS)) {
          if (nationKey.includes(key) && nat.date === todayMD) {
            alerts.push({
              type: 'national_day',
              buyerId: buyer.id,
              buyerName: buyer.buyerName,
              company: buyer.company,
              message: `🎆 Today is ${nat.name}! Send National Day greetings to ${buyer.buyerName}.`
            });
            break;
          }
        }
      }
    });

    return alerts;
  }
}

export default SalesAgent;
