/**
 * @fileoverview Admin Dashboard Training Module — KAFI AI Agent
 * 
 * Renders unrecognized inputs training controls, custom Q&A managers,
 * and product CRUD editor components.
 * 
 * Zero dependencies — vanilla ES module.
 */

// Supported intents list for selection dropdown
const INTENTS_LIST = [
  { id: 'greeting', name: 'Greeting (Salam / Hello)' },
  { id: 'product_list', name: 'Product List (Show All Products)' },
  { id: 'product_detail', name: 'Product Details' },
  { id: 'product_category', name: 'Product Category Query' },
  { id: 'packaging_info', name: 'Packaging Specifications' },
  { id: 'weight_inquiry', name: 'Weight / Sizes Inquiry' },
  { id: 'price_inquiry', name: 'Price & Quotation Inquiry' },
  { id: 'order_help', name: 'How to Order Instructions' },
  { id: 'shipping_info', name: 'Shipping & Export Markets' },
  { id: 'contact_request', name: 'Contact Human / Request Form' },
  { id: 'whatsapp_request', name: 'WhatsApp Redirection' },
  { id: 'lead_capture', name: 'Interested Buyer / Lead Form' },
  { id: 'language_switch', name: 'Language Switching' },
  { id: 'bot_identity', name: 'Bot Identity / Personality' },
  { id: 'smalltalk', name: 'Smalltalk (Age, Marital status)' },
  { id: 'farewell', name: 'Farewell (Goodbye / Thanks)' },
  { id: 'complaint', name: 'Complaint / Issue Logging' }
];

/**
 * Renders the unrecognized inputs list.
 * Allows tagging unrecognized inputs with correct intents.
 */
export function renderUnrecognizedInputs(container, inputs, onTeach) {
  if (!container) return;

  if (!inputs || inputs.length === 0) {
    container.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty-icon" style="font-size: 32px; margin-bottom: 8px;">🎓</div>
        <div class="admin-empty-title" style="font-size: 14px; font-weight: 600; color: #e5e7eb;">All queries recognized!</div>
        <div class="admin-empty-text" style="font-size: 12px; color: #9ca3af; margin-top: 4px;">The chatbot understood everything users asked so far.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  inputs.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'training-item';
    card.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #2d2d2d;
      gap: 12px;
    `;
    card.innerHTML = `
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; font-size: 13px; color: #f3f4f6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          "${escapeHtml(item.text)}"
        </div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
          Failed at ${new Date(item.timestamp || Date.now()).toLocaleDateString()}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="admin-badge admin-badge--warning" style="font-size: 10px;">${item.count || 1}×</span>
        <button class="admin-btn admin-btn--gold admin-btn--sm" id="teach-btn-${idx}" type="button" style="padding: 4px 10px; font-size: 12px;">
          Teach
        </button>
      </div>
    `;

    container.appendChild(card);

    // Bind Teach button click
    card.querySelector(`#teach-btn-${idx}`).addEventListener('click', () => {
      showTeachModal(item, onTeach);
    });
  });
}

/**
 * Renders the Custom Q&A addition form.
 */
export function renderCustomQA(container, onAdd) {
  if (!container) return;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="admin-form-group">
        <label class="admin-label">User Query / Match Pattern</label>
        <input class="admin-input" id="qaPattern" type="text" placeholder='e.g. "Do you sell masalas?"' style="width: 100%;">
      </div>
      <div class="admin-form-group">
        <label class="admin-label">Custom Response Text</label>
        <textarea class="admin-textarea" id="qaResponse" rows="4" placeholder="The response the bot should give..." style="width: 100%; resize: vertical;"></textarea>
      </div>
      <div class="admin-form-group">
        <label class="admin-label">Map to Intent Category</label>
        <select class="admin-select" id="qaIntent" style="width: 100%;">
          ${INTENTS_LIST.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
        </select>
      </div>
      <button class="admin-btn admin-btn--primary" id="addQABtn" type="button" style="align-self: flex-start;">
        Add Q&A Override
      </button>
    </div>
  `;

  // Bind Submit
  container.querySelector('#addQABtn').addEventListener('click', () => {
    const pattern = container.querySelector('#qaPattern').value.trim();
    const response = container.querySelector('#qaResponse').value.trim();
    const intent = container.querySelector('#qaIntent').value;

    if (!pattern || !response) {
      alert('Please fill out both the pattern and the response.');
      return;
    }

    onAdd(pattern, response, intent);

    // Clear form
    container.querySelector('#qaPattern').value = '';
    container.querySelector('#qaResponse').value = '';

    // Show toast if window.adminPanel has it
    if (window.adminPanel && typeof window.adminPanel.showToast === 'function') {
      window.adminPanel.showToast('Custom Q&A Override added successfully!', 'success');
      window.adminPanel.loadTraining(); // Reload training tab to update unrecognized list
    } else {
      alert('Custom Q&A override added!');
    }
  });
}

/**
 * Renders the products list editor interface.
 */
export function renderProductEditor(container, products, onSave, onDelete) {
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="admin-empty" style="grid-column: 1/-1; padding: 48px; text-align: center;">
        <div class="admin-empty-icon" style="font-size: 40px;">📦</div>
        <div class="admin-empty-title" style="font-weight: 600; color: #e5e7eb; margin-top: 12px;">No products in database</div>
        <div class="admin-empty-text" style="color: #9ca3af; margin-top: 4px; font-size: 13px;">Add products to build the chatbot knowledge base.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map((p, idx) => {
    const imgHtml = p.imageUrl || p.image 
      ? `<img src="${escapeHtml(p.imageUrl || p.image)}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100%; object-fit: cover;">`
      : `<span style="font-size: 24px;">📦</span>`;

    return `
      <div class="product-editor-card" style="background-color: #242424; border: 1px solid #333; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
        <div class="product-editor-image" style="height: 120px; background-color: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden; border-bottom: 1px solid #333;">
          ${imgHtml}
        </div>
        <div class="product-editor-body" style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
          <span class="product-editor-category" style="font-size: 11px; text-transform: uppercase; color: #c5992e; font-weight: 600;">
            ${escapeHtml(p.category || 'Other')}
          </span>
          <div class="product-editor-name" style="font-weight: 600; color: #f3f4f6; margin-top: 4px; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(p.name)}
          </div>
          <div class="product-editor-desc" style="font-size: 12px; color: #9ca3af; margin-top: 6px; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(p.desc || p.description || 'No description provided')}
          </div>
          <div class="product-editor-actions" style="display: flex; gap: 8px; margin-top: 16px;">
            <button class="admin-btn admin-btn--ghost admin-btn--sm" onclick="window.adminPanel.editProduct(${idx})" type="button" style="flex: 1; font-size: 11px;">
              Edit
            </button>
            <button class="admin-btn admin-btn--danger admin-btn--sm" onclick="window.adminPanel.deleteProduct(${idx})" type="button" style="flex: 1; font-size: 11px;">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Display modal window to tag unrecognized input with correct intent.
 * @private
 */
function showTeachModal(item, onTeach) {
  const overlay = document.createElement('div');
  overlay.className = 'teach-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000;
  `;

  overlay.innerHTML = `
    <div class="teach-modal" style="background-color: #242424; padding: 24px; border-radius: 12px; border: 1px solid #333; max-width: 450px; width: 90%; color: #e5e7eb; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
      <div class="teach-modal-title" style="font-family: Montserrat, sans-serif; font-weight: 700; font-size: 16px; color: #f3f4f6; margin-bottom: 16px;">Teach Chatbot</div>
      <div style="font-size: 13px; color: #9ca3af; margin-bottom: 8px;">User asked:</div>
      <div style="background-color: #1a1a1a; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #f3f4f6; margin-bottom: 20px; border-left: 3px solid #c5992e; word-break: break-all;">
        "${escapeHtml(item.text)}"
      </div>
      
      <div class="admin-form-group" style="margin-bottom: 24px;">
        <label class="admin-label">Assign Correct Intent Category</label>
        <select class="admin-select" id="teachIntentSelect" style="width: 100%;">
          ${INTENTS_LIST.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
        </select>
      </div>
      
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="admin-btn admin-btn--ghost" id="teachCancelBtn" type="button">Cancel</button>
        <button class="admin-btn admin-btn--gold" id="teachSaveBtn" type="button">Train Intent</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#teachCancelBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#teachSaveBtn').addEventListener('click', () => {
    const intent = overlay.querySelector('#teachIntentSelect').value;
    onTeach(item, intent);
    overlay.remove();
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
