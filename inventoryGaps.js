/* ============================================================================
   inventoryGaps.js — Gate City Hub

   GAP WATCH: the CFA Inventory Activity Report ("gap report"), month by
   month. Actual use vs what the recipes say, per item — the report Matt
   pulls as a PDF and drops on Claude, who parses it and hands back a paste
   block for the Food Cost tile. NOT the Food Cost Drilldown — that report's
   subcategory gaps live in foodItemGaps.js, and the two must never mix
   (that file's own warning).

   WHY HAND-FED: analytics.cfahome.com is SSO-walled with no API. Same
   pattern as foodItemGaps.js — a monthly paste, seeded so the section
   renders real numbers from day one, KV overriding the seed per month.

   WHAT THE FLAGS MEAN:
   - unmapped: CFA's recipe model has no usage for the item (Plush Cows,
     Kids Meal bags), so every case used reads as "missing". Accounting
     noise, not loss — excluded from the "real gap" figure.
   - under-logged waste (derived in the tile, not stored): missing qty is
     real but almost none of it was credited as waste. The team is tossing
     without logging, so waste masquerades as shrink. July's fries: 27.9
     cases missing, 0.75 credited.

   Shape: { [ym]: { label, total, unmappedTotal, items: [{ name, cost,
           qty, used, waste, unmapped? }] } } — top 25 by missing cost.

   PASTE FORMAT (what Claude hands Matt each month — parseGapPaste reads
   exactly this, and the tile's import writes exactly the shape above, so
   editor and renderer cannot drift apart):

     2026-08 | 8701.90
     Potato, Waffle 6/5 Lb Bag | 1054.59 | 27.9 | 780 | 0.75
     Bag, Kids Meal 600 Ct | 362.10 | 10 | 10 | 0 | unmapped

   First line: the month (YYYY-MM), then optionally "| whole-report total" —
   the stored items are only the top 25, so without it the total would read
   as the top-25 sum one month and the full 141-item figure the next.
   Then one line per item:
   name | missing cost | missing qty | used | waste credited [| unmapped]
   ============================================================================ */

export const INV_GAPS_KEY = "gcfcr-inventory-gaps-v1";

/* ⚠️ THE JULY TABLE IS NOT IN THIS FILE ANYMORE. Aug 8 2026.
   It lived here as INV_GAPS_SEED, and FoodCostTracker imports this module for
   the parser and the helpers below, so the numbers rode along into a client
   chunk — $8,701.90 of missing product, itemised, downloadable by anyone who
   loaded the site.
   It now lives in inventoryGapsSeed.js, which only worker.js imports, and
   arrives over the network from GET /api/inventory-gaps-seed behind the same
   gate as the food gaps and the supplier roster.
   ⚠️ DO NOT IMPORT THAT FILE FROM ANY .jsx. One import puts the table back in
   the browser and closes nothing. */

const pad2 = (n) => String(n).padStart(2, "0");

export const invMonthLabel = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return String(ym || "");
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

export const prevYm = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

/* Merge KV over the seed; a month present in KV wins outright. Callers pass
   a RESULT-style value they already guarded — this stays pure.
   ⚠️ THE SEED IS A PARAMETER NOW, NOT AN IMPORT (Aug 8 2026). It arrives from
   the worker, so it is {} until the fetch lands, and {} for good for anyone the
   route refuses. Both read as "fewer historical months", never as a month that
   had no gaps — the caller's `!shown` branch already prints "No months on file
   yet." Guarded rather than defaulted, so a non-object seed merges as empty
   instead of spreading garbage keys over the record. */
export function mergeInvGaps(saved, seed) {
  return {
    ...(seed && typeof seed === "object" ? seed : {}),
    ...(saved && typeof saved === "object" ? saved : {}),
  };
}

/* An item is "waste under-logged" when the missing quantity is real but
   almost none of it was credited as waste — tossing without logging. */
export const wasteUnderLogged = (it) =>
  !it.unmapped && Number(it.qty) >= 2 && Number(it.waste) < Number(it.qty) * 0.15;

/* parseGapPaste(text) → { ym, rec } | { error }
   Reads exactly the paste format documented above. Forgiving about $ signs,
   commas, and blank lines; strict about the things that matter (a real
   month, at least one item, numeric costs). */
export function parseGapPaste(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Nothing pasted." };
  const head = lines[0].split("|").map((p) => p.trim());
  /* 🐛 THE DRILLDOWN GOT IN HERE AND OVERWROTE A MONTH (Aug 6 2026, found off
     Matt's screenshot: the Gap Watch section was showing Bread, Condiments and
     Waffle Potato Fries — subcategories from the OTHER report — with every
     case count at zero).
     `ym` is read by stripping every character that is not a digit or a dash,
     so the header "DRILLDOWN 2026-07 | 4425.66" quietly lost the word
     DRILLDOWN and passed as a valid inventory month. Both files open by
     warning that these two reports must never mix, and then this let them.
     The stored July record became the drilldown's seven subcategories, which
     also buried the real July inventory month (141 items, $8,701.90).
     ⚠️ CHECKED BEFORE THE STRIP, NOT AFTER. Testing the cleaned value can
     never see the word that identifies the wrong report. */
  if (/^\s*DRILLDOWN\b/i.test(lines[0])) {
    return { error: "That is the Food Cost Drilldown block, not the gap report. It belongs in Item Gaps, under \"Paste the drilldown\" — these are two different reports and mixing them overwrites a month." };
  }
  /* 🐛 THE MONTH IS READ STRICTLY, NOT SCRUBBED (Aug 6 2026, second pass).
     This was `head[0].replace(/[^0-9-]/g, "")`, which DELETES every letter — so
     any other report's header sailed through on the month buried inside it.
     The morning fix blocked DRILLDOWN by name, which was blocklisting one known
     mistake; the sweep then found `DAYPART 2026-07` still got in and produced a
     fabricated $4,150.50 of "missing product" with items called "sales
     Breakfast" and "hours Lunch".
     ⚠️ ALLOW-LIST THE OWN FORMAT INSTEAD OF BLOCKLISTING THE OTHERS. This
     report's first line is only ever the month, optionally then "| total". A
     leading word means it is somebody else's block, whether or not we thought
     to name it — which is the only version of this that also stops the NEXT
     report format somebody adds. The DRILLDOWN branch stays purely for its
     better error message, since that is the mix-up that actually happened. */
  const ym = head[0].trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return { error: `The first line must be just the month, as YYYY-MM (got "${lines[0]}"). If that line starts with a word, it is another report's block and belongs somewhere else.` };
  }
  const reportTotal = head[1] != null && head[1] !== ""
    ? Number(String(head[1]).replace(/[$,]/g, ""))
    : null;
  if (head[1] != null && head[1] !== "" && !Number.isFinite(reportTotal)) {
    return { error: `Bad whole-report total on the first line: "${head[1]}"` };
  }
  const items = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("|").map((p) => p.trim());
    /* ⚠️ THREE COLUMNS MINIMUM, and the third is what tells the two reports
       apart. A gap-report line is `name | cost | qty | used | waste`; a
       drilldown line is only ever `name | dollars`. Accepting two columns let
       a drilldown through even without its header, and defaulted qty, used and
       waste to 0 — which is how a record ended up claiming seven items were
       missing zero cases each. Not raised to five: a genuine paste that stops
       after `used` should still land, and by then it cannot be the wrong
       report. */
    if (parts.length < 3) {
      return { error: `Only ${parts.length} column${parts.length === 1 ? "" : "s"} in "${line}". A gap-report line is name | cost | qty | used | waste. If this is the Food Cost Drilldown, it goes in Item Gaps instead.` };
    }
    const num = (s) => {
      if (s == null || s === "") return 0;
      const n = Number(String(s).replace(/[$,]/g, ""));
      return Number.isFinite(n) ? n : NaN;
    };
    const cost = num(parts[1]);
    if (!Number.isFinite(cost)) return { error: `Bad cost in: "${line}"` };
    const it = {
      name: parts[0],
      cost,
      qty: num(parts[2]) || 0,
      used: num(parts[3]) || 0,
      waste: num(parts[4]) || 0,
    };
    if ((parts[5] || "").toLowerCase() === "unmapped") it.unmapped = true;
    if (!it.name) return { error: `Missing item name in: "${line}"` };
    items.push(it);
  }
  if (!items.length) return { error: "The month line was there but no item lines followed." };
  const itemSum = items.reduce((s, x) => s + x.cost, 0);
  const unmappedTotal = items.filter((x) => x.unmapped).reduce((s, x) => s + x.cost, 0);
  return {
    ym,
    rec: {
      label: invMonthLabel(ym),
      total: Math.round((reportTotal != null ? reportTotal : itemSum) * 100) / 100,
      unmappedTotal: Math.round(unmappedTotal * 100) / 100,
      items,
    },
  };
}
