/**
 * @fileoverview AI Sourcing & Procurement Agent — KAFI Group
 *
 * Priority #1: Suppliers (mills, packaging, raw materials, OEM)
 * Priority #2: Buyers (importers, distributors, retailers)
 *
 * Data sources:
 *   - LinkedIn Connections.csv (official export — primary)
 *   - Web discovery (via server /api/search + /api/scrape)
 *   - Optional enrichment (Apollo, Hunter — via server)
 *
 * @module sourcing-agent
 */

export const STORAGE_KEY = 'kafi_sourcing_leads';

// ── KAFI product keywords for relevance scoring ───────────────
const PRODUCT_KW = {
  rice: ['rice', 'basmati', 'grain', 'chawal', 'parboiled', 'sella'],
  salt: ['salt', 'himalayan', 'pink salt', 'khewra'],
  spices: ['spice', 'masala', 'turmeric', 'chili', 'cumin', 'condiment'],
  vermicelli: ['vermicelli', 'seviyan', 'noodle', 'pasta'],
  food: ['food', 'grocery', 'fmcg', 'commodit', 'agro', 'agri', 'halal'],
  packaging: ['packaging', 'pack', 'pouch', 'carton', 'label', 'private label', 'oem'],
};

const SUPPLIER_KW = [
  'manufacturer', 'producer', 'mill', 'milling', 'factory', 'supplier', 'packaging',
  'oem', 'private label', 'wholesale supplier', 'raw material', 'processing plant',
  'exporter', 'trading company', 'commodities', 'agro', 'agricultural', 'packer',
  'semolina', 'flour mill', 'spice factory', 'rice mill', 'salt mine', 'vendor',
  'sourcing', 'procurement manager', 'purchase manager', 'supply chain',
];

const BUYER_KW = [
  'importer', 'import', 'distributor', 'distribution', 'wholesaler', 'wholesale',
  'buyer', 'retailer', 'supermarket', 'grocery', 'horeca', 'catering', 'food service',
  'trading house', 'commodity trader', 'procurement', 'purchasing', 'sourcing head',
  'category manager', 'buying manager', 'import manager',
];

const EXEC_TITLES = [
  'ceo', 'chief executive', 'director', 'managing director', 'md', 'owner', 'founder',
  'president', 'chairman', 'partner', 'general manager', 'gm', 'vp', 'vice president',
  'head of procurement', 'procurement manager', 'purchasing manager', 'sourcing manager',
  'import manager', 'supply chain manager', 'operations director',
];

const REGIONS = {
  'middle east': ['uae', 'dubai', 'abu dhabi', 'saudi', 'riyadh', 'jeddah', 'qatar', 'kuwait', 'bahrain', 'oman', 'jordan', 'lebanon', 'iraq'],
  europe: ['uk', 'london', 'germany', 'france', 'netherlands', 'italy', 'spain', 'belgium', 'sweden', 'poland'],
  'north america': ['usa', 'united states', 'canada', 'mexico', 'new york', 'california', 'texas'],
  'asia pacific': ['china', 'india', 'malaysia', 'singapore', 'indonesia', 'thailand', 'australia', 'japan', 'korea', 'vietnam', 'philippines'],
  africa: ['south africa', 'nigeria', 'kenya', 'egypt', 'ghana', 'morocco', 'ethiopia'],
  pakistan: ['pakistan', 'karachi', 'lahore', 'islamabad', 'gujranwala', 'faisalabad', 'hyderabad', 'multan'],
};

// ═══════════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════════

export function loadLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLeads(leads) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

export function clearLeads() {
  localStorage.removeItem(STORAGE_KEY);
}

// ═══════════════════════════════════════════════════════════════
//  CSV / LINKEDIN IMPORT
// ═══════════════════════════════════════════════════════════════

/** Parse generic CSV (handles quoted fields). */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
  if (!rows.length) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ' '));
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

/** Normalize LinkedIn Connections.csv column names. */
function normalizeLinkedInRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()];
      if (v) return String(v).trim();
    }
    return '';
  };
  return {
    firstName: get('First Name', 'first name', 'firstname'),
    lastName: get('Last Name', 'last name', 'lastname'),
    email: get('Email Address', 'email address', 'email', 'e-mail'),
    company: get('Company', 'company', 'organization'),
    position: get('Position', 'position', 'title', 'job title'),
    connectedOn: get('Connected On', 'connected on', 'connected'),
    url: get('URL', 'url', 'profile url', 'linkedin url'),
  };
}

export function linkedInRowsToLeads(rows, sourceLabel = 'LinkedIn') {
  const leads = [];
  for (const raw of rows) {
    const r = normalizeLinkedInRow(raw);
    if (!r.firstName && !r.lastName && !r.company) continue;
    const name = `${r.firstName} ${r.lastName}`.trim();
    const analysis = analyzeLead(r.position, r.company, name);
    leads.push({
      id: makeLeadId(name, r.company),
      source: sourceLabel,
      name,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email || '',
      company: r.company,
      position: r.position,
      connectedOn: r.connectedOn,
      linkedInUrl: r.url || '',
      roleType: analysis.roleType,
      isExecutive: analysis.isExecutive,
      productMatch: analysis.productMatch,
      region: analysis.region,
      score: analysis.score,
      status: 'new',
      enriched: false,
      notes: '',
      importedAt: new Date().toISOString(),
    });
  }
  return leads;
}

export function makeLeadId(name, company) {
  const slug = `${name}|${company}`.toLowerCase().replace(/[^a-z0-9|]+/g, '');
  return 'lead-' + slug.slice(0, 80);
}

// ═══════════════════════════════════════════════════════════════
//  CLASSIFICATION & SCORING
// ═══════════════════════════════════════════════════════════════

export function analyzeLead(position = '', company = '', name = '') {
  const text = `${position} ${company} ${name}`.toLowerCase();

  let supplierScore = SUPPLIER_KW.filter(k => text.includes(k)).length;
  let buyerScore = BUYER_KW.filter(k => text.includes(k)).length;

  let roleType = 'unknown';
  if (supplierScore > buyerScore && supplierScore >= 1) roleType = 'supplier';
  else if (buyerScore > supplierScore && buyerScore >= 1) roleType = 'buyer';
  else if (supplierScore === buyerScore && supplierScore > 0) roleType = 'both';

  const isExecutive = EXEC_TITLES.some(t => text.includes(t));

  const productMatch = [];
  for (const [cat, kws] of Object.entries(PRODUCT_KW)) {
    if (kws.some(k => text.includes(k))) productMatch.push(cat);
  }

  let region = '';
  for (const [reg, kws] of Object.entries(REGIONS)) {
    if (kws.some(k => text.includes(k))) { region = reg; break; }
  }

  let score = 30;
  if (roleType === 'supplier') score += 25;
  if (roleType === 'buyer') score += 20;
  if (roleType === 'both') score += 30;
  if (isExecutive) score += 20;
  score += Math.min(productMatch.length * 8, 24);
  if (region) score += 5;
  score = Math.min(100, score);

  return { roleType, isExecutive, productMatch, region, score };
}

/** Merge new leads into existing, dedupe by id. */
export function mergeLeads(existing, incoming) {
  const map = new Map(existing.map(l => [l.id, l]));
  let added = 0, updated = 0;
  for (const lead of incoming) {
    if (map.has(lead.id)) {
      const old = map.get(lead.id);
      map.set(lead.id, { ...old, ...lead, email: lead.email || old.email, importedAt: old.importedAt });
      updated++;
    } else {
      map.set(lead.id, lead);
      added++;
    }
  }
  return { leads: [...map.values()], added, updated };
}

// ═══════════════════════════════════════════════════════════════
//  FILTERING
// ═══════════════════════════════════════════════════════════════

export function filterLeads(leads, filters = {}) {
  return leads.filter(l => {
    if (filters.roleType && filters.roleType !== 'all' && l.roleType !== filters.roleType) return false;
    if (filters.executiveOnly && !l.isExecutive) return false;
    if (filters.hasEmail && !l.email) return false;
    if (filters.minScore && l.score < filters.minScore) return false;
    if (filters.region && filters.region !== 'all' && l.region !== filters.region) return false;
    if (filters.product && filters.product !== 'all') {
      if (!l.productMatch?.includes(filters.product)) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const blob = `${l.name} ${l.company} ${l.position} ${l.email}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (filters.source && filters.source !== 'all' && l.source !== filters.source) return false;
    return true;
  });
}

export function leadStats(leads) {
  return {
    total: leads.length,
    suppliers: leads.filter(l => l.roleType === 'supplier' || l.roleType === 'both').length,
    buyers: leads.filter(l => l.roleType === 'buyer' || l.roleType === 'both').length,
    executives: leads.filter(l => l.isExecutive).length,
    withEmail: leads.filter(l => l.email).length,
    highPriority: leads.filter(l => l.score >= 70).length,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════

export function exportLeadsCSV(leads) {
  const headers = ['Name', 'Email', 'Company', 'Position', 'Role Type', 'Executive', 'Score', 'Region', 'Products', 'Source', 'Connected On', 'Status', 'Notes'];
  const rows = leads.map(l => [
    l.name, l.email, l.company, l.position, l.roleType,
    l.isExecutive ? 'Yes' : 'No', l.score, l.region,
    (l.productMatch || []).join('; '), l.source, l.connectedOn || '', l.status, l.notes || '',
  ]);
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

export function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════════════
//  WEB DISCOVERY → LEADS
// ═══════════════════════════════════════════════════════════════

export function searchResultToLead(item, intent = 'supplier') {
  const title = item.title || '';
  const snippet = item.snippet || '';
  const analysis = analyzeLead(snippet, title);
  const roleType = item.companyType === 'potential_client' ? 'buyer'
    : item.companyType === 'competitor' ? 'competitor'
    : intent === 'buyer' ? 'buyer' : analysis.roleType;

  return {
    id: makeLeadId(title.slice(0, 40), item.domain || item.url),
    source: 'web',
    name: title.split(' - ')[0].split(' | ')[0].trim().slice(0, 80),
    firstName: '',
    lastName: '',
    email: '',
    company: title.slice(0, 100),
    position: '',
    companyUrl: item.url || '',
    domain: item.domain || '',
    country: item.country || '',
    continent: item.continent || '',
    roleType,
    isExecutive: false,
    productMatch: analysis.productMatch,
    region: item.continent?.toLowerCase() || analysis.region,
    score: Math.max(analysis.score, roleType === 'supplier' ? 45 : 40),
    status: 'discovered',
    enriched: false,
    notes: snippet.slice(0, 200),
    importedAt: new Date().toISOString(),
  };
}

export const OUTREACH_SYSTEM = `You are the KAFI Group Sourcing & Procurement outreach assistant.
KAFI (Kafi Commodities Pvt. Ltd., est. 1982, Karachi) exports Basmati rice, Himalayan pink salt, spices, vermicelli and desserts (brand "Essence"). We also operate a factory for bulk purchase, private labeling, OEM and custom packaging.

Write short, professional B2B emails (under 180 words). Be specific to the recipient's company and role. No hype. Include a clear call-to-action. Sign off as KAFI Group exports team with exports@kafi-group.com and +92-300-8206633.`;
