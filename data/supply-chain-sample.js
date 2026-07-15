/**
 * @fileoverview Sample supply chain datasets — KAFI Group
 *
 * Realistic demo data for the Supply Chain AI Agent: KAFI's actual product
 * lines (rice, pink salt, spices, vermicelli, desserts) with Pakistani
 * suppliers, 24 months of seasonal sales history, current inventory,
 * purchase orders and live shipments.
 *
 * Real ERP/WMS exports can replace these via CSV upload in the Data Center.
 *
 * @module supply-chain-sample
 */

// Deterministic pseudo-random (so demo numbers are stable across loads)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const suppliers = [
  { id: 'SUP-001', name: 'Punjab Rice Mills',        country: 'Pakistan', city: 'Gujranwala', categories: 'Basmati & Non-Basmati Rice', paymentTerms: 'LC 60 days',  approved: true },
  { id: 'SUP-002', name: 'Khewra Salt Works',        country: 'Pakistan', city: 'Khewra',     categories: 'Himalayan Pink Salt',        paymentTerms: '30% advance', approved: true },
  { id: 'SUP-003', name: 'Kunri Spice Traders',      country: 'Pakistan', city: 'Kunri',      categories: 'Chilli, Turmeric, Spices',   paymentTerms: 'Cash 15 days', approved: true },
  { id: 'SUP-004', name: 'Sindh Agro Commodities',   country: 'Pakistan', city: 'Hyderabad',  categories: 'Spices, Condiments',         paymentTerms: 'Net 30',      approved: true },
  { id: 'SUP-005', name: 'Karachi Flour & Semolina', country: 'Pakistan', city: 'Karachi',    categories: 'Semolina, Flour (vermicelli input)', paymentTerms: 'Net 15', approved: true },
  { id: 'SUP-006', name: 'PackPro Industries',       country: 'Pakistan', city: 'Karachi',    categories: 'Packaging film, pouches, jars', paymentTerms: 'Net 30',   approved: true },
  { id: 'SUP-007', name: 'Crown Cartons',            country: 'Pakistan', city: 'Lahore',     categories: 'Export cartons, labels',     paymentTerms: 'Net 45',      approved: true },
  { id: 'SUP-008', name: 'Everfresh Ingredients FZE',country: 'UAE',      city: 'Sharjah',    categories: 'Custard, jelly, dessert ingredients', paymentTerms: 'TT advance', approved: true },
];

export const products = [
  { sku: 'RCE-SKB-05', name: 'Super Kernel Basmati 5kg',     category: 'Rice',       unit: 'bag',    unitCost: 8.20,  leadTimeDays: 21, safetyStockDays: 14, shelfLifeDays: 720, supplierId: 'SUP-001', moq: 500 },
  { sku: 'RCE-SEL-25', name: 'Sella Basmati 25kg',           category: 'Rice',       unit: 'bag',    unitCost: 32.50, leadTimeDays: 21, safetyStockDays: 14, shelfLifeDays: 720, supplierId: 'SUP-001', moq: 200 },
  { sku: 'SLT-FIN-08', name: 'Pink Salt Fine 800g',          category: 'Salt',       unit: 'jar',    unitCost: 1.15,  leadTimeDays: 14, safetyStockDays: 10, shelfLifeDays: 1800, supplierId: 'SUP-002', moq: 2000 },
  { sku: 'SLT-CRS-25', name: 'Pink Salt Coarse 25kg',        category: 'Salt',       unit: 'sack',   unitCost: 9.80,  leadTimeDays: 14, safetyStockDays: 10, shelfLifeDays: 1800, supplierId: 'SUP-002', moq: 300 },
  { sku: 'SPC-CHL-01', name: 'Red Chilli Powder 1kg',        category: 'Spices',     unit: 'pack',   unitCost: 3.40,  leadTimeDays: 10, safetyStockDays: 7,  shelfLifeDays: 365, supplierId: 'SUP-003', moq: 1000 },
  { sku: 'SPC-TRM-01', name: 'Turmeric Powder 1kg',          category: 'Spices',     unit: 'pack',   unitCost: 2.90,  leadTimeDays: 10, safetyStockDays: 7,  shelfLifeDays: 365, supplierId: 'SUP-003', moq: 1000 },
  { sku: 'SPC-GRM-200',name: 'Garam Masala Blend 200g',      category: 'Spices',     unit: 'pack',   unitCost: 1.75,  leadTimeDays: 12, safetyStockDays: 7,  shelfLifeDays: 365, supplierId: 'SUP-004', moq: 1500 },
  { sku: 'VRM-STD-150',name: 'Vermicelli 150g',              category: 'Vermicelli', unit: 'pack',   unitCost: 0.42,  leadTimeDays: 7,  safetyStockDays: 10, shelfLifeDays: 270, supplierId: 'SUP-005', moq: 10000 },
  { sku: 'DST-CST-300',name: 'Custard Powder 300g',          category: 'Desserts',   unit: 'tin',    unitCost: 1.30,  leadTimeDays: 30, safetyStockDays: 15, shelfLifeDays: 540, supplierId: 'SUP-008', moq: 3000 },
  { sku: 'CND-PKL-400',name: 'Mixed Pickle 400g',            category: 'Condiments', unit: 'jar',    unitCost: 1.60,  leadTimeDays: 12, safetyStockDays: 7,  shelfLifeDays: 450, supplierId: 'SUP-004', moq: 2000 },
];

// Base monthly demand + seasonal profile per SKU.
// Seasonality: Ramadan/Eid boosts vermicelli & desserts; year-end boosts rice exports.
const demandProfile = {
  'RCE-SKB-05':  { base: 4200, seasonal: { '11': 1.25, '12': 1.35, '01': 1.15, '06': 0.85 }, trend: 45 },
  'RCE-SEL-25':  { base: 1800, seasonal: { '11': 1.2,  '12': 1.3,  '01': 1.1 },              trend: 20 },
  'SLT-FIN-08':  { base: 9500, seasonal: { '10': 1.1,  '11': 1.15 },                          trend: 110 },
  'SLT-CRS-25':  { base: 1300, seasonal: {},                                                  trend: 8 },
  'SPC-CHL-01':  { base: 3800, seasonal: { '05': 1.15, '06': 1.2 },                           trend: 25 },
  'SPC-TRM-01':  { base: 3100, seasonal: { '05': 1.1,  '06': 1.15 },                          trend: 18 },
  'SPC-GRM-200': { base: 5200, seasonal: { '05': 1.2,  '06': 1.25, '12': 1.1 },               trend: 30 },
  'VRM-STD-150': { base: 32000,seasonal: { '02': 1.9,  '03': 2.4,  '04': 1.6 },               trend: 150 }, // Ramadan window 2026
  'DST-CST-300': { base: 6800, seasonal: { '02': 1.5,  '03': 1.8,  '04': 1.4, '12': 1.2 },    trend: 40 },
  'CND-PKL-400': { base: 4400, seasonal: { '11': 1.15, '12': 1.2 },                           trend: 15 },
};

const markets = ['UAE', 'Saudi Arabia', 'UK', 'USA', 'Canada', 'Malaysia', 'Qatar', 'Germany'];

/** 24 months of sales history ending last month (June 2026). */
export function generateSales() {
  const rand = mulberry32(20260713);
  const sales = [];
  const end = new Date(Date.UTC(2026, 5, 1)); // June 2026 = last complete month
  for (let back = 23; back >= 0; back--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const mm = ym.slice(5);
    for (const [sku, prof] of Object.entries(demandProfile)) {
      const monthsFromStart = 23 - back;
      let qty = prof.base + prof.trend * monthsFromStart;
      qty *= prof.seasonal[mm] ?? 1;
      qty *= 0.9 + rand() * 0.2; // ±10% noise
      // Split across 2-3 markets to make the data realistic
      const splits = 2 + Math.floor(rand() * 2);
      let remaining = Math.round(qty);
      for (let s = 0; s < splits; s++) {
        const share = s === splits - 1 ? remaining : Math.round(remaining * (0.3 + rand() * 0.4));
        remaining -= share;
        if (share > 0) {
          sales.push({
            date: `${ym}-${String(5 + s * 9).padStart(2, '0')}`,
            sku, qty: share,
            market: markets[Math.floor(rand() * markets.length)],
          });
        }
      }
    }
  }
  return sales;
}

// Inventory snapshot (as of July 2026). Deliberately includes:
// - a stockout (custard), reorder cases (vermicelli after Ramadan restock burn, chilli)
// - an overstock (coarse salt), an expiry-risk batch (pickle)
export const inventory = [
  { sku: 'RCE-SKB-05',  onHand: 6200,  warehouse: 'Hub River Rd WH-1', expiryDate: '2027-09-30' },
  { sku: 'RCE-SEL-25',  onHand: 2600,  warehouse: 'Hub River Rd WH-1', expiryDate: '2027-10-31' },
  { sku: 'SLT-FIN-08',  onHand: 11500, warehouse: 'Hub River Rd WH-2', expiryDate: '2030-01-31' },
  { sku: 'SLT-CRS-25',  onHand: 7800,  warehouse: 'Hub River Rd WH-2', expiryDate: '2030-01-31' },
  { sku: 'SPC-CHL-01',  onHand: 2900,  warehouse: 'Hub River Rd WH-1', expiryDate: '2026-12-15' },
  { sku: 'SPC-TRM-01',  onHand: 5400,  warehouse: 'Hub River Rd WH-1', expiryDate: '2027-01-20' },
  { sku: 'SPC-GRM-200', onHand: 8100,  warehouse: 'Hub River Rd WH-1', expiryDate: '2026-11-30' },
  { sku: 'VRM-STD-150', onHand: 21000, warehouse: 'Hub River Rd WH-3', expiryDate: '2026-12-01' },
  { sku: 'DST-CST-300', onHand: 0,     warehouse: 'Hub River Rd WH-3', expiryDate: '' },
  { sku: 'CND-PKL-400', onHand: 5200,  warehouse: 'Hub River Rd WH-3', expiryDate: '2026-08-20' }, // expiry risk
];

// Purchase order history (last 12 months) — mixed performance:
// Punjab Rice Mills mostly on time; Everfresh (custard) chronically late,
// which explains the current custard stockout. Chilli prices rising.
export const purchaseOrders = [
  { poNumber: 'PO-2025-041', date: '2025-08-04', supplierId: 'SUP-001', sku: 'RCE-SKB-05',  qty: 9000,  unitPrice: 7.90, expectedDate: '2025-08-25', receivedDate: '2025-08-23', receivedQty: 9000,  status: 'CLOSED' },
  { poNumber: 'PO-2025-042', date: '2025-08-11', supplierId: 'SUP-002', sku: 'SLT-FIN-08',  qty: 20000, unitPrice: 1.08, expectedDate: '2025-08-25', receivedDate: '2025-08-24', receivedQty: 20000, status: 'CLOSED' },
  { poNumber: 'PO-2025-048', date: '2025-09-02', supplierId: 'SUP-003', sku: 'SPC-CHL-01',  qty: 8000,  unitPrice: 3.05, expectedDate: '2025-09-12', receivedDate: '2025-09-15', receivedQty: 7600,  status: 'CLOSED' },
  { poNumber: 'PO-2025-052', date: '2025-09-20', supplierId: 'SUP-008', sku: 'DST-CST-300', qty: 12000, unitPrice: 1.22, expectedDate: '2025-10-20', receivedDate: '2025-11-02', receivedQty: 12000, status: 'CLOSED' },
  { poNumber: 'PO-2025-057', date: '2025-10-06', supplierId: 'SUP-001', sku: 'RCE-SEL-25',  qty: 4000,  unitPrice: 31.80, expectedDate: '2025-10-27', receivedDate: '2025-10-26', receivedQty: 4000, status: 'CLOSED' },
  { poNumber: 'PO-2025-063', date: '2025-11-03', supplierId: 'SUP-005', sku: 'VRM-STD-150', qty: 90000, unitPrice: 0.39, expectedDate: '2025-11-10', receivedDate: '2025-11-09', receivedQty: 90000, status: 'CLOSED' },
  { poNumber: 'PO-2025-068', date: '2025-11-24', supplierId: 'SUP-004', sku: 'SPC-GRM-200', qty: 14000, unitPrice: 1.62, expectedDate: '2025-12-06', receivedDate: '2025-12-05', receivedQty: 14000, status: 'CLOSED' },
  { poNumber: 'PO-2025-072', date: '2025-12-08', supplierId: 'SUP-003', sku: 'SPC-CHL-01',  qty: 9000,  unitPrice: 3.25, expectedDate: '2025-12-18', receivedDate: '2025-12-22', receivedQty: 9000,  status: 'CLOSED' },
  { poNumber: 'PO-2026-004', date: '2026-01-12', supplierId: 'SUP-005', sku: 'VRM-STD-150', qty: 160000,unitPrice: 0.40, expectedDate: '2026-01-19', receivedDate: '2026-01-18', receivedQty: 160000,status: 'CLOSED' },
  { poNumber: 'PO-2026-007', date: '2026-01-20', supplierId: 'SUP-008', sku: 'DST-CST-300', qty: 15000, unitPrice: 1.28, expectedDate: '2026-02-19', receivedDate: '2026-03-06', receivedQty: 13500, status: 'CLOSED' },
  { poNumber: 'PO-2026-011', date: '2026-02-02', supplierId: 'SUP-001', sku: 'RCE-SKB-05',  qty: 10000, unitPrice: 8.05, expectedDate: '2026-02-23', receivedDate: '2026-02-21', receivedQty: 10000, status: 'CLOSED' },
  { poNumber: 'PO-2026-015', date: '2026-02-16', supplierId: 'SUP-002', sku: 'SLT-CRS-25',  qty: 6000,  unitPrice: 9.60, expectedDate: '2026-03-02', receivedDate: '2026-03-01', receivedQty: 6000,  status: 'CLOSED' },
  { poNumber: 'PO-2026-019', date: '2026-03-09', supplierId: 'SUP-004', sku: 'CND-PKL-400', qty: 9000,  unitPrice: 1.52, expectedDate: '2026-03-21', receivedDate: '2026-03-20', receivedQty: 9000,  status: 'CLOSED' },
  { poNumber: 'PO-2026-024', date: '2026-04-06', supplierId: 'SUP-003', sku: 'SPC-CHL-01',  qty: 8000,  unitPrice: 3.55, expectedDate: '2026-04-16', receivedDate: '2026-04-19', receivedQty: 7800,  status: 'CLOSED' },
  { poNumber: 'PO-2026-028', date: '2026-04-20', supplierId: 'SUP-001', sku: 'RCE-SEL-25',  qty: 3500,  unitPrice: 32.40, expectedDate: '2026-05-11', receivedDate: '2026-05-10', receivedQty: 3500, status: 'CLOSED' },
  { poNumber: 'PO-2026-033', date: '2026-05-18', supplierId: 'SUP-006', sku: 'SLT-FIN-08',  qty: 25000, unitPrice: 1.12, expectedDate: '2026-06-01', receivedDate: '2026-06-03', receivedQty: 25000, status: 'CLOSED' },
  { poNumber: 'PO-2026-037', date: '2026-06-08', supplierId: 'SUP-008', sku: 'DST-CST-300', qty: 14000, unitPrice: 1.30, expectedDate: '2026-07-08', receivedDate: '', receivedQty: 0, status: 'ISSUED' }, // late — custard stockout
  { poNumber: 'PO-2026-039', date: '2026-06-22', supplierId: 'SUP-001', sku: 'RCE-SKB-05',  qty: 9500,  unitPrice: 8.20, expectedDate: '2026-07-13', receivedDate: '', receivedQty: 0, status: 'ISSUED' },
  { poNumber: 'PO-2026-041', date: '2026-06-29', supplierId: 'SUP-003', sku: 'SPC-CHL-01',  qty: 8500,  unitPrice: 3.60, expectedDate: '2026-07-09', receivedDate: '2026-07-09', receivedQty: 8500,  status: 'CLOSED' },
];

// Live shipment board (inbound = supplier→warehouse, outbound = export orders)
export const shipments = [
  { id: 'SHP-2026-118', type: 'INBOUND',  ref: 'PO-2026-037', carrier: 'Gulf Bridge Lines', mode: 'Sea',  origin: 'Sharjah',   destination: 'Karachi Port',  etd: '2026-06-28', eta: '2026-07-10', actualArrival: '', status: 'IN TRANSIT', freightCost: 2800,  dutyPct: 11, otherCost: 650,  cargoValue: 18200,  units: 14000 },  // delayed
  { id: 'SHP-2026-121', type: 'INBOUND',  ref: 'PO-2026-039', carrier: 'NLC Trucking',      mode: 'Road', origin: 'Gujranwala',destination: 'Hub River Rd WH-1', etd: '2026-07-11', eta: '2026-07-15', actualArrival: '', status: 'IN TRANSIT', freightCost: 1450, dutyPct: 0, otherCost: 200, cargoValue: 77900, units: 9500 },
  { id: 'SHP-2026-119', type: 'OUTBOUND', ref: 'EXP-ORD-882', carrier: 'Maersk',            mode: 'Sea',  origin: 'Karachi Port', destination: 'Jebel Ali (UAE)', etd: '2026-07-05', eta: '2026-07-12', actualArrival: '', status: 'IN TRANSIT', freightCost: 3200, dutyPct: 0, otherCost: 900, cargoValue: 96500, units: 11000 }, // slightly delayed
  { id: 'SHP-2026-116', type: 'OUTBOUND', ref: 'EXP-ORD-879', carrier: 'Hapag-Lloyd',       mode: 'Sea',  origin: 'Karachi Port', destination: 'Felixstowe (UK)', etd: '2026-06-20', eta: '2026-07-18', actualArrival: '', status: 'IN TRANSIT', freightCost: 4600, dutyPct: 0, otherCost: 1200, cargoValue: 132000, units: 8200 },
  { id: 'SHP-2026-110', type: 'OUTBOUND', ref: 'EXP-ORD-871', carrier: 'MSC',               mode: 'Sea',  origin: 'Karachi Port', destination: 'Jeddah (KSA)',   etd: '2026-06-02', eta: '2026-06-14', actualArrival: '2026-06-13', status: 'DELIVERED', freightCost: 2900, dutyPct: 0, otherCost: 800, cargoValue: 88400, units: 9600 },
  { id: 'SHP-2026-105', type: 'INBOUND',  ref: 'PO-2026-033', carrier: 'Khewra Logistics',  mode: 'Road', origin: 'Khewra',    destination: 'Hub River Rd WH-2', etd: '2026-05-30', eta: '2026-06-02', actualArrival: '2026-06-03', status: 'DELIVERED', freightCost: 950, dutyPct: 0, otherCost: 120, cargoValue: 28000, units: 25000 },
];

// Monthly supply chain budget vs actual (procurement + logistics, USD)
export const budget = [
  { month: '2026-01', budgeted: 155000, actual: 149800 },
  { month: '2026-02', budgeted: 160000, actual: 171200 },
  { month: '2026-03', budgeted: 150000, actual: 158400 },
  { month: '2026-04', budgeted: 145000, actual: 151900 },
  { month: '2026-05', budgeted: 150000, actual: 146300 },
  { month: '2026-06', budgeted: 165000, actual: 172800 },
];

export function buildSampleData() {
  return {
    products,
    suppliers,
    sales: generateSales(),
    inventory,
    purchaseOrders: JSON.parse(JSON.stringify(purchaseOrders)),
    shipments,
    budget,
  };
}
