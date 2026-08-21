/* ══════════════════════════════════════════════════════════════════════════
   trainingPriorities.js — WHAT ORDER THIS STORE DEVELOPS PEOPLE IN, AND
   WHETHER THE BOARD IS ALLOWED TO FILL A TRAINING ROW BY ITSELF.

   ★ NEAR-LEAF. Imports `normCode` from jobCodes.js and NOTHING else, so there
   is one definition of "how a job code is spelled" (rule 8) rather than a
   second normaliser that drifts on the codes hardest to notice — the ones with
   a double space, or a trailing tab out of a spreadsheet paste.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ NOTHING IN THIS FILE NAMES A STATION, A SIDE'S CONTENT, OR A STORE.
   ────────────────────────────────────────────────────────────────────────
   Gate City's list is:  Drinks · Desserts · Inside expo · Window · Bagging DT ·
   Bagging FC · Register FC · Dining Room · Ipos. It lives in KV, typed on a
   screen, and it is NOT in this source. Design rule 18: a clone is a snapshot
   of this repo, so a seeded list would arrive at the next store looking
   deliberate, and "train drinks first" is a claim about ONE kitchen.

   ⚠️ AN EMPTY LIST IS A WORKING STATE. With nothing typed, `priorityRank`
   answers 0 for everything and `trainingGaps` returns []. The board then
   behaves exactly as it did before this file existed: no badges, no
   suggestions, nothing auto-filled. A store that never opens this screen never
   notices it.

   ── THE TWO MODES ──────────────────────────────────────────────────────────
   Matt asked for both (Aug 14 2026: "Add both options"), so the store picks:

     suggest  the board MARKS a placement as training and offers it. A leader
              taps once to accept. Default, and the recommended one — the setup
              is what gets printed and worked from, so nothing lands on it that
              a human did not agree to.
     write    the training row fills itself. Faster, no tap.

   ⚠️ `suggest` IS THE DEFAULT AND AN UNREADABLE RECORD MUST RESOLVE TO IT.
   The safe direction is the one that changes nothing without a person, so a
   malformed `mode` falls back rather than being honoured. Getting this
   backwards would let a corrupt byte start writing names onto a printed board.

   ⚠️ THIS REVERSES A RULE, DELIBERATELY, AND THE OLD ONE IS WORTH KNOWING.
   Matt, Aug 13 2026: "Trainers and training are only for manual edits." That
   held until Aug 14, when he asked for the auto-fill. `suggest` is why both
   things are true at once: the machine proposes, the human still edits.
   ══════════════════════════════════════════════════════════════════════════ */

import { normCode } from "./jobCodes.js";

export const TRAINING_KEY = "gcfcr-training-priorities-v1";

/* Which sides carry their own list. Matt: "a training priorities doc for front
   and back". Same two sides jobCodes.js already uses; not re-derived from it
   because that would import a constant to spell two strings. */
export const TRAINING_SIDES = Object.freeze(["FOH", "BOH"]);

export const MODES = Object.freeze(["suggest", "write"]);
export const DEFAULT_MODE = "suggest";

export const MODE_LABEL = Object.freeze({
  suggest: "Suggest it, a leader taps to accept",
  write: "Fill the training row automatically",
});

/* ── reading a stored record ──────────────────────────────────────────────
   Guarded on every field. This key is new today, so every record is a new
   record — but the same guard is what lets a future version add a field
   without blanking somebody's saved list. Rule 1. */
export function readTraining(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  /* ⚠️ READ BEFORE THE LISTS, because collapsing needs it. A record saved
     before merges existed has none, `readMerges` answers empty groups, and the
     collapse falls straight back to the trailing-number rule — which is exactly
     how this file behaved yesterday. Rule 1. */
  const merges = readMerges(src.merges);
  const sides = {};
  /* ══════════════════════════════════════════════════════════════════════
     ⚠️⚠️ THE LIST AS TYPED IS KEPT NOW, AND IT HAS TO BE.

     Collapsing used to be destructive: the reader collapsed, the screen saved
     what the reader returned, and the rows that had been folded together were
     gone from storage for good. That was survivable while the only rule was
     "a trailing number", because nothing could ever un-fold them.

     It stops being survivable the moment a STORE can declare a merge, because
     it can also change its mind — and an undo that cannot bring the rows back
     is not an undo. Measured while building this: un-merging OT left the list
     at nine because the three OT rows no longer existed anywhere.

     ⇒ `rawSides` is what the store typed. `sides` is the collapsed view every
     caller already means. Both are stored; a record written before today has
     no `rawSides` and falls back to its `sides`, which is the best that record
     can honestly offer. Rule 1.
     ══════════════════════════════════════════════════════════════════════ */
  const rawSides = {};
  TRAINING_SIDES.forEach((side) => {
    const rows = Array.isArray(src.sides && src.sides[side]) ? src.sides[side] : [];
    /* A code listed twice is a leader's typo, not two priorities. Keeping both
       would make position 4 and position 7 the same station and the rank lookup
       would answer whichever came first, silently.

       ⚠️⚠️ COLLAPSED ON READ, NOT ONLY ON PASTE, AND THAT IS THE POINT. Lists
       saved before the one-position rule existed still hold the numbered
       variants. Fixing only `parseList` would leave every list already saved
       showing the repeats until somebody re-pasted it, which is a fix nobody
       sees. See `positionFamily` above for what counts as one position.
       ⚠️ THE STORED RECORD IS NOT REWRITTEN (design rule 1). The reader guards;
       the old shape still reads, and it re-saves collapsed the next time a
       leader touches the list. */
    const typedRows = Array.isArray(src.rawSides && src.rawSides[side]) ? src.rawSides[side] : rows;
    const typed = typedRows.map(normCode).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i);
    rawSides[side] = typed;
    sides[side] = collapseFamilies(typed, merges[side]);
  });
  return {
    v: 1,
    mode: MODES.includes(src.mode) ? src.mode : DEFAULT_MODE,
    sides,
    rawSides,
    merges,
  };
}

export const isWriteMode = (stored) => readTraining(stored).mode === "write";

/* ── editing ──────────────────────────────────────────────────────────────
   Both setters return a WHOLE record rather than mutating, so a caller cannot
   half-save one side and leave the other as whatever was in memory. */

export function setMode(stored, mode) {
  const next = readTraining(stored);
  /* ⚠️ AN UNKNOWN MODE IS REFUSED, NOT COERCED. Silently writing the default
     when a screen sends a typo would look like the save worked and leave the
     store on a setting nobody chose. */
  if (!MODES.includes(mode)) return next;
  return { ...next, mode };
}

/* ── the store declaring a merge ──────────────────────────────────────────
   Both return a WHOLE record, like setMode and setList, so a caller cannot
   half-save. ⚠️ THE LIST IS RE-READ THROUGH readTraining AFTERWARDS, so the
   collapsed list on screen updates in the same breath as the merge — a screen
   showing a merge that has not taken effect yet is the "looks connected,
   serves nothing" failure this repo keeps paying for. */
export function mergeCodes(stored, side, codes) {
  const next = readTraining(stored);
  if (!TRAINING_SIDES.includes(side)) return next;
  const group = (Array.isArray(codes) ? codes : []).map(normCode).filter(Boolean)
    .filter((c, i, a) => a.indexOf(c) === i);
  /* One code is not a merge. Refuse rather than store a group that does
     nothing and reads on screen as if it did. */
  if (group.length < 2) return next;
  /* ⚠️ EVERY CODE LEAVES ITS OLD GROUP FIRST. Without this, merging a code
     that is already in a group would leave it in both, and `familyOf` scans
     top to bottom — so the position it belonged to would depend on the order
     groups happen to sit in. */
  const rest = (next.merges[side] || [])
    .map((g) => g.filter((c) => !group.includes(c)))
    .filter((g) => g.length > 1);
  const merged = { ...next.merges, [side]: [...rest, group] };
  return readTraining({ ...next, merges: merged });
}

/* Undo a merge by naming any code in it. ⚠️ NAMING A MEMBER, not an index: a
   group's position in the array changes every time another one is added, and
   an index that silently points at a different group is the kind of undo that
   deletes the wrong thing. */
export function unmergeCode(stored, side, code) {
  const next = readTraining(stored);
  if (!TRAINING_SIDES.includes(side)) return next;
  const key = normCode(code);
  if (!key) return next;
  const kept = (next.merges[side] || []).filter((g) => !g.includes(key));
  return readTraining({ ...next, merges: { ...next.merges, [side]: kept } });
}

export function setList(stored, side, codes) {
  const next = readTraining(stored);
  if (!TRAINING_SIDES.includes(side)) return next;
  /* ⚠️ THE PASTE IS STORED AS TYPED and collapsed for display. Storing the
     collapsed version is what made the old undo impossible. */
  return readTraining({
    ...next,
    rawSides: { ...next.rawSides, [side]: codes },
    sides: { ...next.sides, [side]: codes },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ MOVE ONE PRIORITY UP OR DOWN. Matt, Aug 21 2026: "these training
   priorities regressed. i had them arranged yesterday."

   ⚠️⚠️ NOTHING HAD REGRESSED, AND THAT IS WHY THIS FUNCTION EXISTS. Read from
   the store's own record: `updatedAt` was Aug 14 and `updatedBy` was his own
   name, and the order on screen matched it name for name. No save had happened
   since. **There was no way to reorder.** The screen offered paste, group and
   split, so a leader who wanted to move row 9 above row 4 had to retype the
   whole list — and anything short of that saved nothing at all.

   ★ A SCREEN THAT SHOWS A NUMBERED LIST LOOKS REARRANGEABLE. That is the whole
   bug: nothing was broken, nothing errored, and the work simply never landed.

   ⛔⛔ IT MOVES INSIDE `rawSides`, NEVER INSIDE THE COLLAPSED VIEW, AND THAT IS
   THE ONE THING THAT COULD LOSE DATA HERE.

   `sides` is a DERIVED, collapsed list — one row per position family. Rebuilding
   `rawSides` from it would drop every code that was folded away, which is
   exactly the destructive collapse `readTraining`'s own note records: "un-merging
   OT left the list at nine because the three OT rows no longer existed anywhere."

   ⇒ So the raw list is grouped by `familyOf` — the SAME function the collapse
   uses, never a second reading of the same question (rule 8) — the two adjacent
   FAMILY BLOCKS are swapped whole, and the blocks are flattened back. Every raw
   code survives, in its family's own internal order.

   ⚠️ THE CODE PASSED IN IS A DISPLAY ROW, so it is a family leader. Any member
   resolves to the same family, so a caller that hands over a folded member
   moves the right block rather than nothing.
   ⚠️ AT EITHER END IT RETURNS THE RECORD UNCHANGED rather than wrapping around.
   A list that jumps from top to bottom under a mis-tap is worse than a button
   that does nothing, and the screen greys the button anyway. */
export function moveInList(stored, side, code, dir) {
  const next = readTraining(stored);
  if (!TRAINING_SIDES.includes(side)) return next;
  const step = dir === "up" ? -1 : dir === "down" ? 1 : 0;
  if (!step) return next;

  const raw = Array.isArray(next.rawSides[side]) ? next.rawSides[side] : [];
  const groups = next.merges[side] || [];
  const want = familyOf(code, groups);
  if (!want) return next;

  /* Family blocks in first-appearance order — the same order the collapsed
     view is built in, so a row's position on screen IS its block's index. */
  const order = [];
  const blocks = new Map();
  for (const c of raw) {
    const fam = familyOf(c, groups);
    if (!fam) continue;
    if (!blocks.has(fam)) { blocks.set(fam, []); order.push(fam); }
    blocks.get(fam).push(c);
  }

  const at = order.indexOf(want);
  const to = at + step;
  if (at < 0 || to < 0 || to >= order.length) return next;
  order[at] = order[to];
  order[to] = want;

  return setList(next, side, order.flatMap((fam) => blocks.get(fam)));
}

/* Paste a list straight out of the spreadsheet it lives in today.
   Every shape that sheet and its exports produce:
       "1,Drinks"      a CSV row, which is what Sheets copies
       "1. Drinks"     a numbered list
       "1\tDrinks"     a tab, which is what a browser copy produces
       "1 Drinks"      a number and a space
       "Drinks"        just the name, in order

   ⚠️ THE LEADING NUMBER IS DROPPED, NOT TRUSTED. Order comes from the order the
   lines arrive in, so a list hand-numbered 1,2,4,5 still ends up contiguous
   rather than leaving a hole at 3 that nothing can ever fill.

   ⚠️⚠️ BUT "1 Drinks" AND "2 Sided Prep" ARE THE SAME SHAPE, AND ONE OF THEM IS
   A STATION NAME. Stripping a leading digit line by line quietly turns a
   station called "2 Sided Prep" into "Sided Prep", and a priority list that
   points at a station nobody has is a list that trains nobody — silently, with
   a green save. So numbering is decided for the WHOLE PASTE, not per line:
     · a digit followed by real punctuation (`.`, `)`, `,`, tab) is a list
       marker whatever else is going on. No station name contains that.
     · a digit followed only by a SPACE counts as numbering ONLY IF every
       non-blank line starts that way AND the numbers ascend. One block of
       station names cannot accidentally look like that; a numbered list always
       does.
   Anything else is taken verbatim, which is the direction that keeps a real
   name intact. */
const MARKED = /^\s*\d+\s*[.),\t]\s*/;      // unambiguous: digit + punctuation
const SPACED = /^\s*(\d+)\s+(?=\S)/;         // ambiguous: digit + space only

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ONE POSITION, NOT THREE COPIES OF IT.

   Matt, Aug 14 2026, reading his own front list back: "for training don't
   repeat positions. For example you only need expo once or register once."

   His board runs REGISTER 1, REGISTER 2 and REGISTER 3, and EXPO 1 and EXPO 2.
   Those are PLACES TO STAND, not things to learn. Somebody trained on a
   register is trained on all three, so listing them separately makes a training
   plan that says "learn register, then learn register, then learn register" and
   pushes everything genuinely different three rows further down.

   ⚠️⚠️ A TRAILING STANDALONE NUMBER, AND NOTHING CLEVERER. Deliberately the
   narrowest rule that covers what he pointed at:
     REGISTER 1 → REGISTER      OT 1 → OT        EXPO 2 → EXPO
   and it leaves alone every name where a digit means something:
     MACHINES 1,2,3 — DT LEAD   BOARDS 1 SANDWICHES   HASH / P FRY
   ⇒ `MACHINES 1,2,3` and `MACHINES 4,5` therefore stay two entries. They may
   well be one position too, but they are two DIFFERENT sets of machines with
   different leads, and guessing that from a string is how a rule stops being
   predictable. If the store wants those merged it is a real answer from them,
   not a regex.

   ⚠️ A NAME THAT IS ONLY A NUMBER KEEPS ITS NAME. Stripping "1" to "" would
   collapse every numeric station onto one empty family. */
export function positionFamily(code) {
  const key = normCode(code);
  if (!key) return "";
  return key.replace(/\s+\d+$/, "") || key;
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE STORE SAYING "THESE TWO ARE ONE POSITION".

   Matt, Aug 14 2026: "training list priorities arent correct either", and
   asked whether the machine should guess harder or he should say it, he chose
   saying it.

   ⚠️⚠️ AND THAT IS THE RIGHT ANSWER, NOT THE LAZY ONE. `positionFamily` above
   can only see a trailing number, so REGISTER 1/2/3 collapse and nothing else
   does. Widening it was the alternative and every widening breaks something
   real on this store's own board:
     · first word    → INSIDE EXPO and EXPO 1 stop being the same position
     · before a "/"  → merges HASH / P FRY with HASH/S FRY (right) and nothing
                       at all for TRADITIONAL BAGGER vs MOBILE BAGGER (wrong)
   Which stations are one training position is a fact about a BUILDING. Design
   rule 18: the store types it once, on a screen, or it stays wrong.

   Shape: `merges[side]` is an array of groups, each group an array of codes.
   The FIRST code in a group is the one the collapsed list shows, for the same
   reason `collapseFamilies` keeps the first member — a real station name still
   matches the board, and an invented family name would make every collapsed
   row read as a typo.

   ⚠️ A CODE IN TWO GROUPS BELONGS TO THE FIRST. Not an error worth refusing a
   save over; the later group simply does not claim it, which is what a reader
   scanning top to bottom would expect.
   ══════════════════════════════════════════════════════════════════════════ */
export function readMerges(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  TRAINING_SIDES.forEach((side) => {
    const groups = Array.isArray(src[side]) ? src[side] : [];
    const claimed = new Set();
    out[side] = groups
      .map((g) => (Array.isArray(g) ? g : [])
        .map(normCode)
        .filter((c) => c && !claimed.has(c))
        .filter((c, i, a) => a.indexOf(c) === i))
      /* A group of one merges nothing and would only clutter the screen. */
      .filter((g) => g.length > 1)
      .map((g) => { g.forEach((c) => claimed.add(c)); return g; });
  });
  return out;
}

/* Which position a code belongs to, the store's own answer first.
   ⚠️ THE MERGE WINS OVER THE NUMBER RULE. A store that has said "REGISTER 1 and
   HOSPITALITY are one position" means it, however odd that looks from here. */
export function familyOf(code, groups) {
  const key = normCode(code);
  if (!key) return "";
  const list = Array.isArray(groups) ? groups : [];
  for (const g of list) if (g.includes(key)) return g[0];
  /* ⚠️⚠️ A DECLARED MERGE ABSORBS THE GUESS, it does not fight it. Found by
     this file's own test: with REGISTER 1 named in a group, REGISTER 2 fell
     back to the trailing-number family "REGISTER" and became a SECOND position
     — so declaring a merge silently SPLIT a station family that had been one
     position a moment earlier. The store never said REGISTER 2 was separate.
     ⇒ A code whose number-family matches a group member's number-family joins
     that group. The two rules compose instead of contradicting. */
  const fam = positionFamily(key);
  for (const g of list) if (g.some((c) => positionFamily(c) === fam)) return g[0];
  return fam;
}

/* Collapse a list so each POSITION appears once, keeping the store's own order
   and the first spelling they typed.
   ⚠️ THE FIRST MEMBER IS KEPT, NOT THE FAMILY NAME. "REGISTER 1" is a station
   this store really runs, so the row still matches the board, still finds its
   section, and still fails the "not on your board yet" check honestly.
   "REGISTER" is a word nobody has a station for, and putting it in the list
   would make every collapsed row look like a typo. */
export function collapseFamilies(codes, groups) {
  const seen = new Set();
  const out = [];
  (Array.isArray(codes) ? codes : []).forEach((c) => {
    const fam = familyOf(c, groups);
    if (!fam || seen.has(fam)) return;
    seen.add(fam);
    out.push(normCode(c));
  });
  return out;
}

function looksNumbered(lines) {
  if (lines.length < 2) return false;        // one line is never proof of a list
  let prev = null;
  for (const line of lines) {
    if (MARKED.test(line)) continue;         // already unambiguous, not evidence either way
    const m = line.match(SPACED);
    if (!m) return false;
    const n = Number(m[1]);
    if (prev != null && n <= prev) return false;
    prev = n;
  }
  return prev != null;
}

export function parseList(text) {
  const codes = [];
  const problems = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = looksNumbered(lines);

  lines.forEach((line) => {
    /* ⚠️ A LINE THAT IS ONLY DIGITS IS A STRAY CELL, NOT A STATION. It is what
       a copy of the NUMBER COLUMN on its own produces, and it is the one shape
       the whole-paste rule above must not take verbatim: "7" carries no name,
       so storing it puts a code in the list that no station can ever match and
       the priority silently points at nothing. Reported, so it is visible. */
    if (/^\d+$/.test(line)) { problems.push(line); return; }
    let body = line;
    if (MARKED.test(body)) body = body.replace(MARKED, "");
    else if (numbered) body = body.replace(SPACED, "");
    const code = normCode(body);
    if (!code) { problems.push(line); return; }
    if (codes.includes(code)) { problems.push(line); return; }
    codes.push(code);
  });
  /* ⚠️ THE COLLAPSE IS NOT A "PROBLEM" AND IS NOT REPORTED AS ONE. Pasting the
     numbered variants of one position is a leader copying their board
     correctly; the tool folding them together is the tool doing its job, not
     the leader making three mistakes. `problems` drives a red "could not be
     read" line, and putting a normal, intended collapse in it would be
     scolding. The saved count in the green line already says how many landed. */
  return { codes: collapseFamilies(codes), problems };
}

/* ── asking about it ──────────────────────────────────────────────────────*/

/* Where a code sits on a side's list. 1-based, because it is shown to a human
   as "priority 3" and an off-by-one there is a wrong answer on a printed page.
   0 means "not on the list", which is NOT the same as last: an unlisted
   station is one nobody has ranked, so nothing should stretch anybody into it
   ahead of a station somebody did rank. */
export function priorityRank(stored, side, code) {
  const list = readTraining(stored).sides[side] || [];
  /* ⚠️ MATCHED BY POSITION FAMILY, so somebody put on REGISTER 3 gets the rank
     the store gave REGISTER, not 0. The list keeps one member per position now,
     so an exact match would answer "not on the list" for every register but the
     one that happened to be typed first. */
  const fam = positionFamily(code);
  if (!fam) return 0;
  const i = list.findIndex((c) => positionFamily(c) === fam);
  return i < 0 ? 0 : i + 1;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️⚠️ WHAT SOMEBODY "ALREADY DOES" COMES IN AS A PLAIN SET OF NAMES, AND THE
   CALLER DECIDES WHERE IT CAME FROM. That is not indecision, it is the
   measured answer to a real problem in this store's data.

   Measured Aug 14 2026 against the live database:
     · `gcfcr-skills-v1` holds THIRTEEN codes, and exactly one of them is front
       of house: DRIVE THRU, held by 67 people. The front board runs TWENTY-FIVE
       stations. So a certification cannot tell WINDOW from REGISTER 1 from OT
       CAPTAIN, and "have they got a certification for this station" answers NO
       for everybody on the entire front.
     · The saved boards can. Six weeks of them: David has stood at 15 distinct
       front stations across 51 shifts, Pablo 14 across 63, Jocelyn 15 across 42.

   ⇒ Matt chose the boards (Aug 14 2026), so the schedule feeds this from
   `placementMemory().rolesOf(id)`. The certification path still works and
   `heldCodes` is still here for it — the two are one Set apart, so the day the
   front gets a proper skill list nothing in this file changes.

   ⚠️ A SET, NOT A RECORD, IS THE WHOLE POINT. A function that took "a record"
   and guessed which kind it was would be one bad guess away from answering
   "trained on everything" for a shape it did not recognise, which fails in the
   direction that silently trains nobody.
   ══════════════════════════════════════════════════════════════════════════ */

/* Normalise whatever the caller passed into a Set of codes. Accepts a Set, an
   array, or nothing. ⚠️ NOTHING MEANS NOTHING HELD, not "everything" — the
   caller has to be able to hand over an empty history without it reading as a
   fully trained person. */
function asHeld(held, groups) {
  const src = held instanceof Set ? [...held] : (Array.isArray(held) ? held : []);
  return new Set(src.map((c) => familyOf(c, groups)).filter(Boolean));
}

/* Every code somebody is certified on, however weakly. The CERTIFICATION source.
   ⚠️ READS `rec.jobs`, THE SHAPE THE SKILLS IMPORT WRITES: an object of
   CODE → skill word, keyed by roster id one level up. A record with no `jobs`
   key is somebody nobody has rated yet, and that answers [] rather than
   throwing — which is most of a brand new store. */
export function heldCodes(rec) {
  const jobs = rec && typeof rec === "object" && rec.jobs && typeof rec.jobs === "object" ? rec.jobs : {};
  return Object.keys(jobs).map(normCode).filter(Boolean);
}

/* Does putting this person here mean they are training?
   ⚠️⚠️ "HAS NEVER DONE IT" IS THE TEST, NOT "IS BELOW ADVANCED". Matt's setup
   rule says to put people in positions they are not as strong in, so the wider
   test is tempting — but almost nobody is strong at almost everything, so it
   badges most of the board most of the day, and a badge that is always on is a
   badge nobody reads. How much of their time they have spent somewhere still
   steers WHO gets picked; it just does not decide what the word means. */
export function isTrainingPlacement(held, code, groups) {
  /* ⚠️ BY POSITION FAMILY. Somebody certified on one numbered spot of a station
     is not learning anything by standing at the next one along, and badging
     that as training would put an L on most of the front board every day.
     `asHeld` families what they hold, this families where they are standing. */
  /* 🐛🐛 THE STORE'S OWN MERGES WERE IGNORED HERE, AND THIS IS THE ONE PLACE
     THEY MATTER MOST. `readMerges` exists precisely because the trailing-number
     guess gets some boards wrong — see its header for the worked example. A
     store types the groups on the Training tab, and then the function deciding
     whether a placement IS training asked the guess anyway. So somebody already
     rated on one row of a declared pair still badged as learning the other, on
     a printed board, for ever.

     ⚠️ NO STATION NAMES IN THIS FILE. A test asserts that every function here
     is free of them, because they are one store's data and this code ships to
     all of them (rule 18). The example lives in the merge header, where it is
     phrased against no particular board.

     ⇒ `familyOf` composes both rules already — an explicit group first, then
     the trailing-number family, then the code itself. Asking it on BOTH sides
     is the whole fix: what they hold and where they are standing have to be
     familied the same way or the comparison is meaningless. That is why
     `asHeld` takes the groups too.

     ⚠️ `groups` IS OPTIONAL AND ABSENT IS THE OLD BEHAVIOUR, BYTE FOR BYTE.
     `familyOf(code, undefined)` falls straight through to `positionFamily`,
     so every existing caller is unaffected (rule 1). */
  const key = familyOf(code, groups);
  if (!key) return false;
  return !asHeld(held, groups).has(key);
}

/* The positions this person should learn next, best first.
   Only codes on the store's list for that side, only ones they do not already
   do, in the store's own order. Empty when the store has typed no list, when
   they already do everything on it, or when the record is unreadable. */
export function trainingGaps(held, side, stored) {
  /* 🐛 THE SAME MERGE BUG THAT LIVED IN `isTrainingPlacement`, one function
     down. This read the store's own groups to COLLAPSE the list and then
     compared against the trailing-number guess, so a person already rated on
     one half of a declared pair was still told to go and learn the other half.
     ⇒ One record, one set of groups, `familyOf` on both sides. */
  const rec = readTraining(stored);
  const list = rec.sides[side] || [];
  const groups = rec.merges[side];
  const have = asHeld(held, groups);
  return list.filter((code) => !have.has(familyOf(code, groups)));
}

/* The single next one, or "" when there is nothing to train them on. A
   convenience over trainingGaps so callers do not each write `[0] || ""` and
   one of them forgets the guard. */
export function nextToTrain(held, side, stored) {
  return trainingGaps(held, side, stored)[0] || "";
}
