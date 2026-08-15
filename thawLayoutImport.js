/* ══════════════════════════════════════════════════════════════════════════
   thawLayoutImport.js — READ A STORE'S THAW SHEET INTO A CABINET MAP.

   ★ LEAF. Imports nothing. Text in, cabinets out. No storage, no React.

   ═══ WHY THIS EXISTS AND WHY THE GENERATOR DID NOT ════════════════════════
   The Aug 7 sweep (finding 23) called the thaw board a clone blocker: the tile
   draws Gate City's five doors from a literal, so another store's overnight
   thaw is laid out against doors they do not have. The first attempt at fixing
   it GENERATED the board from sales. Matt reverted it within the hour — "this
   is wrong. keep the way we had" — and then said the thing that reframed it:

       "if you mean the same position i had then yes but not fixed in quantity"

   That is the whole model, and the generator had it backwards:

       POSITION is FIXED.   Which product owns which shelf never moves. It is a
                            physical fact about a store's walk-in, decided once.
       QUANTITY is LIVE.    How many of those shelves light up rises and falls
                            with the allocation, every week.

   The tile already does the second half correctly and always has. What a second
   store actually needs is not a computed layout — it is a way to say what THEIR
   shelves hold. So this reads a sheet rather than inventing one.

   ═══ THE FORMAT IS WHAT THE BOARD ALREADY PRINTS ══════════════════════════
   Deliberately: the thing an operator can most easily produce is the sheet they
   already have on the wall, and the thing this app already emits is the same
   shape. Matt pasted exactly this from the live tile on Aug 7:

       THAW 2
       10 cases          <- ignored, it is a running total not a slot
       Breakfast Filets
       2                 <- the case number, ignored; position is what matters
       EMPTY             <- a real gap, and it is KEPT
       Nuggets
       1

   So: a "THAW n" line starts a door, "EMPTY" is a gap, a bare number is the
   case index and is dropped, "N cases" is a total and is dropped, and anything
   else is a product name.

   ⚠️ THE CASE NUMBERS ARE DROPPED ON PURPOSE. The tile renumbers each product
   1..N itself when it renders, so keeping them here would create a second
   source for the same fact — and the two would disagree the first time somebody
   edited a sheet by hand. Position is what is being imported. Nothing else.
   ══════════════════════════════════════════════════════════════════════════ */

const DOOR_RE = /^(?:thaw|door|cabinet)\s*(\d+)\b/i;
/* "10 cases", "10 case", "10" on its own after a door header. The bare-number
   case is handled separately because a number alone is far more often a case
   index than a total. */
const TOTAL_RE = /^\d+\s*cases?$/i;
const NUM_RE = /^\d+$/;
const EMPTY_RE = /^(?:empty|blank|-|—|none)$/i;

/**
 * Parse a pasted sheet into [{ name, slots: [label] }].
 *
 * `slots` holds a product NAME per shelf, or "" for a gap — exactly the shape
 * the tile's CABINETS literal uses, so an imported layout is indistinguishable
 * from the built-in one at the point of use.
 *
 * Returns { ok, cabinets, doors, slots, gaps, products, error }.
 * ⚠️ NEVER THROWS AND NEVER RETURNS A HALF-PARSED BOARD. A layout is a physical
 * description of somebody's walk-in; a partly-read one that still looks like a
 * board is worse than a refusal, because it would be saved and then loaded
 * against at 5am.
 */
export function parseThawLayout(text) {
  const raw = String(text == null ? "" : text);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (!lines.length) return { ok: false, error: "Nothing pasted." };

  const cabinets = [];
  let cur = null;
  const openDoor = (n) => {
    cur = { name: n ? `Thaw ${n}` : `Thaw ${cabinets.length + 1}`, slots: [] };
    cabinets.push(cur);
  };

  for (const line of lines) {
    const door = line.match(DOOR_RE);
    if (door) { openDoor(door[1]); continue; }
    if (TOTAL_RE.test(line)) continue;          // "10 cases" — a total, not a shelf
    if (NUM_RE.test(line)) continue;            // a case index — position is what matters
    /* A slot before any door header means the paste started mid-door, which is
       exactly what happens when somebody copies from the top of the tile: the
       first door's header scrolled off. Open one rather than dropping it. */
    if (!cur) openDoor(null);
    cur.slots.push(EMPTY_RE.test(line) ? "" : line);
  }

  const withSlots = cabinets.filter((c) => c.slots.length > 0);
  if (!withSlots.length) return { ok: false, error: "No shelves found. Paste the sheet including the product names." };

  /* ⚠️ EVERY DOOR MUST BE THE SAME HEIGHT. Doors of different sizes are not a
     thing in these walk-ins, and a short door is far more likely to be a paste
     that lost lines than a real cabinet. Refusing here is the difference
     between "your paste was cut off" and a board silently missing four
     shelves. */
  const sizes = [...new Set(withSlots.map((c) => c.slots.length))];
  if (sizes.length > 1) {
    const detail = withSlots.map((c) => `${c.name}: ${c.slots.length}`).join(", ");
    return { ok: false, error: `The doors came out different sizes (${detail}). Something was cut off — paste the whole sheet.` };
  }

  const products = [...new Set(withSlots.flatMap((c) => c.slots).filter(Boolean))].sort();
  const gaps = withSlots.reduce((n, c) => n + c.slots.filter((s) => !s).length, 0);
  return {
    ok: true,
    cabinets: withSlots,
    doors: withSlots.length,
    slots: sizes[0],
    gaps,
    products,
  };
}

/**
 * Which product names in a layout have no thaw factor behind them.
 *
 * ⚠️ THIS IS THE CHECK THAT MATTERS MOST AND IT IS EASY TO SKIP. productOf()
 * strips a trailing number and the result must match a factor row EXACTLY, or
 * that shelf silently fills against a par of zero — it renders, it looks
 * loaded, and it is never allocated any chicken. The tile's own header already
 * carries that warning for the built-in map. An imported layout is where it
 * will actually bite, because another store writes "CFA Filets" where the
 * factors say "Filets".
 *
 * `known` is the list of factor names. Returns the unmatched product names.
 */
export function unknownProducts(cabinets, known, slotToPar) {
  const map = slotToPar || {};
  const ok = new Set(known || []);
  const seen = new Set();
  for (const c of cabinets || []) {
    for (const s of (c && c.slots) || []) {
      if (!s) continue;
      const base = String(s).replace(/\s*\d+$/, "");
      const mapped = map[base] != null ? map[base] : base;
      if (!ok.has(mapped)) seen.add(base);
    }
  }
  return [...seen].sort();
}
