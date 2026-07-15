/**
 * @fileoverview Learning Engine — KAFI AI Agent NLP Engine
 *
 * Logs conversations, tracks unrecognized inputs, stores admin-supplied
 * training data, and computes usage analytics. All data is persisted
 * to localStorage (browser) with graceful fallback to in-memory storage.
 *
 * No external dependencies — standalone ES module.
 *
 * @module learning-engine
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

// ─────────────────────────────────────────────
// Constants / Storage Keys
// ─────────────────────────────────────────────

const STORAGE_KEYS = {
  CONVERSATIONS:   'kafi_conversations',
  UNRECOGNIZED:    'kafi_unrecognized',
  TRAINING_DATA:   'kafi_training_data',
  ANALYTICS_CACHE: 'kafi_analytics_cache'
};

/** Maximum stored conversations before oldest are pruned. */
const MAX_CONVERSATIONS = 500;

/** Maximum stored unrecognized inputs. */
const MAX_UNRECOGNIZED = 1000;

// ─────────────────────────────────────────────
// Storage Adapter
// ─────────────────────────────────────────────

/**
 * Thin wrapper around localStorage with in-memory fallback.
 * Handles quota errors gracefully.
 */
const Storage = {
  /** @type {Map<string, string>} In-memory fallback */
  _mem: new Map(),

  /** @returns {boolean} */
  _hasLocalStorage() {
    try {
      const test = '__kafi_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * @param {string} key
   * @returns {*} parsed JSON or null
   */
  get(key) {
    try {
      const raw = this._hasLocalStorage()
        ? localStorage.getItem(key)
        : this._mem.get(key) || null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * @param {string} key
   * @param {*} value — will be JSON-stringified
   */
  set(key, value) {
    try {
      const json = JSON.stringify(value);
      if (this._hasLocalStorage()) {
        localStorage.setItem(key, json);
      } else {
        this._mem.set(key, json);
      }
    } catch (err) {
      // Quota exceeded — try to free space
      console.warn('[KAFI LearningEngine] Storage write failed:', err.message);
      this._evict(key);
    }
  },

  /**
   * @param {string} key
   */
  remove(key) {
    try {
      if (this._hasLocalStorage()) {
        localStorage.removeItem(key);
      } else {
        this._mem.delete(key);
      }
    } catch {
      // silent
    }
  },

  /**
   * Attempts to free space by trimming stored arrays.
   * @param {string} key
   * @private
   */
  _evict(key) {
    try {
      const data = this.get(key);
      if (Array.isArray(data) && data.length > 50) {
        this.set(key, data.slice(-50));
      }
    } catch {
      // Give up silently
    }
  }
};

// ─────────────────────────────────────────────
// LearningEngine Class
// ─────────────────────────────────────────────

/**
 * Handles conversation logging, unrecognized-input tracking,
 * custom training data management, and usage analytics.
 *
 * @example
 * const engine = new LearningEngine();
 * engine.logConversation('session-123', [
 *   { role: 'user', text: 'Hello' },
 *   { role: 'bot',  text: 'Hi! How can I help?' }
 * ]);
 * console.log(engine.getAnalytics());
 */
export class LearningEngine {

  constructor() {
    // Validate stored data on init
    this._ensureStorageIntegrity();
  }

  // ── Conversation Logging ───────────────────

  /**
   * Saves a complete conversation to storage.
   *
   * @param {string} sessionId — unique session identifier
   * @param {Array<{role: string, text: string, timestamp?: number}>} messages — message array
   */
  logConversation(sessionId, messages) {
    if (!sessionId || !Array.isArray(messages) || messages.length === 0) return;

    const conversations = this._getConversations();

    conversations.push({
      sessionId,
      messages,
      startedAt: messages[0]?.timestamp || Date.now(),
      endedAt:   messages[messages.length - 1]?.timestamp || Date.now(),
      messageCount: messages.length,
      loggedAt: Date.now()
    });

    // Prune if over limit
    if (conversations.length > MAX_CONVERSATIONS) {
      conversations.splice(0, conversations.length - MAX_CONVERSATIONS);
    }

    Storage.set(STORAGE_KEYS.CONVERSATIONS, conversations);
  }

  /**
   * Logs an input that the classifier could not recognize.
   *
   * @param {string} input — the raw user text
   * @param {Object} [context={}] — conversation context at the time of failure
   */
  logUnrecognized(input, context = {}) {
    if (typeof input !== 'string' || !input.trim()) return;

    const entries = this._getUnrecognized();

    entries.push({
      input: input.trim(),
      context: {
        lastIntent:      context.lastIntent || null,
        currentProduct:  context.currentProduct || null,
        currentCategory: context.currentCategory || null,
        language:        context.language || 'english'
      },
      timestamp: Date.now()
    });

    // Prune
    if (entries.length > MAX_UNRECOGNIZED) {
      entries.splice(0, entries.length - MAX_UNRECOGNIZED);
    }

    Storage.set(STORAGE_KEYS.UNRECOGNIZED, entries);
  }

  /**
   * Retrieves all logged conversations.
   * @returns {Array}
   */
  getConversationLogs() {
    return this._getConversations();
  }

  /**
   * Retrieves all unrecognized inputs.
   * @returns {Array<{input: string, context: Object, timestamp: number}>}
   */
  getUnrecognizedInputs() {
    return this._getUnrecognized();
  }

  // ── Training Data ──────────────────────────

  /**
   * Adds a new training example (admin-supplied).
   *
   * @param {string} input    — example user input
   * @param {string} intent   — correct intent label
   * @param {Object} [entities={}] — correct entities
   */
  addTrainingData(input, intent, entities = {}) {
    if (typeof input !== 'string' || typeof intent !== 'string') return;

    const data = this._getTrainingData();

    data.push({
      input:    input.trim(),
      intent:   intent.trim(),
      entities: entities,
      addedAt:  Date.now()
    });

    Storage.set(STORAGE_KEYS.TRAINING_DATA, data);
  }

  /**
   * Retrieves all custom training data.
   * @returns {Array<{input: string, intent: string, entities: Object, addedAt: number}>}
   */
  getTrainingData() {
    return this._getTrainingData();
  }

  // ── Analytics ──────────────────────────────

  /**
   * Computes usage analytics across all logged data.
   *
   * @returns {{
   *   totalConversations: number,
   *   totalMessages: number,
   *   topIntents: Array<{intent: string, count: number}>,
   *   unrecognizedCount: number,
   *   avgSessionLength: number
   * }}
   */
  getAnalytics() {
    const conversations = this._getConversations();
    const unrecognized  = this._getUnrecognized();

    // Total counts
    const totalConversations = conversations.length;
    let totalMessages = 0;
    const intentCounts = {};

    for (const conv of conversations) {
      totalMessages += conv.messageCount || (conv.messages ? conv.messages.length : 0);

      // Count intents from messages
      if (Array.isArray(conv.messages)) {
        for (const msg of conv.messages) {
          if (msg.intent) {
            intentCounts[msg.intent] = (intentCounts[msg.intent] || 0) + 1;
          }
        }
      }
    }

    // Top intents sorted by frequency
    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Average session length (messages per conversation)
    const avgSessionLength = totalConversations > 0
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;

    return {
      totalConversations,
      totalMessages,
      topIntents,
      unrecognizedCount: unrecognized.length,
      avgSessionLength
    };
  }

  // ── Export / Clear ─────────────────────────

  /**
   * Exports all conversation logs as a CSV string.
   *
   * Columns: SessionId, Timestamp, Role, Text, Intent
   *
   * @returns {string} CSV-formatted string
   */
  exportCSV() {
    const conversations = this._getConversations();
    const rows = [['SessionId', 'Timestamp', 'Role', 'Text', 'Intent']];

    for (const conv of conversations) {
      if (!Array.isArray(conv.messages)) continue;
      for (const msg of conv.messages) {
        rows.push([
          escapeCSV(conv.sessionId),
          msg.timestamp ? new Date(msg.timestamp).toISOString() : '',
          escapeCSV(msg.role || ''),
          escapeCSV(msg.text || ''),
          escapeCSV(msg.intent || '')
        ]);
      }
    }

    // Also append unrecognized inputs
    const unrecognized = this._getUnrecognized();
    if (unrecognized.length > 0) {
      rows.push([]); // blank row separator
      rows.push(['--- Unrecognized Inputs ---', '', '', '', '']);
      rows.push(['Input', 'Timestamp', 'LastIntent', 'Language', '']);

      for (const entry of unrecognized) {
        rows.push([
          escapeCSV(entry.input),
          entry.timestamp ? new Date(entry.timestamp).toISOString() : '',
          escapeCSV(entry.context?.lastIntent || ''),
          escapeCSV(entry.context?.language || ''),
          ''
        ]);
      }
    }

    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Clears ALL logged data (conversations, unrecognized, training data).
   */
  clearLogs() {
    Storage.remove(STORAGE_KEYS.CONVERSATIONS);
    Storage.remove(STORAGE_KEYS.UNRECOGNIZED);
    Storage.remove(STORAGE_KEYS.TRAINING_DATA);
    Storage.remove(STORAGE_KEYS.ANALYTICS_CACHE);
  }

  // ── Internal Helpers ───────────────────────

  /** @returns {Array} */
  _getConversations() {
    return Storage.get(STORAGE_KEYS.CONVERSATIONS) || [];
  }

  /** @returns {Array} */
  _getUnrecognized() {
    return Storage.get(STORAGE_KEYS.UNRECOGNIZED) || [];
  }

  /** @returns {Array} */
  _getTrainingData() {
    return Storage.get(STORAGE_KEYS.TRAINING_DATA) || [];
  }

  /**
   * Validates that stored data hasn't been corrupted.
   * @private
   */
  _ensureStorageIntegrity() {
    for (const key of Object.values(STORAGE_KEYS)) {
      const data = Storage.get(key);
      if (data !== null && !Array.isArray(data) && typeof data !== 'object') {
        // Corrupted — reset
        Storage.remove(key);
      }
    }
  }
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

/**
 * Escapes a value for safe CSV inclusion.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeCSV(value) {
  if (typeof value !== 'string') return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
