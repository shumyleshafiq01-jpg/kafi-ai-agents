/**
 * @fileoverview Response Generator — KAFI AI Agent NLP Engine
 *
 * Builds structured chatbot responses from classified intents, extracted
 * entities, conversation context, and the product knowledge base.
 *
 * Returns: { text, products[], showForm, showContactForm, language, suggestions[] }
 *
 * Depends on: context-manager.js (ContextManager type, not imported at runtime)
 *
 * @module response-generator
 * @version 1.0.0
 * @author KAFI AI Engineering
 */

// ─────────────────────────────────────────────
// Response Templates — Bilingual
// ─────────────────────────────────────────────

/**
 * @typedef {Object} BotResponse
 * @property {string}   text             — main response text
 * @property {Array}    products         — product card objects to display
 * @property {boolean}  showForm         — whether to show lead capture form
 * @property {boolean}  showContactForm  — whether to show contact info/form
 * @property {string}   language         — response language ('english' | 'urdu')
 * @property {string[]} suggestions      — quick-reply button labels
 */

/**
 * Static templates keyed by intent × language.
 * Placeholders: {product}, {category}, {company}
 * @type {Object<string, Object<string, string[]>>}
 */
const TEMPLATES = {
  greeting: {
    english: [
      "Hello! 👋 Welcome to KAFI Group. I'm your product assistant. How can I help you today?",
      "Hi there! Welcome to KAFI Group — Pakistan's trusted food commodities exporter. What can I assist you with?",
      "Hey! 👋 Great to have you here. I can help you with our products, packaging, ordering, and more!"
    ],
    urdu: [
      "Assalam o Alaikum! 👋 KAFI Group mein khush aamdeed. Main aap ki kya madad kar sakta hoon?",
      "Salam! KAFI Group mein khush aamdeed. Aap kya janana chahenge — products, packaging, ya orders ke baare mein?",
      "Ji! 👋 KAFI Group mein aapka istiqbaal hai. Batayein, kaise madad kar sakta hoon?"
    ]
  },

  farewell: {
    english: [
      "Thank you for visiting KAFI Group! Have a wonderful day. 😊",
      "Goodbye! If you need anything else, I'm always here. Take care!",
      "Thanks for chatting! Feel free to come back anytime. 👋"
    ],
    urdu: [
      "Shukriya! KAFI Group ki taraf se aapka bohat bohat shukriya. Allah Hafiz! 😊",
      "Alvida! Agar koi aur sawal ho toh zaroor poochiyega. Khuda Hafiz!",
      "Bohat shukriya baat karne ka! Jab chaahein wapas aaiyein. 👋"
    ]
  },

  bot_identity: {
    english: [
      "I'm the KAFI Group AI Assistant! 🤖 I'm here to help you learn about our products, packaging, ordering process, and more. I'm not a human, but I'll do my best to assist you!",
      "I'm KAFI's virtual product assistant. I can tell you about our food commodities, export services, and help connect you with our team."
    ],
    urdu: [
      "Main KAFI Group ka AI Assistant hoon! 🤖 Main aapko hamare products, packaging, aur orders ke baare mein bata sakta hoon. Main insaan nahi hoon, lekin poori koshish karunga aapki madad karne ki!",
      "Main KAFI ka virtual assistant hoon. Hamare food products aur export services ke baare mein bata sakta hoon."
    ]
  },

  smalltalk: {
    english: [
      "Ha! I appreciate the curiosity, but I'm just an AI assistant for KAFI Group. 😄 I'd love to tell you about our products instead! What would you like to know?",
      "That's a fun question! But I'm here to help you with KAFI Group's products and services. Shall we talk about those?"
    ],
    urdu: [
      "Haha! Yeh toh acha sawal hai! 😄 Lekin main sirf KAFI Group ka assistant hoon. Aayein products ke baare mein baat karte hain?",
      "Mazay ka sawal hai! Lekin main aapko KAFI products ke baare mein bata sakta hoon. Kya jaanain ge?"
    ]
  },

  affirmative: {
    english: [
      "Great! How can I help you further?",
      "Wonderful! What would you like to know more about?"
    ],
    urdu: [
      "Bahtareen! Aur kya madad chahiye?",
      "Acha! Aur kya jaanana hai?"
    ]
  },

  negative: {
    english: [
      "No problem! If you change your mind or have other questions, I'm here. 😊",
      "Alright, no worries! Feel free to ask anything else about our products."
    ],
    urdu: [
      "Koi baat nahi! Jab chaahein poochh lein. 😊",
      "Theek hai! Agar koi aur sawal ho toh zaroor poochiyein."
    ]
  },

  price_inquiry: {
    english: [
      "For pricing details, our rates vary based on quantity, destination, and current market conditions. I'd recommend connecting with our sales team for an accurate quote. Would you like me to show the contact form?",
      "Pricing depends on your order volume and shipping destination. Our team can provide a customized quotation. Shall I help you get in touch?"
    ],
    urdu: [
      "Qeemat ki tafseelat ke liye, hamare rates quantity aur destination ke hisaab se hote hain. Hamare sales team se baat karna behtareen hoga. Kya contact form dikhaaun?",
      "Rates order ki quantity aur destination par depend karte hain. Hamare team se baat karein ge? Contact form dikha doon?"
    ]
  },

  order_help: {
    english: [
      "To place an order with KAFI Group:\n\n1️⃣ Browse our product range\n2️⃣ Select your products and quantities\n3️⃣ Request a quotation through our contact form\n4️⃣ Our sales team will get back to you within 24 hours\n\nWould you like to see our products or fill out the inquiry form?",
      "Ordering is easy! Tell me which products interest you, and I can help you submit an inquiry to our sales team. You can also request a custom quotation. Shall we start?"
    ],
    urdu: [
      "KAFI Group se order karna bohat aasaan hai:\n\n1️⃣ Hamare products dekhein\n2️⃣ Apni pasand ke products chunein\n3️⃣ Contact form se quotation maangein\n4️⃣ Hamari team 24 ghanton mein jawab de gi\n\nKya products dekhna chaahein ge ya inquiry form fill karein?",
      "Order karna bilkul aasaan hai! Batayein kaunsa product chahiye, main aapki madad karta hoon inquiry submit karne mein."
    ]
  },

  shipping_info: {
    english: [
      "KAFI Group exports to multiple countries worldwide! 🌍 We handle:\n\n• International shipping via sea and air freight\n• Proper export documentation and compliance\n• Custom packaging for export markets\n\nWhich country are you interested in? I can connect you with our export team for specific details.",
      "We ship internationally to markets across the Middle East, Europe, North America, and Asia. Delivery timelines depend on the destination. Would you like to speak with our export team?"
    ],
    urdu: [
      "KAFI Group duniya bhar mein export karta hai! 🌍\n\n• Sea aur air freight dono available hain\n• Export documentation hamari taraf se\n• Export markets ke liye custom packaging\n\nKaunse country mein chahiye? Hamare export team se baat karwa doon?",
      "Hum Middle East, Europe, America aur Asia mein ship karte hain. Delivery time destination par depend karta hai. Export team se baat karein ge?"
    ]
  },

  complaint: {
    english: [
      "I'm sorry to hear you're facing an issue. 😟 Your feedback is very important to us. Please share the details of your concern, and I'll connect you with our support team right away. You can also reach us directly at our contact details.",
      "We take complaints very seriously at KAFI Group. Please tell me more about the issue, and I'll make sure the right team addresses it promptly."
    ],
    urdu: [
      "Yeh sun kar afsos hua. 😟 Aapka feedback hamare liye bohat ahem hai. Apni problem ki tafseelat batayein, main aapko hamari support team se connect karta hoon.",
      "KAFI Group mein hum complaints ko bohat seriously lete hain. Problem ki tafseelat batayein, hum jald solve karein ge."
    ]
  },

  language_switch: {
    english: [
      "Sure! I'll respond in English from now on. How can I help you?",
    ],
    urdu: [
      "Bilkul! Ab se main aapko Roman Urdu mein jawab doonga. Batayein, kya madad chahiye?",
    ]
  },

  upsell_trigger: {
    english: [
      "Of course! We have a wide range of products. Would you like to explore:\n\n🍚 Rice & Grains\n🧂 Pink Himalayan Salt\n🍝 Vermicelli\n🌶️ Spices\n🧃 Juices\n🍪 Snacks\n\nWhich category interests you?",
    ],
    urdu: [
      "Zaroor! Hamare paas bohat saare products hain:\n\n🍚 Chawal\n🧂 Himalayan Namak\n🍝 Seviyan\n🌶️ Masalay\n🧃 Juices\n🍪 Snacks\n\nKaunsa category pasand karein ge?"
    ]
  },

  unknown: {
    english: [
      "I'm not sure I understood that. Could you rephrase it? 🤔 You can ask me about our products, packaging, ordering, or shipping.",
      "Hmm, I didn't quite catch that. Try asking about our products, categories, packaging details, or how to place an order!",
      "I want to help but I'm not sure what you're looking for. Here are some things I can help with:\n\n• Product information\n• Packaging details\n• How to order\n• Shipping & export\n• Contact our team"
    ],
    urdu: [
      "Maaf kijiye, main samajh nahi paaya. 🤔 Kya aap dobara bata sakte hain? Aap products, packaging, orders, ya shipping ke baare mein pooch sakte hain.",
      "Main samajhna chahta hoon lekin bilkul samajh nahi aaya. Aap yeh pooch sakte hain:\n\n• Products ki maloomat\n• Packaging details\n• Order kaise karein\n• Shipping aur export\n• Hamari team se baat karein"
    ]
  }
};

/**
 * Quick-reply suggestions keyed by intent.
 * @type {Object<string, Object<string, string[]>>}
 */
const SUGGESTIONS = {
  greeting:          { english: ['Show Products', 'Categories', 'How to Order', 'Contact Us'],
                       urdu:    ['Products Dikhao', 'Categories', 'Order Kaise Karein', 'Raabta'] },
  product_list:      { english: ['Rice', 'Salt', 'Spices', 'Vermicelli', 'Snacks', 'Juices'],
                       urdu:    ['Chawal', 'Namak', 'Masalay', 'Seviyan', 'Nimko', 'Juices'] },
  product_detail:    { english: ['Packaging Info', 'Weight Options', 'Get Quote', 'Other Products'],
                       urdu:    ['Packaging', 'Weight', 'Quote Lein', 'Aur Products'] },
  product_category:  { english: ['Show All Products', 'Product Details', 'Packaging', 'Get Quote'],
                       urdu:    ['Sab Products', 'Tafseelat', 'Packaging', 'Quote Lein'] },
  packaging_info:    { english: ['Weight Options', 'How to Order', 'Other Products'],
                       urdu:    ['Weight', 'Order Kaise', 'Aur Products'] },
  weight_inquiry:    { english: ['Packaging Info', 'Get Quote', 'How to Order'],
                       urdu:    ['Packaging', 'Quote Lein', 'Order Kaise'] },
  price_inquiry:     { english: ['Get Quote', 'Contact Sales', 'Show Products'],
                       urdu:    ['Quote Lein', 'Sales Team', 'Products Dikhao'] },
  order_help:        { english: ['Show Products', 'Get Quote', 'Contact Us'],
                       urdu:    ['Products Dikhao', 'Quote Lein', 'Raabta'] },
  shipping_info:     { english: ['Contact Export Team', 'Show Products', 'Get Quote'],
                       urdu:    ['Export Team', 'Products Dikhao', 'Quote Lein'] },
  contact_request:   { english: ['Show Products', 'How to Order', 'Shipping Info'],
                       urdu:    ['Products Dikhao', 'Order Kaise', 'Shipping'] },
  lead_capture:      { english: ['Show Products', 'Contact Us', 'Categories'],
                       urdu:    ['Products Dikhao', 'Raabta', 'Categories'] },
  complaint:         { english: ['Contact Support', 'Show Products'],
                       urdu:    ['Support', 'Products Dikhao'] },
  farewell:          { english: ['Start Over', 'Show Products'],
                       urdu:    ['Naya Sawaal', 'Products Dikhao'] },
  unknown:           { english: ['Show Products', 'Categories', 'How to Order', 'Contact Us'],
                       urdu:    ['Products Dikhao', 'Categories', 'Order Kaise', 'Raabta'] },
  upsell_trigger:    { english: ['Rice', 'Salt', 'Spices', 'Vermicelli', 'Snacks', 'Juices'],
                       urdu:    ['Chawal', 'Namak', 'Masalay', 'Seviyan', 'Nimko', 'Juices'] },
  affirmative:       { english: ['Show Products', 'Categories', 'How to Order'],
                       urdu:    ['Products Dikhao', 'Categories', 'Order Kaise'] },
  negative:          { english: ['Show Products', 'How to Order', 'Goodbye'],
                       urdu:    ['Products Dikhao', 'Order Kaise', 'Alvida'] },
  bot_identity:      { english: ['Show Products', 'How to Order', 'Contact Us'],
                       urdu:    ['Products Dikhao', 'Order Kaise', 'Raabta'] },
  smalltalk:         { english: ['Show Products', 'Categories', 'Contact Us'],
                       urdu:    ['Products Dikhao', 'Categories', 'Raabta'] },
  language_switch:   { english: ['Show Products', 'Categories', 'How to Order'],
                       urdu:    ['Products Dikhao', 'Categories', 'Order Kaise'] }
};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Generates a structured chatbot response based on the classified intent,
 * extracted entities, conversation context, and product knowledge base.
 *
 * @param {string} intent — classified intent name
 * @param {Object} entities — extracted entities (product, category, weights, etc.)
 * @param {Object} context — conversation state from ContextManager.getContext()
 * @param {Object} knowledgeBase — product data { products: [...], categories: [...] }
 * @returns {BotResponse}
 *
 * @example
 * const response = generateResponse('product_list', {}, context, kb);
 * // => { text: "Here are our products: ...", products: [...], ... }
 */
export function generateResponse(intent, entities = {}, context = {}, knowledgeBase = {}) {
  const lang     = context.language || 'english';
  const products = knowledgeBase.products || [];

  // Build base response
  /** @type {BotResponse} */
  let response = {
    text:            '',
    products:        [],
    showForm:        false,
    showContactForm: false,
    language:        lang,
    suggestions:     []
  };

  // ── Route to intent-specific handler ──
  switch (intent) {

    case 'product_list':
      response = handleProductList(products, lang, response);
      break;

    case 'product_detail':
      response = handleProductDetail(entities, products, context, lang, response);
      break;

    case 'product_category':
      response = handleProductCategory(entities, products, lang, response);
      break;

    case 'packaging_info':
      response = handlePackagingInfo(entities, products, context, lang, response);
      break;

    case 'weight_inquiry':
      response = handleWeightInquiry(entities, products, context, lang, response);
      break;

    case 'contact_request':
      response = handleContactRequest(context, lang, response);
      break;

    case 'lead_capture':
      response = handleLeadCapture(context, lang, response);
      break;

    case 'language_switch':
      response = handleLanguageSwitch(entities, response);
      break;

    default:
      // Use template-based response for all other intents
      response = handleTemplateIntent(intent, lang, response);
      break;
  }

  // ── Attach suggestions ──
  const intentSuggestions = SUGGESTIONS[intent] || SUGGESTIONS.unknown;
  response.suggestions = intentSuggestions[lang] || intentSuggestions.english || [];

  return response;
}

// ─────────────────────────────────────────────
// Intent Handlers
// ─────────────────────────────────────────────

/**
 * Helper to strip size and packaging details from product names.
 * Splits on em-dash '—' and returns the main product name.
 */
function cleanProductName(name) {
  if (typeof name !== 'string') return '';
  return name.split('—')[0].trim();
}

/**
 * Handles product_list intent — returns ONLY product names (no descriptions).
 */
function handleProductList(products, lang, response) {
  if (products.length === 0) {
    response.text = lang === 'urdu'
      ? 'Maaf kijiye, abhi product list available nahi hai.'
      : "I'm sorry, the product catalogue is currently unavailable.";
    return response;
  }

  const cleanNames = [...new Set(products.map(p => cleanProductName(p.name)).filter(Boolean))];
  const nameList = cleanNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

  response.text = lang === 'urdu'
    ? `Yeh hain hamare products:\n\n${nameList}\n\nKisi product ki tafseelat jaanein? Bas naam batayein!`
    : `Here are our products:\n\n${nameList}\n\nWant details on any product? Just tell me the name!`;

  // General lists should not return individual cards to avoid showing 30+ link cards in UI.
  // Instead, the user is offered category suggestions to narrow down their search.
  response.products = [];

  return response;
}

/**
 * Handles product_detail intent — returns description for the specific product.
 */
function handleProductDetail(entities, products, context, lang, response) {
  const productName = entities.product || context.currentProduct;

  if (!productName) {
    response.text = lang === 'urdu'
      ? 'Kaunse product ke baare mein jaanana hai? Product ka naam batayein.'
      : 'Which product would you like to know about? Please tell me the product name.';
    return response;
  }

  const product = findProduct(productName, products);

  if (!product) {
    response.text = lang === 'urdu'
      ? `Maaf kijiye, "${productName}" hamare catalogue mein nahi mila. Kya aap doosra naam try karein ge?`
      : `Sorry, I couldn't find "${productName}" in our catalogue. Could you try a different name?`;
    return response;
  }

  // Return ONLY description for product_detail
  const desc = product.description || product.details || 'No detailed description available.';
  response.text = lang === 'urdu'
    ? `📦 **${product.name}**\n\n${desc}\n\nAur kya jaanana hai is product ke baare mein?`
    : `📦 **${product.name}**\n\n${desc}\n\nWould you like to know more about this product?`;

  response.products = [product];
  return response;
}

/**
 * Handles product_category intent — filters products by category.
 */
function handleProductCategory(entities, products, lang, response) {
  const category = entities.category;

  if (!category) {
    response.text = lang === 'urdu'
      ? 'Kaunsi category dekhna chahein ge? (Chawal, Namak, Masalay, Seviyan, Snacks, Juices)'
      : 'Which category would you like to explore? (Rice, Salt, Spices, Vermicelli, Snacks, Juices)';
    return response;
  }

  const filtered = products.filter(p => {
    const pCat = (p.category || '').toLowerCase();
    return pCat === category.toLowerCase() ||
           pCat.includes(category.toLowerCase()) ||
           (p.name || '').toLowerCase().includes(category.toLowerCase());
  });

  if (filtered.length === 0) {
    response.text = lang === 'urdu'
      ? `"${category}" category mein abhi koi product nahi hai. Doosri category try karein?`
      : `No products found in the "${category}" category. Would you like to try another category?`;
    return response;
  }

  const cleanFilteredNames = [...new Set(filtered.map(p => cleanProductName(p.name)).filter(Boolean))];
  const nameList = cleanFilteredNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

  response.text = lang === 'urdu'
    ? `"${capitalize(category)}" category ke products:\n\n${nameList}\n\nKisi product ki tafseelat chahiye?`
    : `Products in the "${capitalize(category)}" category:\n\n${nameList}\n\nWant details on any of these?`;

  const seen = new Set();
  response.products = [];
  for (const p of filtered) {
    const cleanN = cleanProductName(p.name);
    if (!seen.has(cleanN)) {
      seen.add(cleanN);
      response.products.push({
        name: cleanN,
        category: p.category || '',
        image: p.image || p.imageUrl || '',
        url: p.url || p.productUrl || ''
      });
    }
  }
  return response;
}

/**
 * Handles packaging_info intent — returns ONLY packaging details.
 */
function handlePackagingInfo(entities, products, context, lang, response) {
  const productName = entities.product || context.currentProduct;

  if (!productName) {
    response.text = lang === 'urdu'
      ? 'Kaunse product ki packaging jaanani hai? Product ka naam batayein.'
      : 'Which product\'s packaging details would you like? Please specify the product name.';
    return response;
  }

  const product = findProduct(productName, products);

  if (!product) {
    response.text = lang === 'urdu'
      ? `"${productName}" nahi mila. Doosra naam try karein?`
      : `Couldn't find "${productName}". Could you try another name?`;
    return response;
  }

  const packaging = product.packaging || product.packagingDetails || product.pack_info;

  if (packaging) {
    response.text = lang === 'urdu'
      ? `📦 **${product.name} — Packaging:**\n\n${packaging}`
      : `📦 **${product.name} — Packaging Details:**\n\n${packaging}`;
  } else {
    response.text = lang === 'urdu'
      ? `${product.name} ki packaging details hamare team se confirm karein. Raabta karain?`
      : `Specific packaging details for ${product.name} can be confirmed by our team. Would you like to contact them?`;
  }

  response.products = [product];
  return response;
}

/**
 * Handles weight_inquiry intent — returns ONLY weight options.
 */
function handleWeightInquiry(entities, products, context, lang, response) {
  const productName = entities.product || context.currentProduct;

  if (!productName) {
    response.text = lang === 'urdu'
      ? 'Kaunse product ka weight jaanana hai? Product ka naam batayein.'
      : 'Which product\'s weight options would you like to know? Please specify the product name.';
    return response;
  }

  const product = findProduct(productName, products);

  if (!product) {
    response.text = lang === 'urdu'
      ? `"${productName}" nahi mila. Doosra naam try karein?`
      : `Couldn't find "${productName}". Could you try another name?`;
    return response;
  }

  const weights = product.weights || product.weight || product.sizes || product.available_weights;

  if (weights) {
    const weightStr = Array.isArray(weights) ? weights.join(', ') : weights;
    response.text = lang === 'urdu'
      ? `⚖️ **${product.name} — Weight Options:**\n\n${weightStr}`
      : `⚖️ **${product.name} — Available Weights:**\n\n${weightStr}`;
  } else {
    response.text = lang === 'urdu'
      ? `${product.name} ke weight options hamare team se confirm karein. Raabta karain?`
      : `Weight options for ${product.name} can be confirmed by our team. Would you like to contact them?`;
  }

  response.products = [product];
  return response;
}

/**
 * Handles contact_request intent — shows contact form ONCE then continues normally.
 */
function handleContactRequest(context, lang, response) {
  // The caller (chat controller) should check context.shouldShowForm()
  // Here we set the flag — the context manager guards against re-display
  const canShowForm = !context.leadCaptured &&
    (context.formShownOnTurn === null ||
     (context.turnCount - context.formShownOnTurn) >= 5);

  if (canShowForm) {
    response.showContactForm = true;
    response.text = lang === 'urdu'
      ? "Zaroor! Neeche apni details dein, hamari team jald aap se raabta karegi. 📋"
      : "Of course! Please fill in your details below and our team will get back to you shortly. 📋";
  } else {
    // Form already shown recently — just provide contact info
    response.text = lang === 'urdu'
      ? "Aapki request pehle se mil chuki hai! Hamari team jald raabta karegi. Aap humen directly bhi contact kar sakte hain. Kya kuch aur madad chahiye?"
      : "Your request has already been noted! Our team will reach out soon. You can also contact us directly. Is there anything else I can help with?";
  }

  return response;
}

/**
 * Handles lead_capture intent — similar to contact but focused on quotation.
 */
function handleLeadCapture(context, lang, response) {
  const canShowForm = !context.leadCaptured &&
    (context.formShownOnTurn === null ||
     (context.turnCount - context.formShownOnTurn) >= 5);

  if (canShowForm) {
    response.showForm = true;
    response.text = lang === 'urdu'
      ? "Bohat acha! Aapki dilchaspi ka shukriya! 🎉 Neeche apni details dein, hum aapko quotation bhej dein ge."
      : "Wonderful! Thank you for your interest! 🎉 Please fill in the form below and we'll send you a detailed quotation.";
  } else {
    response.text = lang === 'urdu'
      ? "Aapki inquiry pehle se record ho chuki hai! Hamari team jald quotation bhejegi. Kya kuch aur help chahiye?"
      : "Your inquiry has been recorded! Our team will send the quotation shortly. Is there anything else you'd like to know?";
  }

  return response;
}

/**
 * Handles language_switch intent.
 */
function handleLanguageSwitch(entities, response) {
  const newLang = entities.requestedLanguage || 'english';
  response.language = newLang;

  const templates = TEMPLATES.language_switch[newLang] || TEMPLATES.language_switch.english;
  response.text = pickRandom(templates);

  return response;
}

/**
 * Handles any intent that uses template-based responses (greeting, farewell,
 * bot_identity, smalltalk, affirmative, negative, complaint, etc.)
 */
function handleTemplateIntent(intent, lang, response) {
  const templates = TEMPLATES[intent];

  if (!templates) {
    // Truly unknown — use fallback
    const fallback = TEMPLATES.unknown[lang] || TEMPLATES.unknown.english;
    response.text = pickRandom(fallback);
    return response;
  }

  const langTemplates = templates[lang] || templates.english;
  response.text = pickRandom(langTemplates);

  return response;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Finds a product by name (case-insensitive, partial match).
 * @param {string} name
 * @param {Array} products
 * @returns {Object|null}
 */
function findProduct(name, products) {
  if (!name || !Array.isArray(products)) return null;

  const lower = name.toLowerCase();

  // Exact match first
  let found = products.find(p => (p.name || '').toLowerCase() === lower);
  if (found) return found;

  // Partial / contains match
  found = products.find(p => (p.name || '').toLowerCase().includes(lower));
  if (found) return found;

  // Reverse: input contains product name
  found = products.find(p => lower.includes((p.name || '').toLowerCase()));
  return found || null;
}

/**
 * Picks a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (typeof str !== 'string' || str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Class wrapper for Response Generator to integrate with ChatApp UI.
 */
export class ResponseGenerator {
  /**
   * @param {Array} [productCatalog=[]] — list of products from knowledge base
   */
  constructor(productCatalog = []) {
    this.productCatalog = productCatalog;
  }

  /**
   * Generates a response matching the signature expected by index.html.
   * 
   * @param {Object|string} intentResult — intent result object or string
   * @param {string} text — raw user message
   * @param {string} language — current language ('en' | 'ur')
   * @param {Object} context — conversation context
   * @returns {BotResponse}
   */
  generate(intentResult, text, language, context) {
    const intentName = typeof intentResult === 'string' ? intentResult : intentResult.intent;
    const entities = (intentResult && intentResult.entities) ? intentResult.entities : {};
    
    // Set language in context
    context.language = language === 'ur' ? 'urdu' : 'english';
    context.products = this.productCatalog;

    const kb = { products: this.productCatalog };

    // Self-learning override: direct response match
    if (entities.customResponse) {
      const lang = context.language;
      const intentSuggestions = SUGGESTIONS[intentName] || SUGGESTIONS.unknown;
      return {
        text: entities.customResponse,
        products: [],
        showForm: false,
        showContactForm: false,
        language: lang,
        suggestions: intentSuggestions[lang] || intentSuggestions.english || []
      };
    }

    return generateResponse(intentName, entities, context, kb);
  }
}

export default ResponseGenerator;

