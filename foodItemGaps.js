/* ============================================================================
   foodItemGaps.js — Gate City Hub

   The OVER-TARGET subcategory gaps from the CFA Food Cost Drilldown report,
   used by the dashboard's Food card to name focus areas ("where the money
   went") instead of only showing a total dollars-over figure.

   WHY A SEPARATE MODULE, AND WHY HAND-ENTERED:
   analytics.cfahome.com is SSO-walled with no API, so nothing in the Hub can
   fetch this. It is a monthly transcription, same as the Daypart Labor table
   in LaborPlanner.jsx. The SEED below is the fallback so the card renders real
   numbers from day one; KV overrides it once a month is entered.

   WHAT COUNTS AS A GAP (read this before adding a month):
   On the drilldown, a POSITIVE / blue gap means actual ran ABOVE target for
   that subcategory — that is the money lost, and that is what belongs here.
   Gray / negative subcategories came in UNDER target; leave them out.
   Cross-check: your entered gaps should sum to the report's own
   "Positive Food Cost Gap" dollar figure. June 2026 does, to the cent.

   ⚠️ DO NOT put the "Cost of Goods Sold Impact" report here. That report
   measures cost INFLATION month-over-month and year-over-year (e.g. Chicken
   - Nuggets +$2,394 YoY). It is a different question from gap-vs-target and
   mixing the two would put a price-increase number under a "we overspent"
   heading.

   Shape: { [ym]: { label, items: [{ name, gap }] } }  — gap in whole dollars.
   ============================================================================ */

export const ITEM_GAPS_KEY = "gcfcr-food-item-gaps-v1";

/* June 2026 — from the drilldown Matt pulled Jul 24 2026.
   Actual 28.51% ($240,595.52) vs target 29.15% ($246,021.42); net gap
   −0.64% / −$5,425.90 (favorable overall). These seven are the subcategories
   that still ran over, and they sum to $3,730.84 = the report's own
   "Positive Food Cost Gap" exactly. */
/* 🐛🐛 THE JUNE 2026 GAP TABLE USED TO BE HERE (Aug 8 2026).
   App.jsx imports this file, so those seven line items and their dollars
   shipped in the ENTRY chunk every anonymous visitor downloads. It now lives
   in foodItemGapsSeed.js, which only worker.js imports, and arrives from
   GET /api/food-gaps-seed behind the Financials gate.
   ⚠️ loadItemGaps AND priorMonthGaps NOW TAKE THE SEED AS AN ARGUMENT. Do not
   re-import the data here to make a call site shorter; that is exactly how the
   browser copy comes back. */

const shift = (ym, by) => {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, (m - 1) + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/* parseDrilldownPaste(text) → { ym, items:[{name,gap}], reportGap|null } | { error }
   The paste block Claude hands back from the monthly Food Cost Drilldown:

     DRILLDOWN 2026-07 | 3730.84      <- optional: the report's own
                                         "Positive Food Cost Gap" figure
     Condiments | 500.00
     Waffle Potato Fries | 250.00

   Only OVER-target subcategories belong here (the rule at the top of this
   file); a zero-or-negative gap is refused, and when the header carries the
   report's own total, the lines must sum to it within a dollar — the same
   cross-check the entry rule describes, now enforced. */
export function parseDrilldownPaste(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].match(/^DRILLDOWN\s+(\d{4}-\d{2})(?:\s*\|\s*(.+))?$/i);
  if (!head) return { error: `First line must be "DRILLDOWN YYYY-MM" (got "${lines[0]}").` };
  const ym = head[1];
  const num = (s) => { const n = Number(String(s ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
  const reportGap = head[2] != null ? num(head[2]) : null;
  if (head[2] != null && !Number.isFinite(reportGap)) return { error: `Bad total on the first line: "${head[2]}"` };
  const items = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2 || !parts[0]) return { error: `Can't read this line: "${line}"` };
    const gap = num(parts[1]);
    if (!Number.isFinite(gap)) return { error: `Bad number in: "${line}"` };
    if (gap <= 0) return { error: `"${parts[0]}" is ${gap} — only OVER-target lines belong here. Leave under-target lines out.` };
    items.push({ name: parts[0], gap: Math.round(gap * 100) / 100 });
  }
  if (!items.length) return { error: "No subcategory lines followed the month." };
  if (reportGap != null) {
    const sum = Math.round(items.reduce((s, x) => s + x.gap, 0) * 100) / 100;
    if (Math.abs(sum - reportGap) > 1) {
      return { error: `The lines sum to $${sum.toFixed(2)} but the report says $${reportGap.toFixed(2)} — a line is missing or mistyped. They must match within a dollar.` };
    }
  }
  return { ym, items, reportGap };
}

/* Merge KV over the seed. A month present in KV wins outright — that is how
   an entered month replaces a seeded one rather than being averaged with it. */
/* ⚠️ `seed` IS AN ARGUMENT NOW (Aug 8 2026) — see the note above. A caller that
   cannot read the seed passes {} and simply sees fewer historical months, which
   is correct: an unreadable seed must never look like a month with no gaps. */
export async function loadItemGaps(kvGet, seed = {}) {
  let saved = null;
  try { saved = await kvGet(ITEM_GAPS_KEY); } catch { saved = null; }
  return { ...(seed || {}), ...(saved && typeof saved === "object" ? saved : {}) };
}

/**
 * priorMonthGaps(all, ym)
 * The gaps for the month BEFORE `ym` — what the dashboard card wants, since
 * the current month's drilldown does not exist until the month closes.
 *
 * If last month has not been entered yet it falls back to the most recent
 * month on file and marks it `stale`, so the card can say "June 2026" out
 * loud instead of quietly passing off old numbers as current. Returns null
 * when there is nothing at all.
 */
export function priorMonthGaps(all, ym) {
  const want = shift(ym, -1);
  const keys = Object.keys(all || {}).sort();
  if (!keys.length) return null;
  const useKey = all[want] ? want : keys[keys.length - 1];
  const rec = all[useKey];
  if (!rec || !Array.isArray(rec.items) || !rec.items.length) return null;
  const items = [...rec.items].filter((x) => x && Number(x.gap) > 0).sort((a, b) => b.gap - a.gap);
  if (!items.length) return null;
  return {
    ym: useKey,
    label: rec.label || useKey,
    stale: useKey !== want,
    items,
    total: items.reduce((s, x) => s + Number(x.gap), 0),
  };
}
