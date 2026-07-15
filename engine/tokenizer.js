/**
 * @fileoverview Text Preprocessing Module — KAFI AI Agent NLP Engine
 * 
 * Provides tokenization, stopword removal, suffix-stripping stemming,
 * full normalization pipeline, language detection (English / romanized Urdu),
 * and numeric/weight extraction.
 * 
 * Zero dependencies — vanilla ES module.
 * 
 * @module tokenizer
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/**
 * Common English stopwords to strip during normalization.
 * Kept as a Set for O(1) lookups.
 * @type {Set<string>}
 */
const ENGLISH_STOPWORDS = new Set([
  'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'about', 'up', 'down', 'if', 'while',
  'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'might',
  'will', 'shall', 'can', 'may', 'must', 'need', 'dare', 'ought',
  'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'not', 'no', 'nor', 'don', 'doesn', 'didn', 'won', 'wouldn',
  'shouldn', 'couldn', 'haven', 'hasn', 'hadn', 'aren', 'isn', 'wasn', 'weren'
]);

/**
 * Romanized Urdu marker words. If the input contains several of these,
 * we classify the language as Urdu.
 * @type {Set<string>}
 */
const URDU_MARKERS = new Set([
  'kia', 'kya', 'hain', 'hai', 'ap', 'aap', 'mujhay', 'mujhe', 'bhai',
  'yeh', 'ye', 'acha', 'achchha', 'accha', 'batao', 'bataiye', 'batayen',
  'chahiye', 'chaahiye', 'kahan', 'kahaan', 'kitna', 'kitne', 'kitni',
  'wala', 'wali', 'walay', 'sahab', 'sahib', 'jaan', 'kafi', 'bohot',
  'bahut', 'bohat', 'nahi', 'nahin', 'lekin', 'magar', 'aur', 'ya',
  'hum', 'tum', 'mein', 'main', 'tera', 'mera', 'uska', 'iska',
  'kon', 'kaun', 'kab', 'kyun', 'kaise', 'kaisay',
  'ji', 'haan', 'bilkul', 'zaroor', 'shukriya', 'meherbani',
  'alvida', 'khuda', 'hafiz', 'assalam', 'salam', 'walaikum',
  'dikhao', 'dikhaiye', 'batain', 'sunao', 'pucho',
  'lena', 'dena', 'karna', 'hona', 'jana', 'aana',
  'khana', 'peena', 'kharidna', 'bechna',
  'wajan', 'qeemat', 'daam', 'rate', 'paisay', 'rupay',
  'masala', 'masalay', 'chawal', 'namak', 'seviyan', 'nimko',
  'chota', 'bara', 'chhota', 'bada', 'zyada', 'kam',
  'theek', 'sahi', 'galat', 'mushkil', 'asan', 'asaan'
]);

/**
 * Regex to find weight expressions like 500g, 1kg, 250 grams, 2.5 kg, etc.
 * Captures: (number) (unit)
 * @type {RegExp}
 */
const WEIGHT_REGEX = /(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|kg|kgs|kilogram|kilograms|lbs?|pounds?|oz|ounces?|ml|litre|liter|litres|liters|l)\b/gi;

/**
 * Regex to find standalone numbers not attached to units.
 * @type {RegExp}
 */
const NUMBER_REGEX = /\b(\d+(?:\.\d+)?)\b/g;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Splits raw text into lowercase word tokens, stripping punctuation.
 *
 * @param {string} text — raw user input
 * @returns {string[]} array of lowercase tokens
 *
 * @example
 * tokenize("Hello, KAFI! How are you?");
 * // => ["hello", "kafi", "how", "are", "you"]
 */
export function tokenize(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];

  return text
    .toLowerCase()
    .replace(/['']/g, "'")           // normalize fancy quotes
    .replace(/[^\w\s'-]/g, ' ')      // strip punctuation except apostrophes/hyphens
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .split(' ')
    .filter(token => token.length > 0);
}

/**
 * Removes common English stopwords from a token array.
 *
 * @param {string[]} tokens — array of lowercase tokens
 * @returns {string[]} filtered tokens
 *
 * @example
 * removeStopwords(["what", "is", "the", "price"]);
 * // => ["price"]
 */
export function removeStopwords(tokens) {
  if (!Array.isArray(tokens)) return [];
  return tokens.filter(t => !ENGLISH_STOPWORDS.has(t));
}

/**
 * Simple suffix-stripping stemmer.
 * Removes common English suffixes while guarding against over-stemming
 * on very short words.
 *
 * @param {string} word — a single lowercase token
 * @returns {string} stemmed form
 *
 * @example
 * stem("running");  // => "runn"
 * stem("packed");   // => "pack"
 * stem("boxes");    // => "box"
 */
export function stem(word) {
  if (typeof word !== 'string' || word.length < 4) return word;

  // Order matters: try longer suffixes first to avoid partial strips
  const suffixes = [
    { suffix: 'ation', minLen: 6 },
    { suffix: 'tion',  minLen: 6 },
    { suffix: 'ness',  minLen: 6 },
    { suffix: 'ment',  minLen: 6 },
    { suffix: 'able',  minLen: 6 },
    { suffix: 'ible',  minLen: 6 },
    { suffix: 'ling',  minLen: 6 },
    { suffix: 'ally',  minLen: 6 },
    { suffix: 'ful',   minLen: 5 },
    { suffix: 'ous',   minLen: 5 },
    { suffix: 'ive',   minLen: 5 },
    { suffix: 'ing',   minLen: 5 },
    { suffix: 'ily',   minLen: 5 },
    { suffix: 'ly',    minLen: 4 },
    { suffix: 'ed',    minLen: 4 },
    { suffix: 'er',    minLen: 4 },
    { suffix: 'es',    minLen: 4 },
    { suffix: 's',     minLen: 4 }
  ];

  for (const { suffix, minLen } of suffixes) {
    if (word.length >= minLen && word.endsWith(suffix)) {
      const stemmed = word.slice(0, -suffix.length);
      // Guard: stem must have at least 2 characters remaining
      if (stemmed.length >= 2) return stemmed;
    }
  }

  return word;
}

/**
 * Full normalization pipeline: tokenize → remove stopwords → stem.
 *
 * @param {string} text — raw user input
 * @returns {string[]} array of stemmed, filtered tokens
 *
 * @example
 * normalize("What are the packaging details?");
 * // => ["packag", "detail"]
 */
export function normalize(text) {
  const tokens   = tokenize(text);
  const filtered = removeStopwords(tokens);
  return filtered.map(stem);
}

/**
 * Detects whether user input is English or romanized Urdu.
 *
 * Heuristic: count how many tokens appear in the Urdu marker set.
 * If ≥ 30 % of tokens match, classify as 'urdu'; otherwise 'english'.
 *
 * @param {string} text — raw user input
 * @returns {'english' | 'urdu'} detected language code
 *
 * @example
 * detectLanguage("Ap ka kia haal hai?");  // => "urdu"
 * detectLanguage("Show me products");      // => "english"
 */
export function detectLanguage(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return 'english';

  const tokens = tokenize(text);
  if (tokens.length === 0) return 'english';

  let urduHits = 0;
  for (const token of tokens) {
    if (URDU_MARKERS.has(token)) urduHits++;
  }

  const ratio = urduHits / tokens.length;

  // Single-word Urdu greetings / keywords should still be detected
  if (tokens.length === 1 && URDU_MARKERS.has(tokens[0])) return 'urdu';
  if (tokens.length <= 3 && urduHits >= 1) return 'urdu';

  return ratio >= 0.3 ? 'urdu' : 'english';
}

/**
 * Extracts numeric values and weight/unit expressions from text.
 *
 * @param {string} text — raw user input
 * @returns {{ weights: Array<{value: number, unit: string, raw: string}>, numbers: number[] }}
 *
 * @example
 * extractNumbers("I need 500g and 2kg packs");
 * // => {
 * //   weights: [
 * //     { value: 500, unit: 'g',  raw: '500g'  },
 * //     { value: 2,   unit: 'kg', raw: '2kg'   }
 * //   ],
 * //   numbers: [500, 2]
 * // }
 */
export function extractNumbers(text) {
  if (typeof text !== 'string') return { weights: [], numbers: [] };

  const weights = [];
  const seenNumbers = new Set();

  // First pass: weight expressions (number + unit)
  let match;
  const weightRegex = new RegExp(WEIGHT_REGEX.source, 'gi'); // fresh regex
  while ((match = weightRegex.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    const unit  = normalizeUnit(match[2].toLowerCase());
    weights.push({ value, unit, raw: match[0].trim() });
    seenNumbers.add(value);
  }

  // Second pass: standalone numbers not already captured as weights
  const numbers = [];
  const numberRegex = new RegExp(NUMBER_REGEX.source, 'g');
  while ((match = numberRegex.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (!seenNumbers.has(value)) {
      numbers.push(value);
      seenNumbers.add(value);
    }
  }

  // Merge all numbers into a single list as well
  const allNumbers = [...seenNumbers];

  return { weights, numbers: allNumbers };
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Normalizes variant unit strings to canonical short forms.
 * @param {string} unit
 * @returns {string}
 */
function normalizeUnit(unit) {
  const map = {
    g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    ml: 'ml',
    l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l'
  };
  return map[unit] || unit;
}
