/**
 * @fileoverview Conversation Manager Module — KAFI AI Agent NLP Engine
 * 
 * Extends ContextManager to provide compatibility with frontend addTurn expectations.
 * 
 * @module conversation-manager
 * @version 1.0.0
 */

import { ContextManager } from './context-manager.js';

export class ConversationManager extends ContextManager {
  /**
   * @param {string} [language='english']
   */
  constructor(language = 'english') {
    super(language);
  }

  /**
   * Frontend-compatible method to add a message turn.
   * Delegates to ContextManager.addMessage.
   * 
   * @param {'user' | 'bot'} role
   * @param {string} text
   */
  addTurn(role, text) {
    this.addMessage(role, text);
  }
}

export default ConversationManager;
