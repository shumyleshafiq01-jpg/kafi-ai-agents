/**
 * @fileoverview NLP Engine Coordinate Module — KAFI AI Agent NLP Engine
 * 
 * Integrates intent classification and entity extraction.
 * 
 * @module nlp-engine
 * @version 1.0.0
 */

import { classifyIntent } from './intent-classifier.js';

export class NLPEngine {
  /**
   * @param {Object} trainingData
   */
  constructor(trainingData = {}) {
    this.trainingData = trainingData;
  }

  /**
   * Classifies the intent of the input text based on the conversation context.
   * 
   * @param {string} text — raw user input
   * @param {string|Object} langOrContext — language code or context object
   * @param {Object} [maybeContext] — context object if language was passed first
   * @returns {Object} { intent, confidence, entities, language }
   */
  classify(text, langOrContext, maybeContext) {
    let context = maybeContext || langOrContext || {};
    if (typeof context === 'string') {
      context = { language: context === 'ur' ? 'urdu' : 'english' };
    }
    return classifyIntent(text, context);
  }
}

export default NLPEngine;
