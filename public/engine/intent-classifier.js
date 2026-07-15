/**
 * @fileoverview Intent Classification Module — KAFI AI Agent NLP Engine
 *
 * Classifies user messages into one of 19 intents using weighted keyword
 * scoring, bigram/phrase matching, and contextual disambiguation.
 *
 * Dependencies: tokenizer.js, entity-extractor.js
 *
 * @module intent-classifier
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

import { tokenize, normalize, detectLanguage } from './tokenizer.js';
import { extractProductName, extractCategory, extractWeight, extractLanguage } from './entity-extractor.js';

// ─────────────────────────────────────────────
// Intent Definitions
// ─────────────────────────────────────────────

/**
 * @typedef {Object} IntentPattern
 * @property {string[]} keywords   — single-word triggers
 * @property {string[]} phrases    — multi-word triggers (checked as substrings)
 * @property {number}   keyWeight  — weight per keyword hit
 * @property {number}   phraseWeight — weight per phrase hit
 */

/** @type {Object<string, IntentPattern>} */
const INTENT_PATTERNS = {
  greeting: {
    keywords: ['hi', 'hello', 'hey', 'hola', 'greetings', 'morning', 'evening',
               'afternoon', 'assalam', 'salam', 'walaikum', 'aoa'],
    phrases:  ['good morning', 'good evening', 'good afternoon', 'kia haal',
               'kya haal', 'assalam o alaikum', 'assalamualaikum', 'salam alaikum',
               'how are you', "what's up", 'howdy'],
    keyWeight: 1.5,
    phraseWeight: 2.5
  },

  product_list: {
    keywords: ['list', 'products', 'show', 'categories', 'catalogue', 'catalog',
               'menu', 'range', 'portfolio', 'offerings', 'available', 'inventory'],
    phrases:  ['all products', 'what products', 'show me', 'product list',
               'what do you have', 'what do you sell', 'what items',
               'kia kia hai', 'products dikhao', 'sab dikhao', 'kya milta',
               'kya bechte', 'product line', 'full range'],
    keyWeight: 1.2,
    phraseWeight: 2.0
  },

  product_detail: {
    keywords: ['details', 'describe', 'description', 'information', 'info',
               'about', 'specifications', 'specs', 'features', 'tafseelat',
               'batao', 'bataiye', 'batayen'],
    phrases:  ['tell me about', 'more about', 'what is', "what's",
               'can you describe', 'details of', 'info on', 'information about',
               'iske baare mein', 'is ke bare mein', 'ye kya hai', 'yeh kya hai'],
    keyWeight: 1.3,
    phraseWeight: 2.2
  },

  product_category: {
    keywords: ['rice', 'salt', 'vermicelli', 'spices', 'spice', 'condiments',
               'desserts', 'dessert', 'juices', 'juice', 'snacks', 'snack',
               'chawal', 'namak', 'seviyan', 'masala', 'masalay', 'nimko',
               'mithai', 'sharbat'],
    phrases:  ['rice products', 'salt products', 'your spices', 'spice range',
               'snack range', 'juice range', 'dessert range'],
    keyWeight: 1.4,
    phraseWeight: 2.0
  },

  packaging_info: {
    keywords: ['packaging', 'package', 'pack', 'packed', 'packing',
               'carton', 'cartons', 'box', 'boxes', 'wrapper', 'wrapping',
               'container', 'pouch', 'bag', 'bottle', 'jar', 'can'],
    phrases:  ['how packed', 'how is it packed', 'packaging details',
               'pack size', 'box size', 'carton size', 'packaging options',
               'kaise pack', 'packing kaisi', 'details about packaging',
               'details of packaging'],
    keyWeight: 1.3,
    phraseWeight: 2.2
  },

  weight_inquiry: {
    keywords: ['weight', 'heavy', 'grams', 'gram', 'kg', 'kilogram',
               'kilograms', 'size', 'sizes', 'wajan', 'kitna', 'kitne',
               'kitni', 'quantity', 'volume'],
    phrases:  ['how heavy', 'how much does it weigh', 'available sizes',
               'weight options', 'available weights', 'kitna wajan',
               'kitne gram', 'kitne kg', 'size options'],
    keyWeight: 1.3,
    phraseWeight: 2.2
  },

  price_inquiry: {
    keywords: ['price', 'cost', 'rate', 'pricing', 'charges', 'fee',
               'expensive', 'cheap', 'affordable', 'qeemat', 'daam',
               'paisay', 'rupay', 'dollar'],
    phrases:  ['how much', 'what price', 'price list', 'rate list',
               'kitne ka', 'kya rate', 'kitne ka hai', 'kya qeemat',
               'per kg price', 'per unit cost', 'price of', 'cost of',
               'rate of', 'price for', 'cost for', 'rate for'],
    keyWeight: 1.4,
    phraseWeight: 2.3
  },

  order_help: {
    keywords: ['order', 'buy', 'purchase', 'ordering', 'buying',
               'procurement', 'kharidna', 'lena', 'mangwana', 'mangana'],
    phrases:  ['how to order', 'how can i buy', 'how to buy', 'place order',
               'place an order', 'want to order', 'want to buy',
               'can i order', 'i want to purchase', 'kaise order', 'order karna',
               'kaise kharidain', 'minimum order', 'moq'],
    keyWeight: 1.3,
    phraseWeight: 2.3
  },

  shipping_info: {
    keywords: ['ship', 'shipping', 'deliver', 'delivery', 'export',
               'import', 'country', 'countries', 'international',
               'domestic', 'freight', 'logistics', 'courier',
               'bhejte', 'bhejain'],
    phrases:  ['where do you ship', 'do you deliver', 'shipping cost',
               'delivery time', 'export to', 'which countries',
               'kahan bhejte', 'kahan deliver', 'shipping charges',
               'delivery charges', 'how long does delivery take'],
    keyWeight: 1.3,
    phraseWeight: 2.2
  },

  contact_request: {
    keywords: ['contact', 'call', 'phone', 'email', 'talk', 'human',
               'agent', 'representative', 'support', 'helpline',
               'whatsapp', 'number', 'reach'],
    phrases:  ['baat karni', 'baat karna', 'contact number', 'phone number',
               'email address', 'talk to someone', 'speak to human',
               'get in touch', 'reach out', 'customer support',
               'connect me', 'talk to a person', 'real person'],
    keyWeight: 1.3,
    phraseWeight: 2.4
  },

  lead_capture: {
    keywords: ['interested', 'quotation', 'quote', 'inquiry', 'enquiry',
               'proposal', 'sample', 'trial'],
    phrases:  ['want to buy', 'send quote', 'send quotation', 'get a quote',
               'request quote', 'price quote', 'i am interested',
               "i'm interested", 'send me details', 'business inquiry',
               'bulk order', 'wholesale', 'distributor'],
    keyWeight: 1.4,
    phraseWeight: 2.5
  },

  language_switch: {
    keywords: ['urdu', 'hindi', 'english', 'language', 'translate',
               'angrezi'],
    phrases:  ['speak in urdu', 'speak english', 'change language',
               'switch to urdu', 'switch to english', 'urdu mein',
               'english mein baat karo', 'roman urdu'],
    keyWeight: 1.5,
    phraseWeight: 2.5
  },

  bot_identity: {
    keywords: ['bot', 'chatbot', 'robot', 'ai', 'artificial', 'machine'],
    phrases:  ['who are you', 'your name', 'are you a bot', 'are you human',
               'are you real', 'what are you', 'are you a robot',
               'are you a chatbot', 'are you ai', 'tum kaun ho',
               'ap kaun', 'tumhara naam'],
    keyWeight: 1.2,
    phraseWeight: 2.5
  },

  smalltalk: {
    keywords: ['married', 'age', 'girlfriend', 'boyfriend', 'personal',
               'hobby', 'hobbies', 'favorite', 'favourite', 'family',
               'birthday', 'born'],
    phrases:  ['how old are you', 'are you married', 'do you have',
               'where are you from', 'where do you live',
               'what is your favorite', 'tumhari age', 'tumhari umar'],
    keyWeight: 1.0,
    phraseWeight: 2.3
  },

  farewell: {
    keywords: ['bye', 'goodbye', 'thanks', 'thank', 'thankyou',
               'shukriya', 'alvida', 'khudahafiz', 'tata', 'cya',
               'later', 'goodnight'],
    phrases:  ['thank you', 'thanks a lot', 'good bye', 'see you',
               'see you later', 'take care', 'have a nice day',
               'allah hafiz', 'khuda hafiz', 'bohot shukriya',
               'thank you so much'],
    keyWeight: 1.4,
    phraseWeight: 2.4
  },

  negative: {
    keywords: ['no', 'nahi', 'nahin', 'nope', 'nah', 'nay', 'never',
               'none', 'nothing', 'cancel', 'stop', 'dont', "don't"],
    phrases:  ['not interested', 'no thanks', 'no thank you',
               'i dont want', "i don't want", 'not now', 'maybe later',
               'nahi chahiye', 'mujhe nahi', 'koi zarurat nahi',
               'bilkul nahi', 'no need'],
    keyWeight: 1.3,
    phraseWeight: 2.3
  },

  affirmative: {
    keywords: ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'alright',
               'absolutely', 'definitely', 'certainly', 'haan', 'ji',
               'bilkul', 'zaroor', 'theek', 'sahi', 'correct', 'right'],
    phrases:  ['yes please', 'of course', 'sure thing', 'sounds good',
               'go ahead', 'i agree', 'why not', 'haan ji', 'ji haan',
               'bilkul ji', 'theek hai', 'haan bhai', 'yes sure'],
    keyWeight: 1.3,
    phraseWeight: 2.3
  },

  complaint: {
    keywords: ['problem', 'issue', 'wrong', 'bad', 'terrible', 'horrible',
               'broken', 'damaged', 'defective', 'expired', 'complaint',
               'complain', 'unsatisfied', 'disappointed', 'angry',
               'worst', 'poor', 'pathetic', 'shikayat'],
    phrases:  ['not working', 'does not work', "doesn't work",
               'i have a problem', 'i have an issue', 'quality is bad',
               'file a complaint', 'register complaint', 'very bad',
               'not satisfied', 'not happy', 'bohot bura',
               'kharab hai', 'masla hai'],
    keyWeight: 1.3,
    phraseWeight: 2.3
  },

  upsell_trigger: {
    keywords: ['else', 'more', 'other', 'another', 'additional',
               'extra', 'different', 'alternative', 'similar',
               'related', 'recommend', 'suggestion'],
    phrases:  ['anything else', 'what else', 'show me more',
               'any other', 'something else', 'aur kuch', 'aur dikhao',
               'mazeed', 'kuch aur', 'aur bhi', 'other options',
               'more products', 'more options'],
    keyWeight: 1.1,
    phraseWeight: 2.2
  }
};

/**
 * Minimum confidence threshold. Below this, intent is classified as 'unknown'.
 * @type {number}
 */
const CONFIDENCE_THRESHOLD = 0.3;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Classifies user input into an intent with confidence score and extracted entities.
 *
 * Scoring algorithm:
 *   1. Check phrases first (substring match in lowered text) → add phraseWeight per hit
 *   2. Check keywords (token membership) → add keyWeight per hit
 *   3. Normalize total score against a theoretical max to get confidence [0..1]
 *   4. Apply contextual boosts / disambiguation
 *   5. If top confidence < CONFIDENCE_THRESHOLD → 'unknown'
 *
 * @param {string} text — raw user message
 * @param {Object} [context={}] — conversation context from ContextManager
 * @param {string} [context.lastIntent] — previous turn's intent
 * @param {string} [context.currentProduct] — product under discussion
 * @param {string} [context.currentCategory] — category under discussion
 * @param {Array}  [context.products] — product catalogue for entity extraction
 * @returns {{ intent: string, confidence: number, entities: Object, language: string }}
 *
 * @example
 * classifyIntent("Tell me about your pink salt", { products: [...] });
 * // => { intent: 'product_detail', confidence: 0.82, entities: { product: 'Pink Salt' }, language: 'english' }
 */
export function classifyIntent(text, context = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { intent: 'unknown', confidence: 0, entities: {}, language: 'english' };
  }

  const lower   = text.toLowerCase().trim();
  const tokens  = tokenize(text);
  const lang    = detectLanguage(text);

  // ── Score each intent ──
  /** @type {Object<string, number>} */
  const scores = {};

  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;

    // Phrase matching (substring in full text)
    for (const phrase of pattern.phrases) {
      if (lower.includes(phrase)) {
        score += pattern.phraseWeight;
      }
    }

    // Keyword matching (token set intersection)
    for (const keyword of pattern.keywords) {
      if (tokens.includes(keyword)) {
        score += pattern.keyWeight;
      }
    }

    scores[intent] = score;
  }

  // ── Rank intents by score ──
  const ranked = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  // ── Compute confidence ──
  // Max possible score is roughly: 3 phrase hits × 2.5 + 4 keyword hits × 1.5 = 13.5
  // We normalize against a practical max of 6 to get useful confidence values.
  const PRACTICAL_MAX = 6;

  let topIntent    = 'unknown';
  let topScore     = 0;
  let confidence   = 0;

  if (ranked.length > 0) {
    topIntent  = ranked[0][0];
    topScore   = ranked[0][1];
    confidence = Math.min(topScore / PRACTICAL_MAX, 1.0);
  }

  // ── Entity extraction ──
  const entities = {};
  const products = context.products || [];

  // Product entity
  const productMatch = extractProductName(text, products);
  if (productMatch) {
    entities.product = productMatch.product;
  }

  // Category entity
  const categoryMatch = extractCategory(text);
  if (categoryMatch) {
    entities.category = categoryMatch.category;

    // If we detected a category and top intent isn't already strongly classified,
    // boost product_category intent
    if (topIntent !== 'product_category' && categoryMatch.score > 0.8) {
      const catScore = scores.product_category || 0;
      if (catScore > 0 || topScore < 2) {
        // Reclassify if category signal is strong
        if (topScore < 3) {
          topIntent  = 'product_category';
          confidence = Math.max(confidence, 0.65);
        }
      }
    }
  }

  // Weight entity
  const weightMatch = extractWeight(text);
  if (weightMatch.length > 0) {
    entities.weights = weightMatch;
  }

  // Language entity
  const langRequest = extractLanguage(text);
  if (langRequest) {
    entities.requestedLanguage = langRequest;
    // If a language switch is detected, boost that intent
    if (scores.language_switch > 0) {
      topIntent  = 'language_switch';
      confidence = Math.max(confidence, 0.8);
    }
  }

  // ── Contextual disambiguation ──
  if (context.lastIntent) {
    // 'yes' / 'ji' after a product question → affirmative about that product
    if (topIntent === 'affirmative' && context.currentProduct) {
      entities.product = entities.product || context.currentProduct;
    }

    // Short affirmative/negative after a form prompt → keep that intent
    // (don't reclassify into something else)

    // If user says a category name alone, and we recently showed product_list,
    // treat it as product_category selection
    if (context.lastIntent === 'product_list' && entities.category && topScore < 3) {
      topIntent  = 'product_category';
      confidence = Math.max(confidence, 0.7);
    }

    // If user says a product name alone after product_category / product_list
    if (['product_category', 'product_list', 'upsell_trigger'].includes(context.lastIntent)
        && entities.product && topScore < 2) {
      topIntent  = 'product_detail';
      confidence = Math.max(confidence, 0.65);
    }

    // "yes" after lead_capture or contact_request → keep as affirmative
    if (topIntent === 'affirmative' &&
        ['lead_capture', 'contact_request'].includes(context.lastIntent)) {
      // Affirmative is the correct intent here — no override needed
    }
  }

  // ── Confidence gate ──
  if (confidence < CONFIDENCE_THRESHOLD) {
    topIntent  = 'unknown';
    confidence = Math.round(confidence * 100) / 100;
  } else {
    confidence = Math.round(confidence * 100) / 100;
  }

  return {
    intent:     topIntent,
    confidence: confidence,
    entities:   entities,
    language:   lang
  };
}

/**
 * Returns all supported intent names (useful for analytics / training UI).
 * @returns {string[]}
 */
export function getSupportedIntents() {
  return Object.keys(INTENT_PATTERNS);
}
