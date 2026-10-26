/** Taxes Québec — TPS 5% + TVQ 9.975% (CAD) */
const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Array<{qty:number, unitPrice:number}>} items
 * @returns {{subtotal:number, tps:number, tvq:number, total:number, tpsRate:number, tvqRate:number}}
 */
function computeTaxes(items) {
  const subtotal = round2(
    (items || []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0)
  );
  const tps = round2(subtotal * TPS_RATE);
  const tvq = round2(subtotal * TVQ_RATE);
  const total = round2(subtotal + tps + tvq);
  return { subtotal, tps, tvq, total, tpsRate: TPS_RATE, tvqRate: TVQ_RATE };
}

module.exports = { TPS_RATE, TVQ_RATE, computeTaxes, round2 };
