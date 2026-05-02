// Phase 13.3 — Budget tracking.
// Computes spending stats from bottle purchase prices and the journal.

export const computeBudget = (inventory, journalEntries, options = {}) => {
  const monthsBack = options.monthsBack ?? 12;
  const cutoff = Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000;

  // Aggregate every bottle (consumed or not) with a purchase_date in window
  const allBottles = inventory.flatMap(w => (w.bottles || []).map(b => ({ ...b, _wineType: w.type, _wineRegion: w.region })));

  const inWindow = allBottles.filter(b => {
    const d = b.purchaseDate || b.purchase_date;
    if (!d) return false;
    return new Date(d).getTime() >= cutoff;
  });

  const totalSpent = inWindow.reduce((s, b) => s + (b.purchasePrice ?? b.purchase_price ?? 0), 0);
  const totalBottles = inWindow.length;
  const avgPrice = totalBottles > 0 ? totalSpent / totalBottles : 0;

  // Per-month spending
  const byMonth = {};
  for (const b of inWindow) {
    const d = new Date(b.purchaseDate || b.purchase_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
    byMonth[key].count++;
    byMonth[key].total += (b.purchasePrice ?? b.purchase_price ?? 0);
  }

  // Per-type spending
  const byType = {};
  for (const b of inWindow) {
    const t = b._wineType || 'UNKNOWN';
    if (!byType[t]) byType[t] = { count: 0, total: 0 };
    byType[t].count++;
    byType[t].total += (b.purchasePrice ?? b.purchase_price ?? 0);
  }

  // Current cellar value (estimate from purchase prices of unconsumed bottles)
  const currentValue = allBottles
    .filter(b => !(b.isConsumed || b.is_consumed))
    .reduce((s, b) => s + (b.purchasePrice ?? b.purchase_price ?? 0), 0);

  return {
    period_months: monthsBack,
    total_spent: Math.round(totalSpent * 100) / 100,
    total_bottles: totalBottles,
    avg_price: Math.round(avgPrice * 100) / 100,
    monthly_avg: monthsBack > 0 ? Math.round((totalSpent / monthsBack) * 100) / 100 : 0,
    by_month: Object.entries(byMonth).sort().map(([month, v]) => ({ month, ...v, total: Math.round(v.total * 100) / 100 })),
    by_type: Object.entries(byType).map(([type, v]) => ({ type, ...v, total: Math.round(v.total * 100) / 100 })),
    cellar_value_estimate: Math.round(currentValue * 100) / 100,
  };
};
