/* ============================================================================
   fcrImport.js — Gate City Hub

   Parses the monthly FCR paste block. LEAF MODULE — imports nothing, so it
   stays node-testable and can never join an import cycle.

   The flow (Matt, Aug 1 2026: "for the monthly FCR give me an import button
   ... but don't kill the hand edit option"): the FCR report comes back from
   corporate, Matt drops the PDF on Claude, Claude hands back this block,
   and FCRPage's "Paste the FCR" button fills the month's ACTUAL and the
   rolling YTD column in one go. Every hand-edit field keeps working.

   FORMAT:

     FCR 2026-07
     actual | 84210.55 | 822656.08          <- net profit $ | month sales $
     ytd | 2026-07 | 5670514.88             <- through month | YTD sales $
     Misc. Revenue | -403.40
     Food Cost | 1595988.11
     ...one line per YTD label...
     Base Profit | 7000.00
     Base Operating Fee | 810574.65
     Net Profit | 667916.86

   `actual` and the `ytd` section are each optional — a paste can carry
   either or both. Label rows only mean something after the `ytd` line.
   The caller (FCRPage) filters labels against its own YTD table, so a
   mistyped label is ignored and named, never invented as a new line. */

const PROFIT_LABELS = new Set(["Base Profit", "Base Operating Fee", "Net Profit"]);
/* 🐛🐛 A BLANK COLUMN IS NOT A ZERO, AND JAVASCRIPT DISAGREES.

   `Number("")` is 0 and `Number.isFinite(0)` is true, so an empty cell sailed
   through as a real figure. Pasting

       FCR 2026-08
       actual | 84210.55 |

   imported $84,210.55 of net profit on $0 of sales. Every percentage built on
   it then divided by zero, on the screen this store reads its money from.

   ⚠️ A REAL ZERO STILL IMPORTS AS ZERO. "0" is a figure somebody typed and it
   has to keep working — refusing it would break a month with no catering, and
   that is the same three-state argument availability.js and storeHours.js both
   make: blank, zero and missing are three answers, not two. */
const num = (s) => {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function parseFcrPaste(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^FCR\s+(\d{4}-\d{2})$/i);
  if (!head) return { error: `First line must be "FCR YYYY-MM" (got "${lines[0]}").` };
  const ym = head[1];
  let actual = null, ytd = null, inYtd = false;
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    const key = (parts[0] || "").toLowerCase();
    if (key === "actual") {
      const net = num(parts[1]), sales = num(parts[2]);
      if (!Number.isFinite(net) || !Number.isFinite(sales)) return { error: `Bad actual line: "${line}"` };
      actual = { netProfit: net, sales };
      continue;
    }
    if (key === "ytd") {
      const through = (parts[1] || "").replace(/[^0-9-]/g, "");
      const sales = num(parts[2]);
      if (!/^\d{4}-\d{2}$/.test(through) || !Number.isFinite(sales)) return { error: `Bad ytd line: "${line}"` };
      ytd = { throughYm: through, sales, lines: {}, profit: {} };
      inYtd = true;
      continue;
    }
    if (!inYtd) return { error: `Label rows belong after the "ytd" line: "${line}"` };
    if (parts.length < 2) return { error: `Can't read this line: "${line}"` };
    const v = num(parts[1]);
    if (!Number.isFinite(v)) return { error: `Bad number in: "${line}"` };
    if (PROFIT_LABELS.has(parts[0])) ytd.profit[parts[0]] = v;
    else ytd.lines[parts[0]] = v;
  }
  if (!actual && !ytd) return { error: "Nothing to import — no actual line and no ytd section." };
  return { ym, actual, ytd };
}
