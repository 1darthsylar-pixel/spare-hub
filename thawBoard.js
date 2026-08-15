/* ══════════════════════════════════════════════════════════════════════════
   thawBoard.js — THE THAW NUMBERS, AND A BOARD BUILT FROM THEM.

   ★ STRICT LEAF. Imports nothing. ThawAllocation.jsx imports FROM here.
   It has to be this way round: the tile pulls its allocation out of
   SalesAllocation.jsx, so anything that imported the tile to reach these
   constants would drag the sales reader in behind it.

   Matt, Aug 6 2026, second pass with the sales read hoisted out:

       const targetSales = avgLastTwoFriSat;          // awaited by the caller
       buildThawBoard({ targetSales, doors: 5, spread: true })

   ── WHAT THIS IS FOR, AND WHAT IT IS NOT ──
   ⚠️ IT DOES NOT REPLACE GATE CITY'S DOORS. This store has a real, stated
   layout in ThawAllocation.jsx's CABINETS — which door physically holds what,
   corrected against Matt's own sheet on Aug 6 2026. A computed layout would
   throw that away and start guessing at physical reality.

   buildThawBoard is for a store that has NOT stated one: "I have 5 doors of 14"
   is all a new store should have to say to get a working board. Matt, Aug 6
   2026: "other stores will be different so ill need a box for them."

   ⚠️ CASES, NOT BAGS. Every slot number below is a CASE. A fixed-bag product
   is the exception and occupies exactly one slot while it has any bags at all
   — 3 bags of spicy breakfast thaw in one rack slot, they do not need three.
   ══════════════════════════════════════════════════════════════════════════ */

/* Cases per $1 of allocation, extracted from the CFA sheet.
   ⚠️ MOVED HERE FROM ThawAllocation.jsx, not copied. Two copies of the numbers
   that decide how much chicken thaws overnight would drift, and the drift
   would be invisible until a Saturday ran short. The tile imports these. */
export const DEFAULT_FACTORS = [
  ["Nuggets", 0.00055],
  ["Filets", 0.00027],
  ["Spicy", 0.00018],
  ["Strips", 0.00012],
  ["Grilled Nuggets", 0.00009],
  /* ⚠️ 0.000089 → 0.000074, Matt Aug 6 2026: "change grilled filets to 3".
     At $40,000 the old factor gave 3.56, which rounds to 4 cases, and door 4
     holds only 3 grilled filet shelves — so the tile flagged an overflow on a
     completely normal day. Every other product landed exactly on its shelf
     count; this was the only one out.
     ⚠️ THE NUMBER IS NOT PINNED TO 3, THE FACTOR IS CORRECTED. CFA's own
     workbook splits total shelves by product mix rather than multiplying sales
     by a factor, and its grilled filet share works out to 0.000074034 in these
     terms. Checked both against the workbook across nine sales levels from
     $20k to $70k: the old 0.000089 disagreed at SEVEN of the nine (it said 2
     at $20k, 5 at $60k, 6 at $70k), 0.000074 agrees at all nine. Pinning it to
     3 would have fixed today and stayed wrong on a $60k Saturday. */
  ["Grilled Filets", 0.000074],
  ["Breakfast Filets", 0.000065],
  ["Spicy Breakfast", 0.000037],
];

/* Fixed bag counts — set by Matt, not derived from sales.
   Aug 1 2026, from Adriana: "for the spicy breakfast sometimes we grab just
   3 bags, not the whole case." The par row prints the bag count, the product
   still fills its one slot while the count is above zero, and the number does
   NOT scale with the allocation. */
export const FIXED_BAGS = { "Spicy Breakfast": 3 };

/* A slot label is not always the factor name. Only this one differs today,
   and it is a lookup rather than a rename because "Spicy BRK" is what is
   written on the physical rack. */
export const SLOT_TO_PAR = { "Spicy BRK": "Spicy Breakfast" };

/* A slot label carries a trailing number ("Nuggets 12"); the product does not. */
export const productOf = (label) => String(label == null ? "" : label).replace(/\s*\d+$/, "");

export const DEFAULT_DOORS = 5;
export const DEFAULT_SLOTS_PER_DOOR = 14;

/* ★ FLAVOR TRANSFER ORDER, top of the door to the bottom. Plain, then
   marinated, then spicy.
   ⚠️ THIS IS NOT DEFAULT_FACTORS ORDER AND MUST NOT BE. The factor list has
   Spicy third, which would have loaded spicy filets into the MIDDLE of a door
   with plain filets underneath them. That is not an untidy board, it is spicy
   marinade dripping onto plain chicken, and it is the reason CFA's own
   worksheet fixes the sequence. */
/* ⚠️⚠️ buildThawBoard WAS PLUGGED INTO THE TILE ON AUG 7 2026 AND REVERTED THE
   SAME HOUR. Matt read the board it produced and said "this is wrong. keep the
   way we had." The tile is back on its fixed CABINETS map and this function has
   no caller again — deliberately, not by oversight. Do not re-plug it in until
   the four rules below all hold, because the output broke two of them at once
   and it broke them on the board a leader loads chicken from at 5am.

   THE RULES, in Matt's words, and every one of them is a real operational
   constraint rather than a preference:

   1. "as far as nuggets first then filets" — the order below starts with
      Filets, which is why Thaw 1 came out full of Filets. NUGGETS LEAD.
   2. "there should never 2 brk filets in sep cabinets" — a product MUST NOT
      straddle a door. The generated board put Breakfast Filets 1 in Thaw 1 and
      Breakfast Filets 2 in Thaw 2, which is somebody walking to a second
      cabinet for one case. This is the constraint the packer does not have:
      it fills a door then continues into the next one mid-product.
   3. "keep all same chicken together" (Aug 6) — same rule from the other side.
   4. "there only has to 1 one empty in each cabinet. its supposed to be the
      middle" (Aug 6) — the generated board scattered empties: Thaw 1 had one
      after Filets 9 and three at the bottom, Thaw 5 had seven at the top.

   ⚠️ RULE 2 IS THE HARD ONE AND IT IS WHY THIS IS NOT A ONE-LINE FIX. A product
   that cannot split needs bin-packing, not a fill-and-continue loop, and a
   product bigger than one door has to be allowed to straddle or it can never be
   placed at all. That case needs Matt's answer before any code.

   ✅ RULE 2's MISSING HALF, Matt, Aug 7 2026: "nuggets can straddle, nothing
   else." That is the answer to the question rule 2 could not survive without —
   Nuggets run to 19 cases and no door holds 14, so an absolute no-split rule
   could never place them. Nuggets are the ONE product allowed to continue into
   the next door. Everything else takes a door that fits it whole or does not go
   on the board. */
export const LOAD_ORDER = [
  "Nuggets",
  "Filets",
  "Breakfast Filets",
  "Strips",
  "Grilled Filets",
  "Grilled Nuggets",
  "Spicy",
  "Spicy Breakfast",
];

/* The only product that may continue into the next cabinet. Matt, Aug 7 2026:
   "nuggets can straddle, nothing else."
   ⚠️ A SET OF ONE ON PURPOSE, not a boolean on Nuggets. If a second product ever
   earns the exception it goes here, next to the rule and the quote, rather than
   being discovered as an `|| product === "Something"` three months later. */
export const MAY_STRADDLE = new Set(["Nuggets"]);

/* Anything that has to sit at the BOTTOM of its door, below everything else. */
export const SPICY = new Set(["Spicy", "Spicy Breakfast"]);

const loadRank = (p) => {
  const i = LOAD_ORDER.indexOf(String(p == null ? "" : p));
  return i === -1 ? 99 : i;
};

/**
 * Pars for one allocation. `[name, count, factor, isBags]`, in factor order.
 * A zero or missing allocation gives every product zero rather than a guess:
 * an empty board reads as "no numbers yet", a wrong board reads as a plan.
 */
export function parsFor(targetSales, factors = DEFAULT_FACTORS, fixedBags = FIXED_BAGS) {
  const alloc = Number(targetSales) || 0;
  return (factors || []).map(([name, f]) => {
    const bags = fixedBags ? fixedBags[name] : undefined;
    const count = !alloc ? 0 : (bags != null ? bags : Math.round(alloc * (Number(f) || 0)));
    return [name, count, f, bags != null];
  });
}

/** How many physical slots one par row needs. Bags share a single slot. */
export const caseCount = (par) => {
  if (!par) return 0;
  const [, count, , isBags] = par;
  return isBags ? (Number(count) > 0 ? 1 : 0) : Math.max(0, Number(count) || 0);
};

/**
 * Build a door board for a store that has not stated a physical layout.
 *
 *   buildThawBoard({ targetSales, doors: 5, spread: true })
 *
 * `spread` is the difference between "fill door 1 until it is full" and "share
 * the load". Packed leaves the last doors empty, which is what the doors
 * actually look like on a slow month and is fine if a store wants product
 * grouped. Spread aims every door at the same fill so nobody walks past three
 * empty doors to reach the fourth.
 *
 * ⚠️ A PRODUCT IS ALWAYS CONTIGUOUS AND ALWAYS IN FACTOR ORDER, under both
 * modes. Scattering nuggets across five doors to even out a number would make
 * the board faster to read and slower to actually load, which is backwards:
 * this thing exists to be worked from at 5am.
 *
 * ⚠️ OVERFLOW IS REPORTED, NEVER DROPPED. If the pars need more slots than the
 * doors hold, the extra cases come back in `overflow` rather than silently
 * vanishing off the end of the last door. A short board that looks complete is
 * the failure mode worth spending a field on.
 */
export function buildThawBoard(opts = {}) {
  const {
    targetSales = 0,
    factors = DEFAULT_FACTORS,
    fixedBags = FIXED_BAGS,
    doors = DEFAULT_DOORS,
    slotsPerDoor = DEFAULT_SLOTS_PER_DOOR,
    spread = false,
  } = opts;

  const doorCount = Math.max(1, Math.floor(Number(doors) || 0) || DEFAULT_DOORS);
  const perDoor = Math.max(1, Math.floor(Number(slotsPerDoor) || 0) || DEFAULT_SLOTS_PER_DOOR);
  const pars = parsFor(targetSales, factors, fixedBags);

  /* What each product needs, dropping the ones that need nothing today. A
     product with a zero par is not on the board at all; an empty labelled slot
     would read as "we forgot to load this". */
  /* ⚠️ LOAD ORDER, NOT FACTOR ORDER. See LOAD_ORDER above — sorting by the
     factor list would put spicy in the middle of a door. */
  const need = pars
    .map((p) => ({ product: p[0], slots: caseCount(p) }))
    .filter((x) => x.slots > 0)
    .sort((a, b) => loadRank(a.product) - loadRank(b.product));

  const totalNeeded = need.reduce((s, x) => s + x.slots, 0);
  const capacity = doorCount * perDoor;
  /* Spread aims each door at an equal share of what is ACTUALLY needed.
     ⚠️ CAPPED AT perDoor - 1, NOT perDoor. One shelf in every door is reserved
     for the airflow gap (Matt, Aug 6 2026: "there only has to 1 one empty in
     each cabinet. its supposed to be the middle"), so a door packed to all 14
     would have nowhere to put it. */
  const usable = Math.max(1, perDoor - 1);
  const aim = spread
    ? Math.min(usable, Math.max(1, Math.ceil(totalNeeded / doorCount)))
    : perDoor;

  const built = Array.from({ length: doorCount }, (_, i) => ({ name: `Thaw ${i + 1}`, slots: [] }));
  let placed = 0;
  const overflow = [];

  /* ⚠️⚠️ WHOLE PRODUCTS INTO WHOLE DOORS. THIS IS THE RULE THE FIRST VERSION
     BROKE, AND IT IS WHY THAT ONE WAS REVERTED THE HOUR IT SHIPPED.

     The old loop placed one CASE at a time and hopped to the next door whenever
     the current one filled. That is how Breakfast Filets 1 landed in Thaw 1 and
     Breakfast Filets 2 in Thaw 2 — somebody walking to a second cabinet for one
     case. Matt: "there should never 2 brk filets in sep cabinets", and from the
     other side on Aug 6, "keep all same chicken together".

     A product is now placed as a BLOCK: first fit, in door order, into a door
     with room for ALL of it. If no door can take it whole it does not go on the
     board — it is reported as overflow, which is a leader being told "this will
     not fit" rather than a leader finding half a product two doors away at 5am.

     ⚠️ NUGGETS ARE THE ONE EXCEPTION AND THEY HAVE TO BE. Matt, Aug 7 2026:
     "nuggets can straddle, nothing else." Nuggets run to 19 cases against a
     14-slot door, so an absolute no-split rule could never place them at all.
     They fill door by door in order; everything else is all or nothing.
     ⚠️ ROOM IS MEASURED AGAINST `aim`, WHICH ALREADY RESERVES THE AIRFLOW
     SHELF. Measuring against perDoor would pack a door completely and leave the
     layout step below with nowhere to put the gap. */
  const roomIn = (door) => Math.max(0, aim - door.slots.length);

  need.forEach((item) => {
    if (MAY_STRADDLE.has(item.product)) {
      for (let n = 1; n <= item.slots; n++) {
        const d = built.findIndex((x) => roomIn(x) > 0);
        if (d === -1) { overflow.push(`${item.product} ${n}`); continue; }
        built[d].slots.push(`${item.product} ${n}`);
        placed += 1;
      }
      return;
    }
    const d = built.findIndex((x) => roomIn(x) >= item.slots);
    if (d === -1) {
      for (let n = 1; n <= item.slots; n++) overflow.push(`${item.product} ${n}`);
      return;
    }
    for (let n = 1; n <= item.slots; n++) built[d].slots.push(`${item.product} ${n}`);
    placed += item.slots;
  });

  /* ── Lay each door out properly ─────────────────────────────────────────
     Three rules, and where two of them fight the chicken wins.

     1. SPICY SITS AT THE BOTTOM, below everything else in its door. Flavor
        transfer, not tidiness. Nothing may move it.
     2. ONE AIRFLOW GAP IN THE MIDDLE. Matt: "there only has to 1 one empty in
        each cabinet. its supposed to be the middle."
     3. SAME CHICKEN TOGETHER. Matt: "keep all same chicken together."

     ⚠️ RULES 2 AND 3 FIGHT. Cutting a door at its exact middle shelf splits an
     11-slot run of filets into 6 and 5, and somebody loading top to bottom
     meets the same product twice with a hole in it. So the gap goes to the
     product BOUNDARY NEAREST the middle. On a door holding a single product
     there is no boundary, and the gap goes below it.
     ⚠️ SPARE SHELVES BEYOND THE FIRST GO TO THE BOTTOM, above the spicy block.
     57 shelves of chicken in 70 slots leaves 13 spare, not 5 — "one empty per
     door" cannot absorb them, and stacking the extras mid-door would read as
     four separate gaps nobody asked for. */
  built.forEach((door) => {
    const top = door.slots.filter((s) => s && !SPICY.has(productOf(s)));
    const bottom = door.slots.filter((s) => s && SPICY.has(productOf(s)));
    const blanks = perDoor - top.length - bottom.length;
    if (blanks > 0 && top.length >= 2) {
      const mid = top.length / 2;
      const bounds = [];
      for (let i = 1; i < top.length; i++) {
        if (productOf(top[i]) !== productOf(top[i - 1])) bounds.push(i);
      }
      const cut = bounds.length
        ? bounds.reduce((best, b) => (Math.abs(b - mid) < Math.abs(best - mid) ? b : best), bounds[0])
        : top.length;
      door.slots = [
        ...top.slice(0, cut),
        "",
        ...top.slice(cut),
        ...Array(blanks - 1).fill(""),
        ...bottom,
      ];
    } else {
      door.slots = [...top, ...Array(Math.max(0, blanks)).fill(""), ...bottom];
    }
    while (door.slots.length < perDoor) door.slots.push("");
  });

  return {
    cabinets: built,
    pars,
    totalNeeded,
    capacity,
    placed,
    overflow,
    spread: !!spread,
  };
}

/**
 * Light up a STATED layout from the pars — the Gate City path.
 * Walks the given cabinets in order, renumbers each product 1..N, and fills
 * only the first `par` slots of each, so raising the allocation fills more
 * cells and lowering it empties trailing ones with no hand editing.
 */
export function fillStatedBoard(cabinets, pars) {
  const parMap = Object.fromEntries((pars || []).map((p) => [p[0], caseCount(p)]));
  const parFor = (p) => parMap[SLOT_TO_PAR[p] != null ? SLOT_TO_PAR[p] : p] || 0;
  const capacity = {};
  (cabinets || []).forEach((cab) => (cab.slots || []).forEach((s) => {
    if (s) { const p = productOf(s); capacity[p] = (capacity[p] || 0) + 1; }
  }));
  const running = {};
  const rendered = (cabinets || []).map((cab) => {
    let filledInCab = 0;
    const cells = (cab.slots || []).map((slot, i) => {
      if (!slot) return { key: i, filled: false, product: null, idx: null };
      const p = productOf(slot);
      running[p] = (running[p] || 0) + 1;
      const idx = running[p];
      const filled = idx <= parFor(p);
      if (filled) filledInCab += 1;
      return { key: i, filled, product: p, idx };
    });
    return { cab, cells, filledInCab };
  });
  const placed = Object.keys(capacity).reduce((s, p) => s + Math.min(parFor(p), capacity[p]), 0);
  const short = Object.keys(capacity)
    .filter((p) => parFor(p) > capacity[p])
    .map((p) => ({ product: p, need: parFor(p), have: capacity[p] }));
  return { rendered, capacity, placed, short };
}
