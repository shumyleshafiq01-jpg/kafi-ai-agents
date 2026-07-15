/**
 * @fileoverview Entity Extraction Module — KAFI AI Agent NLP Engine
 *
 * Provides fuzzy matching of user input against product names, categories,
 * weight expressions, and language preferences. Uses Levenshtein distance
 * for robust partial / misspelled matching.
 *
 * Dependency: tokenizer.js (for tokenize, extractNumbers)
 *
 * @module entity-extractor
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

import { tokenize, extractNumbers } from './tokenizer.js';

// ─────────────────────────────────────────────
// Known categories for KAFI Group product lines
// ─────────────────────────────────────────────

/**
 * Canonical product categories with common aliases (English + romanized Urdu).
 * @type {Object<string, string[]>}
 */
const CATEGORY_MAP = {
  rice:        ['rice', 'chawal', 'chaawal', 'basmati', 'sella', 'biryani'],
  salt:        ['salt', 'namak', 'pink salt', 'himalayan salt', 'rock salt', 'table salt'],
  vermicelli:  ['vermicelli', 'seviyan', 'sewaiyan', 'sewain', 'sevian', 'noodles'],
  spices:      ['spices', 'masala', 'masalay', 'masale', 'haldi', 'mirch', 'zeera',
                'turmeric', 'chili', 'cumin', 'coriander', 'garam masala', 'spice'],
  condiments:  ['condiments', 'sauce', 'chutney', 'ketchup', 'vinegar', 'pickle', 'achaar'],
  desserts:    ['desserts', 'dessert', 'mithai', 'sweet', 'sweets', 'kheer', 'halwa'],
  juices:      ['juices', 'juice', 'drink', 'drinks', 'sharbat', 'syrup', 'beverage'],
  snacks:      ['snacks', 'snack', 'nimko', 'chips', 'namkeen', 'chanachur', 'biscuit', 'biscuits']
};

/**
 * Language identifiers with common aliases.
 * @type {Object<string, string[]>}
 */
const LANGUAGE_MAP = {
  english: ['english', 'eng', 'angrezi', 'angrez'],
  urdu:    ['urdu', 'hindi', 'roman urdu', 'romanized']
};

// ─────────────────────────────────────────────
// Core: Levenshtein Distance
// ─────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings.
 * Uses the classic dynamic-programming approach (O(m×n) time/space).
 *
 * @param {string} a — first string (already lowercased)
 * @param {string} b — second string (already lowercased)
 * @returns {number} edit distance
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // Edge cases
  if (m === 0) return n;
  if (n === 0) return m;

  // DP matrix (only two rows needed for memory efficiency)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev]; // swap rows
  }

  return prev[n];
}

/**
 * Calculates a similarity score (0–1) between two strings using
 * Levenshtein distance normalized by the longer string's length.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} similarity score 0..1 (1 = identical)
 */
function similarity(a, b) {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(al, bl) / maxLen;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Fuzzy-matches an input string against an array of candidate strings.
 * Returns the best match whose score meets the threshold, or null.
 *
 * The function tries three strategies:
 *   1. Exact substring match (score 1.0)
 *   2. Token-level containment (partial match)
 *   3. Levenshtein similarity on individual tokens
 *
 * @param {string} input     — user input (raw text or a token)
 * @param {string[]} candidates — list of possible matches
 * @param {number} [threshold=0.55] — minimum similarity score to accept
 * @returns {{ match: string, score: number } | null}
 *
 * @example
 * fuzzyMatch("fliptop", ["Pink Salt - Fliptop Bottle", "Table Salt"]);
 * // => { match: "Pink Salt - Fliptop Bottle", score: 1.0 }
 */
/**
 * Common words and category names that should never be extracted as specific product entities.
 */
const BLOCKED_PRODUCT_KEYWORDS = new Set([
  'rice', 'salt', 'spices', 'spice', 'vermicelli', 'condiments', 'desserts', 'dessert', 'juices', 'juice', 'snacks', 'snack',
  'products', 'product', 'items', 'item', 'details', 'detail', 'packaging', 'package', 'pack', 'weight', 'weights', 'size', 'sizes',
  'price', 'prices', 'cost', 'rate', 'rates', 'order', 'orders', 'buy', 'purchase',
  'me', 'my', 'all', 'show', 'tell', 'about', 'want', 'where', 'how', 'who', 'what',
  'kya', 'kia', 'batao', 'chawal', 'namak', 'mithai', 'seviyan'
]);

export function fuzzyMatch(input, candidates, threshold = 0.55) {
  if (typeof input !== 'string' || !input.trim()) return null;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const inputLower  = input.toLowerCase().trim();
  const inputTokens = tokenize(input);

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candLower  = candidate.toLowerCase();
    const candTokens = tokenize(candidate);
    let score = 0;

    // ── Strategy 1: exact substring containment ──
    if (candLower.includes(inputLower) || inputLower.includes(candLower)) {
      // Score based on length ratio (longer match in shorter container = higher)
      score = Math.min(inputLower.length, candLower.length) /
              Math.max(inputLower.length, candLower.length);
      // Boost: if the full input is found inside the candidate, give high score
      if (candLower.includes(inputLower)) {
        const escaped = inputLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundaryRegex = new RegExp('\\b' + escaped + '\\b', 'i');
        if (boundaryRegex.test(candLower) && inputLower.length >= 4) {
          score = Math.max(score, 0.85);
        }
      }
    }

    // ── Strategy 2: token-level containment ──
    if (inputTokens.length > 0 && candTokens.length > 0) {
      let tokenHits = 0;
      for (const it of inputTokens) {
        if (it.length < 3) continue; // skip short tokens < 3 chars (like 'me', 'in', 'at')
        for (const ct of candTokens) {
          if (ct.length < 3) continue;
          if (ct.includes(it) || it.includes(ct)) {
            tokenHits++;
            break;
          }
        }
      }
      const tokenScore = tokenHits / Math.max(inputTokens.length, 1);
      score = Math.max(score, tokenScore);
    }

    // ── Strategy 3: best Levenshtein across token pairs ──
    if (inputTokens.length === 1) {
      for (const it of inputTokens) {
        if (it.length < 3) continue; // skip short tokens < 3 chars
        for (const ct of candTokens) {
          if (ct.length < 3) continue;
          const sim = similarity(it, ct);
          score = Math.max(score, sim * 0.9); // slight penalty vs. exact match
        }
      }
    }

    // ── Strategy 4: full-string Levenshtein (for short inputs) ──
    if (inputLower.length <= 20) {
      const fullSim = similarity(inputLower, candLower);
      score = Math.max(score, fullSim * 0.85);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestScore >= threshold && bestMatch !== null) {
    return { match: bestMatch, score: Math.round(bestScore * 100) / 100 };
  }

  return null;
}

/**
 * Extracts the best-matching product name from user text.
 *
 * @param {string} text     — raw user input
 * @param {Array<{name: string}>} products — product catalogue (objects with a `name` field)
 * @returns {{ product: string, score: number } | null}
 *
 * @example
 * extractProductName("tell me about fliptop salt", products);
 * // => { product: "Pink Salt - Fliptop Bottle", score: 0.85 }
 */
export function extractProductName(text, products) {
  if (typeof text !== 'string' || !Array.isArray(products)) return null;

  const names = products.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean);
  if (names.length === 0) return null;

  // Try the full text first, if it's not a blocked keyword
  let result = null;
  if (!BLOCKED_PRODUCT_KEYWORDS.has(text.toLowerCase().trim())) {
    const fullMatch = fuzzyMatch(text, names, 0.45);
    if (fullMatch && fullMatch.score >= 0.7) {
      return { product: fullMatch.match, score: fullMatch.score };
    }
  }

  // Try multi-word sliding windows (3-word, 2-word) over the input tokens
  const tokens = tokenize(text);
  for (let windowSize = Math.min(4, tokens.length); windowSize >= 1; windowSize--) {
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      const phrase = tokens.slice(i, i + windowSize).join(' ');
      
      // Skip if the phrase is a blocked keyword
      if (BLOCKED_PRODUCT_KEYWORDS.has(phrase.toLowerCase().trim())) {
        continue;
      }
      
      const match  = fuzzyMatch(phrase, names, 0.55);
      if (match && match.score > (result ? result.score : 0)) {
        result = match;
      }
    }
  }

  if (result) {
    return { product: result.match, score: result.score };
  }

  return null;
}

/**
 * Extracts a product category from user text.
 *
 * @param {string} text — raw user input
 * @returns {{ category: string, score: number } | null}
 *
 * @example
 * extractCategory("Show me your rice products");
 * // => { category: "rice", score: 1.0 }
 */
export function extractCategory(text) {
  if (typeof text !== 'string') return null;

  const tokens = tokenize(text);
  let bestCategory = null;
  let bestScore    = 0;

  for (const [category, aliases] of Object.entries(CATEGORY_MAP)) {
    for (const alias of aliases) {
      const aliasTokens = alias.split(' ');

      // Check if alias appears as a whole word / phrase in the original text
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escapedAlias + '\\b', 'i');
      if (regex.test(text)) {
        const score = 1.0;
        if (score > bestScore) {
          bestScore    = score;
          bestCategory = category;
        }
        continue;
      }

      // Token-level fuzzy check
      for (const token of tokens) {
        if (token.length < 2) continue;
        for (const at of aliasTokens) {
          const sim = similarity(token, at);
          if (sim >= 0.75 && sim > bestScore) {
            bestScore    = sim;
            bestCategory = category;
          }
        }
      }
    }
  }

  if (bestCategory) {
    return { category: bestCategory, score: Math.round(bestScore * 100) / 100 };
  }
  return null;
}

/**
 * Extracts weight/quantity from user text.
 * Delegates to tokenizer.extractNumbers for the heavy lifting.
 *
 * @param {string} text — raw user input
 * @returns {Array<{value: number, unit: string, raw: string}>}
 *
 * @example
 * extractWeight("Do you have 500g and 1kg packs?");
 * // => [{ value: 500, unit: 'g', raw: '500g' }, { value: 1, unit: 'kg', raw: '1kg' }]
 */
export function extractWeight(text) {
  if (typeof text !== 'string') return [];
  const { weights } = extractNumbers(text);
  return weights;
}

/**
 * Detects the language the user is requesting (not the language they're typing in).
 * E.g. "speak in urdu please" → urdu
 *
 * @param {string} text — raw user input
 * @returns {string | null} 'english', 'urdu', or null if not explicitly requested
 */
export function extractLanguage(text) {
  if (typeof text !== 'string') return null;

  const lower = text.toLowerCase();

  for (const [lang, aliases] of Object.entries(LANGUAGE_MAP)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) return lang;
    }
  }

  return null;
}
