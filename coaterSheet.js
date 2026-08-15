/* ============================================================================
   coaterSheet.js — HOW MUCH COATER WAS ALLOWED, AND HOW MUCH WENT.

   Matthew Brady (store 01818), Aug 13 2026: "Myself or my director updates the
   # of bags allotted and the manager updates after each daypart the actual
   usage amount. There is also a coater allocation worksheet that has a way to
   add catering volume which increases the amount of coater allocated for each
   day part."

   His sheet is laminated and lives on a wall. One block per day:

       Daypart     # of bags alloted   # of bags used
       Breakfast          5                  6
       Lunch             12                 13
       Afternoon          8                  9
       Dinner            10                 12

   ⚠️⚠️ THE GAP BETWEEN THE TWO COLUMNS IS THE ENTIRE POINT. That Tuesday is
   over on all four dayparts. A screen that stored both numbers and never
   subtracted them would be a worse version of the paper it replaced.

   ═══ WHAT THIS IS NOT ═══════════════════════════════════════════════════════
   ⛔ IT IS NOT THE THAW CABINETS AND MUST NOT BE FOLDED INTO THEM. Both this
   repo's setup guide and the second store's notes said the two were "the same
   shape of problem… one settings screen and one engine, not two." That was
   written before anybody had seen the sheet and it is corrected in both files.
   Cabinets are a MAP of a room, filled in once. This is a DAILY LOG with two
   different writers. Same page, different things.

   ⛔ THERE IS NO CATERING FORMULA IN HERE, AND THAT IS DELIBERATE. Matthew
   named a second worksheet that turns catering volume into extra bags. It was
   asked for and never arrived — Matt, Aug 14 2026: "This is all they gave me."
   ⇒ NOTHING IS INVENTED. A ratio guessed here decides how much product a
   kitchen thaws, and a wrong one is either a shortage at a rush or a bin of
   waste. The director already types the allotment by hand, so the sheet works
   completely without it: on a catering day they type a bigger number, exactly
   as they do on paper today. `catering` below records THAT THERE WAS catering,
   as a note, and computes nothing from it. When the worksheet turns up, the
   suggestion is a layer on top of a thing that already works (rule 16).

   ★ STRICT LEAF. Imports NOTHING. The screen and any future job both read the
   rules from here.
   ============================================================================ */

export const COATER_KEY = "gcfcr-coater-v1";

/* ⚠️ THE DAYPART KEYS ARE THE HUB'S FOUR, AND THE LABELS ARE THE STORE'S.
   Their paper says Breakfast / Lunch / Afternoon / Dinner; the Hub's keys are
   breakfast / lunch / mid / night. They are the same four windows under
   different names, and the NAME is a fact about a store (design rule 18) — it
   comes from `stations.dayparts`, never from a literal in here. The KEY is what
   gets stored, so renaming a label never rewrites a single saved row. */
export const COATER_DAYPARTS = Object.freeze(["breakfast", "lunch", "mid", "night"]);

const clean = (v) => String(v == null ? "" : v).trim();

/* ⚠️ A BLANK IS NOT A ZERO, AND THIS IS THE WHOLE REASON THIS FUNCTION EXISTS.
   "Nobody has written it down yet" and "they used none" are different facts and
   the sheet has to tell them apart — a manager who has not filled dinner in yet
   must not read as a perfect zero-use dinner. Blank stays null. Zero is a real
   answer and is kept. `payRates.js` carries this scar with an hourly rate that
   returned 0 instead of null and made an unknown wage look like free labour. */
export function num(v) {
  if (v === null || v === undefined || clean(v) === "") return null;
  const n = Number(clean(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10) / 10;          // half bags are real; thirds are a typo
}

/* One day's record:
     { allotted: {breakfast: 5, …}, used: {…}, catering: "", by: {…} } */
export function readDay(raw) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const pick = (side) => {
    const src = d[side] && typeof d[side] === "object" ? d[side] : {};
    const out = {};
    for (const k of COATER_DAYPARTS) out[k] = num(src[k]);
    return out;
  };
  return {
    allotted: pick("allotted"),
    used: pick("used"),
    /* Free text on purpose. "3 trays 11am" is what a leader would write on the
       paper margin, and it is more use than a number the Hub cannot price. */
    catering: clean(d.catering),
    by: d.by && typeof d.by === "object" ? d.by : {},
  };
}

export const readSheet = (raw) => {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const days = o.days && typeof o.days === "object" && !Array.isArray(o.days) ? o.days : {};
  return { v: 1, days };
};

export const dayOf = (sheet, iso) => readDay(readSheet(sheet).days[clean(iso)]);

/* ⚠️ LOCAL DATE, NEVER AN ISO SLICE. `toISOString().slice(0,10)` names tomorrow
   after 8pm Eastern, which is the whole evening shift — the exact scar the
   calendar's `dayKey` carries. `en-CA` gives YYYY-MM-DD in the DEVICE's own day,
   which is the day the person standing in the kitchen means. */
export const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? "" : x.toLocaleDateString("en-CA");
};

/* Yesterday and tomorrow, for the arrows either side of the date.
   ⚠️ BUILT FROM THE THREE NUMBERS, NEVER FROM `new Date(iso)`. A bare
   "2026-08-14" is parsed as UTC MIDNIGHT, so west of Greenwich it is already
   the 13th before any arithmetic happens and every arrow lands a day early.
   Feeding the parts to the Date constructor keeps it in the device's own day,
   the same day `dayKey` above hands back, and month and year ends roll on
   their own (Aug 31 + 1 → Sep 1). */
export function shiftDay(iso, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  if (!m) return "";
  return dayKey(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (Number(delta) || 0)));
}

/* ── The number the sheet exists to show ─────────────────────────────────
   ⚠️ null WHEN EITHER SIDE IS BLANK. A variance needs both numbers; inventing
   one to make a row look complete is how a screen reports a store is on plan
   when nobody has counted yet. */
export function varianceOf(day, part) {
  const d = readDay(day);
  const a = d.allotted[part];
  const u = d.used[part];
  if (a === null || u === null) return null;
  return Math.round((u - a) * 10) / 10;
}

/* Over, under or level — for a screen that needs a colour, not a number. */
export function stateOf(day, part) {
  const v = varianceOf(day, part);
  if (v === null) return "blank";
  if (v > 0) return "over";
  if (v < 0) return "under";
  return "level";
}

/* The day's three totals. Dayparts nobody has filled in are SKIPPED rather than
   counted as zero, and `parts` says how many actually carried a pair — so a
   day with one daypart filled cannot read as a whole day on plan. */
export function totalsOf(day) {
  const d = readDay(day);
  let allotted = 0, used = 0, parts = 0;
  for (const k of COATER_DAYPARTS) {
    const a = d.allotted[k], u = d.used[k];
    if (a !== null) allotted += a;
    if (u !== null) used += u;
    if (a !== null && u !== null) parts += 1;
  }
  return {
    allotted: Math.round(allotted * 10) / 10,
    used: Math.round(used * 10) / 10,
    variance: parts ? Math.round((used - allotted) * 10) / 10 : null,
    parts,
  };
}

/* ⚠️ WHO MAY WRITE WHICH COLUMN, MIRRORING THEIR PAPER EXACTLY. Matthew: "Myself
   or my director updates the # of bags allotted and the manager updates after
   each daypart the actual usage amount."
   ⚠️⚠️ THIS IS THE SCREEN'S RULE, NOT A LOCK. Writes go straight to storage the
   same way the rest of the thaw page does, so a determined signed-in person
   could write either column. That is true of every operational number on this
   page today and is not a regression — but do not describe it as enforced, and
   do not put anything personal in this record on the strength of it. */
export const CAN_SET_ALLOTTED_MIN_TIER = 3;
export const CAN_SET_USED_MIN_TIER = 2;
export const canSetAllotted = (tier) => Number(tier) >= CAN_SET_ALLOTTED_MIN_TIER;
export const canSetUsed = (tier) => Number(tier) >= CAN_SET_USED_MIN_TIER;

/* Merge one cell into the sheet and hand back a NEW object. The caller writes
   it. Every other rule here is pure and one that mutated its argument would be
   the odd one out.
   ⚠️ IT NEVER TOUCHES ANOTHER DAY OR THE OTHER COLUMN. Two leaders on two iPads
   filling different dayparts is the ordinary case in a kitchen, and a writer
   that rebuilt the whole day would drop whichever landed first. */
export function withCell(sheet, iso, side, part, value, who) {
  const s = readSheet(sheet);
  const key = clean(iso);
  if (!key || (side !== "allotted" && side !== "used")) return s;
  if (!COATER_DAYPARTS.includes(part)) return s;
  const day = readDay(s.days[key]);
  const next = { ...day, [side]: { ...day[side], [part]: num(value) } };
  if (who) next.by = { ...day.by, [`${side}:${part}`]: clean(who) };
  return { ...s, days: { ...s.days, [key]: next } };
}

export function withCatering(sheet, iso, text) {
  const s = readSheet(sheet);
  const key = clean(iso);
  if (!key) return s;
  const day = readDay(s.days[key]);
  return { ...s, days: { ...s.days, [key]: { ...day, catering: clean(text) } } };
}

/* The last N days that carry anything, newest first — what a leader scans to
   see whether they are drifting over. Days nobody touched are not rows. */
export function recentDays(sheet, n = 7) {
  const s = readSheet(sheet);
  return Object.keys(s.days)
    .filter((iso) => {
      const t = totalsOf(s.days[iso]);
      return t.allotted > 0 || t.used > 0 || readDay(s.days[iso]).catering;
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, Math.max(0, n));
}
