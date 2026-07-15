/**
 * Bridge Sourcing leads → Agent 1 Sales CRM (kafi_buyers).
 * Keeps Supply Chain / Finance untouched — sales buyer pipeline only.
 */
import { loadLeads, saveLeads, STORAGE_KEY as SOURCING_KEY } from './sourcing-agent.js';

export const BUYERS_KEY = 'kafi_buyers';

export function loadBuyers() {
  try {
    return JSON.parse(localStorage.getItem(BUYERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveBuyers(buyers) {
  localStorage.setItem(BUYERS_KEY, JSON.stringify(buyers));
}

/** Map sourcing score (0–100) + context → HOT / WARM / COLD */
export function scoreToLeadScore(score = 0, roleType = '', isExecutive = false) {
  let tier = 'COLD';
  if (score >= 70) tier = 'HOT';
  else if (score >= 50) tier = 'WARM';

  if (isExecutive && tier === 'WARM') tier = 'HOT';
  if (isExecutive && tier === 'COLD' && score >= 40) tier = 'WARM';
  if (roleType === 'buyer' && score >= 65 && tier === 'WARM') tier = 'HOT';

  return tier;
}

function regionToNationality(region = '', country = '') {
  if (country) return country;
  if (!region) return 'Unknown';
  const map = {
    'middle east': 'Middle East',
    europe: 'Europe',
    'north america': 'North America',
    'asia pacific': 'Asia Pacific',
    africa: 'Africa',
    pakistan: 'Pakistan',
  };
  return map[region.toLowerCase()] || region;
}

function productLabel(match = []) {
  if (!match?.length) return 'Food commodities';
  return match.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
}

function buyerKey(b) {
  const email = (b.email || '').toLowerCase().trim();
  if (email) return `email:${email}`;
  const name = (b.buyerName || b.name || '').toLowerCase().trim();
  const company = (b.company || '').toLowerCase().trim();
  return `nc:${name}|${company}`;
}

/** Convert one sourcing lead → Agent 1 buyer profile */
export function sourcingLeadToBuyer(lead) {
  const leadScore = scoreToLeadScore(lead.score, lead.roleType, lead.isExecutive);
  return {
    id: lead.id,
    sourcingId: lead.id,
    buyerName: lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
    company: lead.company || 'Unknown Company',
    designation: lead.position || 'Contact',
    nationality: regionToNationality(lead.region, lead.country),
    dob: null,
    productHandling: productLabel(lead.productMatch),
    promotions: null,
    leadScore,
    rationale: `From Sourcing (${lead.source || 'import'}). Relevance ${lead.score}/100 · ${lead.roleType || 'unknown'}${lead.isExecutive ? ' · executive' : ''}.`,
    email: lead.email || '',
    linkedInUrl: lead.linkedInUrl || '',
    phone: lead.phones?.[0] || '',
    sourceChannel: 'sourcing',
    sourcingScore: lead.score,
    roleType: lead.roleType,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Sync sourcing leads into Agent 1 CRM.
 * @param {Object} opts
 * @param {string[]} [opts.roles=['buyer','both']] — which role types to import
 * @param {number} [opts.minScore=0]
 * @param {string[]} [opts.ids] — if set, only these sourcing lead ids
 * @param {boolean} [opts.markSourcing=true] — set sourcing status to sales-synced
 */
export function syncSourcingToSales(opts = {}) {
  const roles = opts.roles || ['buyer', 'both'];
  const minScore = opts.minScore ?? 0;
  const ids = opts.ids?.length ? new Set(opts.ids) : null;
  const markSourcing = opts.markSourcing !== false;

  const sourcing = loadLeads();
  let pool = sourcing.filter(l => roles.includes(l.roleType) && (l.score ?? 0) >= minScore);
  if (ids) pool = pool.filter(l => ids.has(l.id));

  const buyers = loadBuyers();
  const index = new Map(buyers.map((b, i) => [buyerKey(b), i]));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const lead of pool) {
    const buyer = sourcingLeadToBuyer(lead);
    const key = buyerKey(buyer);

    if (index.has(key)) {
      const i = index.get(key);
      const prev = buyers[i];
      buyers[i] = {
        ...prev,
        ...buyer,
        dob: prev.dob || buyer.dob,
        promotions: prev.promotions || buyer.promotions,
        rationale: prev.rationale?.includes('From Sourcing') ? buyer.rationale : `${buyer.rationale} (updated)`,
        syncedAt: buyer.syncedAt,
      };
      updated++;
    } else {
      buyers.push(buyer);
      index.set(key, buyers.length - 1);
      added++;
    }

    if (markSourcing) {
      const s = sourcing.find(x => x.id === lead.id);
      if (s) {
        s.status = 'sales-synced';
        s.salesLeadScore = buyer.leadScore;
      }
    }
  }

  skipped = sourcing.filter(l => roles.includes(l.roleType) && !pool.find(p => p.id === l.id)).length;

  saveBuyers(buyers);
  if (markSourcing) saveLeads(sourcing);

  return { added, updated, skipped, total: pool.length, buyers: buyers.length };
}

/** Count sourcing leads not yet in sales CRM */
export function countPendingSourcingBuyers(minScore = 0) {
  const sourcing = loadLeads().filter(l =>
    (l.roleType === 'buyer' || l.roleType === 'both') &&
    (l.score ?? 0) >= minScore &&
    l.status !== 'sales-synced'
  );
  const buyers = loadBuyers();
  const keys = new Set(buyers.map(b => buyerKey(b)));
  return sourcing.filter(l => !keys.has(buyerKey(sourcingLeadToBuyer(l)))).length;
}

export { SOURCING_KEY };
