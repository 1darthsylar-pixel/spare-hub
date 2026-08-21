/* ============================================================================
   fcrMath.js — the FCR projection arithmetic, and nothing else.

   ★ LEAF. Imports nothing.

   ═══ WHY IT EXISTS ═════════════════════════════════════════════════════════
   The maths lived inside FCRPage.jsx, a component nothing in Node can load, so
   the projection every money screen in this store reads from could not be
   tested at all. Same argument tierMath.js, jobHealth.js and schedule.js each
   make: anything that DECIDES a number cannot live where nothing can execute
   it, and money deserves it more than most.

   ⚠️ NO BEHAVIOUR CHANGED. The body below is the body that was there, moved,
   with exactly one difference: the two `storeCfg` reads are now arguments. See
   the note on the signature.
   ============================================================================ */

export function buildLiveProjection(d, estSales, foodPct, paperPct, laborPct, ytd, cfg) {
  /* ⚠️⚠️ THE TWO CONFIG READS ARE INJECTED, AND THAT IS THE ONLY CHANGE.
     `fixedDollar()` and `feeShare()` both read `storeCfg`, which is browser
     state, and reading them in here is what made this function impossible to
     call from Node. Passing them in leaves the arithmetic byte-identical and
     puts the store's answer where it belongs: at the call site, which already
     has it. FCRPage.jsx supplies them and nothing about its behaviour moves. */
  const fixedLines = (cfg && cfg.fixedDollarLines instanceof Set)
    ? cfg.fixedDollarLines
    : new Set((cfg && cfg.fixedDollarLines) || []);
  const feeShare = Number((cfg && cfg.feeShare) || 0);
  /* 🐛🐛 THIS CRASHED THE WHOLE FINANCIALS TILE FOR NICK, Aug 8 2026:
     "undefined is not an object (evaluating 'A.items')".

     When the projection data moved to a fetch earlier today, EMPTY_MONTH gave
     `d` a groups ARRAY so nothing would throw. That was not enough: this
     function does not just read groups, it ASSUMES a "Prime Costs" group is in
     there. With an empty array find() returns undefined and .items throws — and
     it throws HERE, above the loading gate, so the gate never got the chance to
     render and the tile went to its crash boundary instead.

     ⚠️ THE LESSON, WRITTEN DOWN: an empty-shape fallback has to satisfy every
     LOOKUP the render does, not merely every top-level key. groups: [] is a
     valid array and still a broken template.
     ⚠️ RETURNS A USABLE EMPTY PROJECTION rather than null, because every caller
     reads .groups and .totals off this without checking. */
  const primeGroup = (d && Array.isArray(d.groups) ? d.groups : []).find((g) => g && g.name === "Prime Costs");
  const primeItems = (primeGroup && Array.isArray(primeGroup.items)) ? primeGroup.items : null;
  if (!primeItems) {
    return {
      groups: [], liveLabels: new Set(), ytdLabels: new Set(),
      totals: {
        totalExpenses: [0, 0],
        operatingProfit: [0, 0],
        baseProfit: [0, 0],
        baseOperatingFee: [0, 0],
        netProfit: [0, 0],
      },
    };
  }
  const staticWages = primeItems.find(([label]) => label === "Wages") || ["Wages", 0, 0];
  const staticTax = primeItems.find(([label]) => label === "Wage Taxes") || ["Wage Taxes", 0, 0];
  const wageTaxRate = staticWages[1] > 0 ? staticTax[1] / staticWages[1] : 0;

  const wagesDollars = laborPct != null ? laborPct * estSales : null;
  const foodDollars = foodPct != null ? foodPct * estSales : null;
  const paperDollars = paperPct != null ? paperPct * estSales : null;
  const wageTaxDollars = wagesDollars != null ? wagesDollars * wageTaxRate : null;

  const ytdPct = (label) => {
    const v = ytd ? ytd[label] : null;
    return v != null && isFinite(v) ? v : null;
  };

  const liveLabels = new Set();
  const ytdLabels = new Set();
  const groups = d.groups.map((g) => {
    const items = g.items.map(([label, dollars, p]) => {
      // 1. LIVE prime-cost lines (when we have a live figure)
      if (label === "Food Cost" && foodDollars != null) { liveLabels.add(label); return [label, foodDollars, estSales > 0 ? foodDollars / estSales : 0]; }
      if (label === "Paper Cost" && paperDollars != null) { liveLabels.add(label); return [label, paperDollars, estSales > 0 ? paperDollars / estSales : 0]; }
      if (label === "Wages" && wagesDollars != null) { liveLabels.add(label); return [label, wagesDollars, estSales > 0 ? wagesDollars / estSales : 0]; }
      if (label === "Wage Taxes" && wageTaxDollars != null) { liveLabels.add(label); return [label, wageTaxDollars, estSales > 0 ? wageTaxDollars / estSales : 0]; }
      // 2. FIXED-DOLLAR lines — hold the flat dollar, show % vs Est Sales
      if (fixedLines.has(label)) { return [label, dollars, estSales > 0 ? dollars / estSales : 0]; }
      // 3. Everything else — carry at YTD % when we have it (incl. a live line
      //    that had no live figure this month, e.g. Wages before payroll)
      const y = ytdPct(label);
      if (y != null) { ytdLabels.add(label); return [label, y * estSales, y]; }
      // 4. Fallback — the month template value (no YTD on file for this line)
      return [label, dollars, p];
    });
    return { ...g, items };
  });

  const totalExpenses = groups.reduce((s, g) => s + g.items.reduce((s2, [, v]) => s2 + v, 0), 0);
  const operatingProfitDollars = estSales - totalExpenses;
  const operatingProfitPct = estSales > 0 ? operatingProfitDollars / estSales : 0;

  // Base Profit — fixed dollar carried from the template ($1,000).
  /* ⚠️ OPTIONAL, BECAUSE `d` CAN BE EMPTY_MONTH, WHOSE `totals` IS `{}`.
     🐛 The Village hit this the same day as the wage crash below:
     `d.totals.baseProfit[0]` threw "Cannot read properties of undefined
     (reading '0')" at a store with no projection on file. It runs inside the
     `live` useMemo, which executes DURING render, so there it took the page
     down before a pixel drew.
     ⚠️⚠️ MEASURED HERE AND IT DID NOT FIRE, WHICH IS WHY THIS SAYS SO RATHER
     THAN CLAIMING A FIX. Aug 18 2026: the wage crash was put back and this
     guard removed, both together and then one at a time, against a store with
     `DATA` empty. Only the wage crash ever fired. So this is the Village's
     guard ported to match (rule 8 — one shape of answer to one question), NOT
     a reachable crash anybody has driven at this store. Do not rewrite this
     note into a bug report; the measurement is what it says.
     ⚠️ 0 IS THE HONEST VALUE HERE, not a placeholder. No Base Profit line on
     file means there is nothing to subtract, and `net = operating − 0 − fee`
     still holds. Coerced, so a template carrying the dollars as a string still
     reads (design rule 1). */
  const baseProfitDollars = Number(d.totals?.baseProfit?.[0]) || 0;
  const baseProfitPct = estSales > 0 ? baseProfitDollars / estSales : 0;

  // Base Operating Fee — the plug: Equip Rent + Biz Svc Fee + this = 15% of
  // sales. Read the two fixed lines back out of the carried groups so the
  // identity always holds, then recompute the fee live off Est Sales.
  const feesGroup = groups.find((g) => g.name === "Fees & Taxes");
  const equipRent = feesGroup?.items.find(([l]) => l === "Equipment Rent")?.[1] || 0;
  const bizSvcFee = feesGroup?.items.find(([l]) => l === "Business Service Fee")?.[1] || 0;
  const baseOperatingFeeDollars = feeShare * estSales - equipRent - bizSvcFee;
  const baseOperatingFeePct = estSales > 0 ? baseOperatingFeeDollars / estSales : 0;

  const netProfitDollars = operatingProfitDollars - baseProfitDollars - baseOperatingFeeDollars;
  const netProfitPct = estSales > 0 ? netProfitDollars / estSales : 0;

  return {
    groups, liveLabels, ytdLabels,
    totals: {
      totalExpenses,
      operatingProfit: [operatingProfitDollars, operatingProfitPct],
      baseProfit: [baseProfitDollars, baseProfitPct],
      baseOperatingFee: [baseOperatingFeeDollars, baseOperatingFeePct],
      netProfit: [netProfitDollars, netProfitPct],
    },
  };
}
