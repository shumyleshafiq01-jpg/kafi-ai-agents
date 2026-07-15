/**
 * @fileoverview Conversation Context Manager — KAFI AI Agent NLP Engine
 *
 * Maintains conversational state across turns: current product/category focus,
 * message history, language preference, and form-display guards that prevent
 * the dreaded "form death loop."
 *
 * No external dependencies — standalone ES module.
 *
 * @module context-manager
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** Maximum messages to keep in history before pruning oldest. */
const MAX_HISTORY_SIZE = 100;

/** Minimum turns between consecutive form displays. */
const FORM_COOLDOWN_TURNS = 5;

// ─────────────────────────────────────────────
// ContextManager Class
// ─────────────────────────────────────────────

/**
 * Manages conversational state for a single chat session.
 *
 * @example
 * const ctx = new ContextManager();
 * ctx.update('greeting', {});
 * ctx.addMessage('user', 'Hello');
 * ctx.addMessage('bot', 'Hi! How can I help you?');
 * console.log(ctx.getContext());
 */
export class ContextManager {

  /**
   * Creates a new ContextManager with a clean state.
   * @param {string} [language='english'] — initial language preference
   */
  constructor(language = 'english') {
    /** @type {ContextState} */
    this.state = this._createFreshState(language);
  }

  // ── State Management ───────────────────────

  /**
   * Updates the context based on a newly classified intent and extracted entities.
   *
   * @param {string} intent   — classified intent name
   * @param {Object} entities — extracted entities { product?, category?, weights?, requestedLanguage? }
   */
  update(intent, entities = {}) {
    if (typeof intent !== 'string') return;

    this.state.lastIntent = intent;
    this.state.turnCount += 1;

    // ── Product focus ──
    if (entities.product) {
      this.state.currentProduct = entities.product;
    }

    // ── Category focus ──
    if (entities.category) {
      this.state.currentCategory = entities.category;
    }

    // ── Language preference ──
    if (entities.requestedLanguage) {
      this.state.language = entities.requestedLanguage;
    }

    // ── Track if form was shown (set by response generator) ──
    // The formShownOnTurn is managed via markFormShown()

    // ── Track lead capture ──
    if (intent === 'lead_capture' || intent === 'contact_request') {
      // Don't auto-mark as captured — let the response generator
      // call markFormShown() after actually displaying the form.
    }
  }

  /**
   * Returns a shallow copy of the current conversation state.
   * Safe to pass around without mutation risk.
   *
   * @returns {ContextState}
   */
  getContext() {
    return { ...this.state };
  }

  /**
   * Resets all conversation state to defaults.
   */
  reset() {
    this.state = this._createFreshState(this.state.language);
  }

  // ── Form Display Guard ─────────────────────

  /**
   * Determines whether a contact/lead-capture form should be shown.
   *
   * Rules (prevents form death loop):
   *   1. The intent MUST be explicitly `contact_request` or `lead_capture`.
   *   2. The form must NOT have been shown in the last FORM_COOLDOWN_TURNS turns.
   *   3. If the user already submitted a lead, don't show again (leadCaptured flag).
   *
   * @returns {boolean}
   */
  shouldShowForm() {
    const { lastIntent, formShownOnTurn, turnCount, leadCaptured } = this.state;

    // Rule 1: intent gate
    if (lastIntent !== 'contact_request' && lastIntent !== 'lead_capture') {
      return false;
    }

    // Rule 3: already captured
    if (leadCaptured) {
      return false;
    }

    // Rule 2: cooldown
    if (formShownOnTurn !== null && (turnCount - formShownOnTurn) < FORM_COOLDOWN_TURNS) {
      return false;
    }

    return true;
  }

  /**
   * Records that a form was displayed on the current turn.
   * Called by the response generator after inserting the form into the response.
   */
  markFormShown() {
    this.state.formShownOnTurn = this.state.turnCount;
  }

  /**
   * Records that the user has successfully submitted a lead form.
   */
  markLeadCaptured() {
    this.state.leadCaptured = true;
  }

  // ── Message History ────────────────────────

  /**
   * Appends a message to the conversation history.
   *
   * @param {'user' | 'bot'} role — who sent the message
   * @param {string} text — message content
   */
  addMessage(role, text) {
    if (!role || typeof text !== 'string') return;

    this.state.messageHistory.push({
      role,
      text,
      timestamp: Date.now(),
      turn: this.state.turnCount
    });

    // Prune oldest messages if history exceeds limit
    if (this.state.messageHistory.length > MAX_HISTORY_SIZE) {
      this.state.messageHistory = this.state.messageHistory.slice(-MAX_HISTORY_SIZE);
    }
  }

  /**
   * Returns the last N messages from history.
   *
   * @param {number} [n=5] — number of recent messages to retrieve
   * @returns {Array<{role: string, text: string, timestamp: number, turn: number}>}
   */
  getRecentHistory(n = 5) {
    const count = Math.max(1, Math.min(n, this.state.messageHistory.length));
    return this.state.messageHistory.slice(-count);
  }

  /**
   * Returns the total number of messages in history.
   * @returns {number}
   */
  getMessageCount() {
    return this.state.messageHistory.length;
  }

  // ── Serialization ──────────────────────────

  /**
   * Exports the full state as a plain object (for localStorage persistence).
   * @returns {ContextState}
   */
  toJSON() {
    return { ...this.state };
  }

  /**
   * Restores state from a previously serialized object.
   * @param {ContextState} data
   */
  fromJSON(data) {
    if (data && typeof data === 'object') {
      this.state = {
        ...this._createFreshState(),
        ...data,
        messageHistory: Array.isArray(data.messageHistory) ? data.messageHistory : []
      };
    }
  }

  // ── Internals ──────────────────────────────

  /**
   * Creates a blank state object.
   * @param {string} [language='english']
   * @returns {ContextState}
   * @private
   */
  _createFreshState(language = 'english') {
    return {
      currentCategory:  null,
      currentProduct:   null,
      lastIntent:       null,
      language:         language,
      formShownOnTurn:  null,
      leadCaptured:     false,
      messageHistory:   [],
      turnCount:        0
    };
  }
}

/**
 * @typedef {Object} ContextState
 * @property {string|null}  currentCategory  — active product category
 * @property {string|null}  currentProduct   — active product name
 * @property {string|null}  lastIntent       — intent from the previous turn
 * @property {string}       language         — 'english' or 'urdu'
 * @property {number|null}  formShownOnTurn  — turn number when form was last displayed
 * @property {boolean}      leadCaptured     — whether user submitted a lead form
 * @property {Array}        messageHistory   — chronological message log
 * @property {number}       turnCount        — total turns in conversation
 */
