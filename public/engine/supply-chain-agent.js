/**
 * @fileoverview Supply Chain Agent Engine — KAFI AI Agent 6
 *
 * Implements the real analytics behind every responsibility in the
 * Agent 6 specification:
 *   - Demand Planning & Forecasting   (moving average + trend + seasonality)
 *   - Procurement Planning            (purchase requirements, PO generation)
 *   - Inventory Management            (reorder points, EOQ, expiry, slow-moving)
 *   - Supplier & Vendor Management    (scorecards: on-time, fill rate, price)
 *   - Logistics & Distribution        (shipment tracking, landed cost)
 *   - Cost & Optimization             (budget vs actual, cost insights)
 *   - Compliance & Risk Management    (auto risk detection)
 *   - Reporting & Analytics           (KPIs: turnover, lead time, fill rate, OTIF)
 *
 * All computations run locally in the browser on the loaded datasets.
 * The AI copilot receives a compact context summary via buildAIContext().
 *
 * @module supply-chain-agent
 * @version 1.0.0
 */

const STORAGE_KEY = 'kafi_scm_data';

const DAY_MS = 24 * 60 * 60 * 1000;

// Cost model assumptions (editable in future settings)
export const COST_MODEL = {
  orderingCostUSD: 150,      // fixed cost per purchase order
  holdingRatePct: 0.20,      // annual holding cost as % of unit cost
  overstockDays: 120,        // days of stock considered overstock
  expiryWarningDays: 60,     // flag stock expiring within N days
  slowMovingDays: 90,        // no sales for N days = slow-moving
};

// ═══════════════════════════════════════════════════════════════
//  DATA STORE
// ═══════════════════════════════════════════════════════════════

export function emptyData() {
  return {
    products: [],        // {sku, name, category, unit, unitCost, leadTimeDays, safetyStockDays, shelfLifeDays, supplierId, moq}
    sales: [],           // {date, sku, qty, market}
    inventory: [],       // {sku, onHand, warehouse, expiryDate}
    suppliers: [],       // {id, name, country, city, categories, paymentTerms, approved, singleSource}
    purchaseOrders: [],  // {poNumber, date, supplierId, sku, qty, unitPrice, expectedDate, receivedDate, receivedQty, status}
    shipments: [],       // {id, type, ref, carrier, mode, origin, destination, etd, eta, actualArrival, status, freightCost, dutyPct, otherCost, cargoValue, units}
    budget: [],          // {month, budgeted, actual}
  };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    return emptyData();
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearData() {
  localStorage.removeItem(STORAGE_KEY);
}

// ═══════════════════════════════════════════════════════════════
//  CSV PARSING (for user-uploaded ERP/WMS exports)
// ═══════════════════════════════════════════════════════════════

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
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row); }
  if (!rows.length) return [];

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = (r[i] ?? '').trim();
      obj[h] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    });
    return obj;
  });
}

// ═══════════════════════════════════════════════════════════════
//  DEMAND PLANNING & FORECASTING
// ═══════════════════════════════════════════════════════════════

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7); // YYYY-MM
}

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Monthly demand series for one SKU: [{month, qty}] sorted ascending, gaps filled with 0. */
export function monthlySeries(data, sku) {
  const byMonth = {};
  for (const s of data.sales) {
    if (s.sku !== sku) continue;
    const k = monthKey(s.date);
    byMonth[k] = (byMonth[k] || 0) + Number(s.qty || 0);
  }
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) return [];
  const series = [];
  let cur = keys[0];
  const last = keys[keys.length - 1];
  while (cur <= last) {
    series.push({ month: cur, qty: byMonth[cur] || 0 });
    cur = addMonths(cur, 1);
  }
  return series;
}

function linearTrend(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  return { slope, intercept: (sumY - slope * sumX) / n };
}

/** Seasonal indices by calendar month (needs >= 13 months of history). */
function seasonalIndices(series) {
  if (series.length < 13) return null;
  const avg = series.reduce((a, p) => a + p.qty, 0) / series.length;
  if (avg === 0) return null;
  const byCalMonth = {};
  for (const p of series) {
    const m = p.month.slice(5);
    (byCalMonth[m] = byCalMonth[m] || []).push(p.qty);
  }
  const idx = {};
  for (const [m, arr] of Object.entries(byCalMonth)) {
    idx[m] = (arr.reduce((a, b) => a + b, 0) / arr.length) / avg;
  }
  return idx;
}

/**
 * Forecast the next `horizon` months of demand for a SKU.
 * Blends 3-month moving average with linear trend, then applies
 * seasonal indices when enough history exists.
 */
export function forecastSKU(data, sku, horizon = 3) {
  const series = monthlySeries(data, sku);
  if (!series.length) return { sku, series, forecasts: [], method: 'no-history' };

  const values = series.map(p => p.qty);
  const recent = values.slice(-3);
  const movingAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const { slope, intercept } = linearTrend(values);
  const seasonal = seasonalIndices(series);

  const lastMonth = series[series.length - 1].month;
  const forecasts = [];
  for (let h = 1; h <= horizon; h++) {
    const month = addMonths(lastMonth, h);
    const trendVal = intercept + slope * (values.length - 1 + h);
    let base = Math.max(0, 0.5 * movingAvg + 0.5 * Math.max(0, trendVal));
    if (seasonal) {
      const si = seasonal[month.slice(5)];
      if (si !== undefined) base *= si;
    }
    forecasts.push({ month, qty: Math.round(base) });
  }

  return {
    sku, series, forecasts,
    method: seasonal ? 'ma3 + trend + seasonal' : 'ma3 + trend',
    movingAvg: Math.round(movingAvg),
    trendPerMonth: Math.round(slope),
  };
}

export function forecastAll(data, horizon = 3) {
  return data.products.map(p => ({ product: p, ...forecastSKU(data, p.sku, horizon) }));
}

/** Average daily demand from the last ~90 days of sales (falls back to monthly avg). */
export function avgDailyDemand(data, sku) {
  const series = monthlySeries(data, sku);
  if (!series.length) return 0;
  const last3 = series.slice(-3);
  const total = last3.reduce((a, p) => a + p.qty, 0);
  return total / (last3.length * 30);
}

// ═══════════════════════════════════════════════════════════════
//  INVENTORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function onHandFor(data, sku) {
  return data.inventory.filter(i => i.sku === sku).reduce((a, i) => a + Number(i.onHand || 0), 0);
}

export function inventoryAnalysis(data, today = new Date()) {
  const now = today.getTime();
  return data.products.map(p => {
    const onHand = onHandFor(data, p.sku);
    const daily = avgDailyDemand(data, p.sku);
    const leadTime = Number(p.leadTimeDays || 14);
    const safetyDays = Number(p.safetyStockDays || 7);
    const safetyStock = Math.ceil(daily * safetyDays);
    const reorderPoint = Math.ceil(daily * leadTime + safetyStock);
    const daysOfStock = daily > 0 ? Math.round(onHand / daily) : (onHand > 0 ? Infinity : 0);

    // EOQ = sqrt(2DS / H), D = annual demand, S = ordering cost, H = annual holding cost/unit
    const annualDemand = daily * 365;
    const holding = Math.max(Number(p.unitCost || 1) * COST_MODEL.holdingRatePct, 0.01);
    const eoq = annualDemand > 0 ? Math.round(Math.sqrt((2 * annualDemand * COST_MODEL.orderingCostUSD) / holding)) : 0;

    // Expiry check across batches
    const expiring = data.inventory.filter(i =>
      i.sku === p.sku && i.expiryDate &&
      (new Date(i.expiryDate).getTime() - now) < COST_MODEL.expiryWarningDays * DAY_MS &&
      Number(i.onHand || 0) > 0
    );

    // Slow-moving: stock on hand but no sales in last N days
    const lastSale = data.sales.filter(s => s.sku === p.sku).map(s => new Date(s.date).getTime()).sort().pop();
    const slowMoving = onHand > 0 && (!lastSale || (now - lastSale) > COST_MODEL.slowMovingDays * DAY_MS);

    let status = 'OK';
    if (onHand <= 0 && daily > 0) status = 'STOCKOUT';
    else if (onHand <= reorderPoint && daily > 0) status = 'REORDER';
    else if (daysOfStock !== Infinity && daysOfStock > COST_MODEL.overstockDays) status = 'OVERSTOCK';
    else if (slowMoving) status = 'SLOW-MOVING';

    return {
      sku: p.sku, name: p.name, category: p.category, unit: p.unit,
      onHand, avgDailyDemand: +daily.toFixed(1), reorderPoint, safetyStock,
      daysOfStock: daysOfStock === Infinity ? '∞' : daysOfStock,
      eoq, status, slowMoving,
      expiringBatches: expiring.map(e => ({ warehouse: e.warehouse, onHand: e.onHand, expiryDate: e.expiryDate })),
      stockValue: +(onHand * Number(p.unitCost || 0)).toFixed(0),
    };
  });
}

// ═══════════════════════════════════════════════════════════════
//  PROCUREMENT PLANNING & EXECUTION
// ═══════════════════════════════════════════════════════════════

/** Purchase requirements: what to order now, based on stock position vs forecast + reorder point. */
export function purchaseRequirements(data) {
  const inv = inventoryAnalysis(data);
  const reqs = [];
  for (const item of inv) {
    if (item.status !== 'REORDER' && item.status !== 'STOCKOUT') continue;
    const p = data.products.find(x => x.sku === item.sku);
    const fc = forecastSKU(data, item.sku, 2);
    const nextDemand = fc.forecasts.reduce((a, f) => a + f.qty, 0);
    // Order enough to cover next 2 months of demand + safety stock − on hand, at least EOQ or MOQ
    let qty = Math.max(nextDemand + item.safetyStock - item.onHand, item.eoq, Number(p?.moq || 0));
    qty = Math.ceil(qty);
    if (qty <= 0) continue;
    const supplier = data.suppliers.find(s => s.id === p?.supplierId);
    reqs.push({
      sku: item.sku, name: item.name, unit: item.unit,
      onHand: item.onHand, reorderPoint: item.reorderPoint,
      suggestedQty: qty,
      estUnitCost: Number(p?.unitCost || 0),
      estTotal: +(qty * Number(p?.unitCost || 0)).toFixed(0),
      supplierId: supplier?.id || '', supplierName: supplier?.name || 'No approved supplier',
      leadTimeDays: Number(p?.leadTimeDays || 14),
      urgency: item.status === 'STOCKOUT' ? 'CRITICAL' : 'HIGH',
    });
  }
  return reqs.sort((a, b) => (a.urgency === 'CRITICAL' ? -1 : 1) - (b.urgency === 'CRITICAL' ? -1 : 1));
}

export function nextPONumber(data) {
  const year = new Date().getFullYear();
  const nums = data.purchaseOrders
    .map(po => /^PO-(\d{4})-(\d+)$/.exec(po.poNumber))
    .filter(m => m && Number(m[1]) === year)
    .map(m => Number(m[2]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `PO-${year}-${String(next).padStart(3, '0')}`;
}

export function createPurchaseOrder(data, req, opts = {}) {
  const po = {
    poNumber: nextPONumber(data),
    date: new Date().toISOString().slice(0, 10),
    supplierId: req.supplierId,
    sku: req.sku,
    qty: opts.qty ?? req.suggestedQty,
    unitPrice: opts.unitPrice ?? req.estUnitCost,
    expectedDate: opts.expectedDate ??
      new Date(Date.now() + (req.leadTimeDays || 14) * DAY_MS).toISOString().slice(0, 10),
    receivedDate: '',
    receivedQty: 0,
    status: 'ISSUED',
    notes: opts.notes || '',
  };
  data.purchaseOrders.push(po);
  saveData(data);
  return po;
}

// ═══════════════════════════════════════════════════════════════
//  SUPPLIER & VENDOR MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function supplierScorecards(data) {
  return data.suppliers.map(s => {
    const pos = data.purchaseOrders.filter(po => po.supplierId === s.id);
    const completed = pos.filter(po => po.receivedDate);

    const onTime = completed.filter(po => po.receivedDate <= po.expectedDate).length;
    const onTimeRate = completed.length ? onTime / completed.length : null;

    const fillRates = completed.map(po => Math.min(Number(po.receivedQty || 0) / Math.max(Number(po.qty || 1), 1), 1));
    const fillRate = fillRates.length ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length : null;

    const leadTimes = completed.map(po => (new Date(po.receivedDate) - new Date(po.date)) / DAY_MS).filter(d => d >= 0);
    const avgLeadTime = leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : null;

    // Price variance vs current standard cost
    const variances = pos.map(po => {
      const p = data.products.find(x => x.sku === po.sku);
      if (!p || !p.unitCost) return null;
      return (Number(po.unitPrice) - Number(p.unitCost)) / Number(p.unitCost);
    }).filter(v => v !== null);
    const avgPriceVariance = variances.length ? variances.reduce((a, b) => a + b, 0) / variances.length : null;

    const totalSpend = pos.reduce((a, po) => a + Number(po.qty || 0) * Number(po.unitPrice || 0), 0);

    // Weighted score: on-time 40%, fill 30%, price 30%
    let score = null;
    if (completed.length) {
      const priceScore = avgPriceVariance === null ? 0.8 : Math.max(0, Math.min(1, 1 - Math.max(avgPriceVariance, 0) * 3));
      score = Math.round(((onTimeRate ?? 0.8) * 0.4 + (fillRate ?? 0.8) * 0.3 + priceScore * 0.3) * 100);
    }

    return {
      id: s.id, name: s.name, country: s.country, city: s.city,
      categories: s.categories, approved: s.approved !== false,
      poCount: pos.length, completedCount: completed.length,
      onTimeRate: onTimeRate === null ? null : +(onTimeRate * 100).toFixed(0),
      fillRate: fillRate === null ? null : +(fillRate * 100).toFixed(0),
      avgLeadTimeDays: avgLeadTime,
      avgPriceVariancePct: avgPriceVariance === null ? null : +(avgPriceVariance * 100).toFixed(1),
      totalSpend: Math.round(totalSpend),
      score,
      grade: score === null ? '—' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D',
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// ═══════════════════════════════════════════════════════════════
//  LOGISTICS, WAREHOUSE & LANDED COST
// ═══════════════════════════════════════════════════════════════

export function shipmentBoard(data, today = new Date()) {
  const now = today.getTime();
  return data.shipments.map(sh => {
    const eta = sh.eta ? new Date(sh.eta).getTime() : null;
    const delivered = sh.status === 'DELIVERED' || !!sh.actualArrival;
    const delayed = !delivered && eta !== null && now > eta;
    const delayDays = delayed ? Math.round((now - eta) / DAY_MS) : 0;
    let deliveryVariance = null;
    if (sh.actualArrival && sh.eta) {
      deliveryVariance = Math.round((new Date(sh.actualArrival) - new Date(sh.eta)) / DAY_MS);
    }
    return { ...sh, delivered, delayed, delayDays, deliveryVariance };
  });
}

export function landedCost(shipment) {
  const value = Number(shipment.cargoValue || 0);
  const freight = Number(shipment.freightCost || 0);
  const duty = value * (Number(shipment.dutyPct || 0) / 100);
  const other = Number(shipment.otherCost || 0);
  const total = value + freight + duty + other;
  const units = Math.max(Number(shipment.units || 1), 1);
  return {
    cargoValue: value, freight, duty: +duty.toFixed(0), other,
    totalLanded: +total.toFixed(0),
    perUnit: +(total / units).toFixed(2),
    markupPct: value > 0 ? +(((total / value) - 1) * 100).toFixed(1) : null,
  };
}

// ═══════════════════════════════════════════════════════════════
//  KPIs & REPORTING
// ═══════════════════════════════════════════════════════════════

export function computeKPIs(data) {
  const inv = inventoryAnalysis(data);
  const stockValue = inv.reduce((a, i) => a + i.stockValue, 0);

  // Annualized COGS approximation from last 3 months of sales at unit cost
  let cogs90 = 0;
  const cutoff = Date.now() - 90 * DAY_MS;
  for (const s of data.sales) {
    if (new Date(s.date).getTime() < cutoff) continue;
    const p = data.products.find(x => x.sku === s.sku);
    cogs90 += Number(s.qty || 0) * Number(p?.unitCost || 0);
  }
  const annualCOGS = cogs90 * 4;
  const inventoryTurnover = stockValue > 0 ? +(annualCOGS / stockValue).toFixed(1) : null;

  const completed = data.purchaseOrders.filter(po => po.receivedDate);
  const leadTimes = completed.map(po => (new Date(po.receivedDate) - new Date(po.date)) / DAY_MS).filter(d => d >= 0);
  const avgLeadTime = leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : null;

  const fillRates = completed.map(po => Math.min(Number(po.receivedQty || 0) / Math.max(Number(po.qty || 1), 1), 1));
  const fillRate = fillRates.length ? +(fillRates.reduce((a, b) => a + b, 0) / fillRates.length * 100).toFixed(0) : null;

  const otifCount = completed.filter(po =>
    po.receivedDate <= po.expectedDate && Number(po.receivedQty || 0) >= Number(po.qty || 0)
  ).length;
  const otif = completed.length ? +((otifCount / completed.length) * 100).toFixed(0) : null;

  const board = shipmentBoard(data);
  const activeShipments = board.filter(s => !s.delivered).length;
  const delayedShipments = board.filter(s => s.delayed).length;

  const budgetTotal = data.budget.reduce((a, b) => a + Number(b.budgeted || 0), 0);
  const actualTotal = data.budget.reduce((a, b) => a + Number(b.actual || 0), 0);
  const budgetVariancePct = budgetTotal > 0 ? +(((actualTotal - budgetTotal) / budgetTotal) * 100).toFixed(1) : null;

  return {
    stockValue: Math.round(stockValue),
    inventoryTurnover,
    avgLeadTimeDays: avgLeadTime,
    fillRatePct: fillRate,
    otifPct: otif,
    activeShipments, delayedShipments,
    reorderAlerts: inv.filter(i => i.status === 'REORDER' || i.status === 'STOCKOUT').length,
    expiryAlerts: inv.filter(i => i.expiringBatches.length > 0).length,
    budgetTotal: Math.round(budgetTotal), actualTotal: Math.round(actualTotal), budgetVariancePct,
  };
}

// ═══════════════════════════════════════════════════════════════
//  COMPLIANCE & RISK MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function detectRisks(data) {
  const risks = [];
  const inv = inventoryAnalysis(data);
  const board = shipmentBoard(data);
  const cards = supplierScorecards(data);

  for (const i of inv) {
    if (i.status === 'STOCKOUT') {
      risks.push({ severity: 'CRITICAL', category: 'Inventory', title: `Stockout: ${i.name}`, detail: `${i.sku} has zero stock with active demand (~${i.avgDailyDemand}/${i.unit ? i.unit + '/' : ''}day). Production or order fulfilment at risk.` });
    } else if (i.status === 'REORDER') {
      risks.push({ severity: 'HIGH', category: 'Inventory', title: `Below reorder point: ${i.name}`, detail: `${i.sku}: ${i.onHand} on hand vs reorder point ${i.reorderPoint}. ~${i.daysOfStock} days of stock left.` });
    }
    if (i.expiringBatches.length) {
      const total = i.expiringBatches.reduce((a, b) => a + Number(b.onHand || 0), 0);
      risks.push({ severity: 'MEDIUM', category: 'Inventory', title: `Expiry risk: ${i.name}`, detail: `${total} ${i.unit || 'units'} expiring within ${COST_MODEL.expiryWarningDays} days across ${i.expiringBatches.length} batch(es).` });
    }
  }

  for (const s of board.filter(x => x.delayed)) {
    risks.push({ severity: s.delayDays > 7 ? 'HIGH' : 'MEDIUM', category: 'Logistics', title: `Shipment delayed: ${s.id}`, detail: `${s.type} shipment (${s.origin} → ${s.destination}, ${s.carrier}) is ${s.delayDays} day(s) past ETA ${s.eta}.` });
  }

  // Single-source products
  for (const p of data.products) {
    const sources = new Set(data.purchaseOrders.filter(po => po.sku === p.sku).map(po => po.supplierId));
    if (p.supplierId) sources.add(p.supplierId);
    if (sources.size === 1) {
      risks.push({ severity: 'MEDIUM', category: 'Supplier', title: `Single source: ${p.name}`, detail: `${p.sku} depends on one supplier only. No qualified alternate — consider dual sourcing.` });
    }
  }

  // Supplier spend concentration
  const totalSpend = cards.reduce((a, c) => a + c.totalSpend, 0);
  for (const c of cards) {
    if (totalSpend > 0 && c.totalSpend / totalSpend > 0.4) {
      risks.push({ severity: 'MEDIUM', category: 'Supplier', title: `Spend concentration: ${c.name}`, detail: `${Math.round(c.totalSpend / totalSpend * 100)}% of procurement spend sits with one supplier.` });
    }
    if (c.score !== null && c.score < 55) {
      risks.push({ severity: 'HIGH', category: 'Supplier', title: `Underperforming supplier: ${c.name}`, detail: `Scorecard grade ${c.grade} (${c.score}/100). On-time ${c.onTimeRate ?? '—'}%, fill rate ${c.fillRate ?? '—'}%.` });
    }
  }

  // Price fluctuation: latest PO price vs oldest, per SKU
  for (const p of data.products) {
    const pos = data.purchaseOrders.filter(po => po.sku === p.sku).sort((a, b) => a.date.localeCompare(b.date));
    if (pos.length >= 2) {
      const first = Number(pos[0].unitPrice), last = Number(pos[pos.length - 1].unitPrice);
      if (first > 0 && (last - first) / first > 0.10) {
        risks.push({ severity: 'MEDIUM', category: 'Cost', title: `Price increase: ${p.name}`, detail: `PO price moved from ${first} to ${last} (+${Math.round((last - first) / first * 100)}%). Review contracts / renegotiate.` });
      }
    }
  }

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ═══════════════════════════════════════════════════════════════
//  AI CONTEXT BUILDER (feeds the copilot's system prompt)
// ═══════════════════════════════════════════════════════════════

export function buildAIContext(data) {
  const kpi = computeKPIs(data);
  const inv = inventoryAnalysis(data);
  const reqs = purchaseRequirements(data);
  const cards = supplierScorecards(data);
  const risks = detectRisks(data).slice(0, 12);
  const board = shipmentBoard(data);
  const fc = forecastAll(data, 3);

  const lines = [];
  lines.push('=== LIVE SUPPLY CHAIN DATA (KAFI Group) ===');
  lines.push(`KPIs: stock value $${kpi.stockValue} | turnover ${kpi.inventoryTurnover ?? '—'}x | avg PO lead time ${kpi.avgLeadTimeDays ?? '—'}d | fill rate ${kpi.fillRatePct ?? '—'}% | OTIF ${kpi.otifPct ?? '—'}% | budget variance ${kpi.budgetVariancePct ?? '—'}%`);

  lines.push('\n— INVENTORY —');
  for (const i of inv) {
    lines.push(`${i.sku} ${i.name}: ${i.onHand} ${i.unit || 'u'} on hand, ~${i.avgDailyDemand}/day, ROP ${i.reorderPoint}, EOQ ${i.eoq}, status ${i.status}${i.expiringBatches.length ? ', EXPIRY RISK' : ''}`);
  }

  lines.push('\n— 3-MONTH DEMAND FORECAST —');
  for (const f of fc) {
    if (f.forecasts.length) {
      lines.push(`${f.sku}: ${f.forecasts.map(x => `${x.month}=${x.qty}`).join(', ')} (${f.method})`);
    }
  }

  if (reqs.length) {
    lines.push('\n— OPEN PURCHASE REQUIREMENTS —');
    for (const r of reqs) lines.push(`${r.urgency}: ${r.sku} ${r.name} — order ${r.suggestedQty} ${r.unit || 'u'} from ${r.supplierName} (~$${r.estTotal})`);
  }

  lines.push('\n— SUPPLIERS —');
  for (const c of cards) {
    lines.push(`${c.name} (${c.country}): grade ${c.grade}, on-time ${c.onTimeRate ?? '—'}%, fill ${c.fillRate ?? '—'}%, lead ${c.avgLeadTimeDays ?? '—'}d, spend $${c.totalSpend}`);
  }

  const active = board.filter(s => !s.delivered);
  if (active.length) {
    lines.push('\n— ACTIVE SHIPMENTS —');
    for (const s of active) lines.push(`${s.id} ${s.type} ${s.origin}→${s.destination} via ${s.carrier}, ETA ${s.eta}${s.delayed ? ` (DELAYED ${s.delayDays}d)` : ''}`);
  }

  if (risks.length) {
    lines.push('\n— TOP RISKS —');
    for (const r of risks) lines.push(`[${r.severity}] ${r.title}: ${r.detail}`);
  }

  return lines.join('\n');
}

export const AI_SYSTEM_PROMPT = `You are the KAFI Supply Chain AI Agent (Agent 6) for Kafi Commodities (Pvt.) Ltd., a Pakistani exporter of Basmati rice, Himalayan pink salt, spices, vermicelli and desserts (brand "Essence", est. 1982, Karachi).

Your responsibilities: demand planning & forecasting, procurement planning & execution (purchase requirements, POs, supplier follow-up), inventory management (reorder points, expiry, slow-moving stock), supplier & vendor management (scorecards, negotiations, disputes), production coordination, logistics & distribution (shipments, landed cost), warehouse coordination, cost & supply-chain optimization, compliance & risk management, and reporting & analytics.

You are given LIVE data computed from the company's actual datasets below. Ground every answer in this data — quote real numbers, SKUs, supplier names and dates from it. Be concise, practical and decision-oriented, like a senior supply chain manager. When asked to draft documents (POs, supplier emails, contingency plans, reports) produce complete, professional, ready-to-send content. If data is missing for a question, say exactly what dataset should be uploaded. Use USD for values unless stated otherwise.`;
