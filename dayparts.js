/* ============================================================================
   dayparts.js — Gate City Hub

   WHAT A DAYPART IS, ONCE.

   🐛 WHY THIS FILE EXISTS (Aug 5 2026). Two tools disagreed about the same four
   windows, and nobody noticed because neither used them for arithmetic:

     Setup board          breakfast open-11    lunch 11-2
     Shift Leader Scorecard  breakfast 6-10:30    lunch 10:30-2

   Lunch was 3 hours on one screen and 3.5 on the other. Both were display text,
   so the disagreement cost nothing. The moment filled board cells get turned
   into HOURS, that half hour becomes real money on every Drive Thru and Front
   Counter figure, and the two screens would quote different splits for the same
   day. Matt picked the Scorecard's windows: breakfast really does end at 10:30.

   ⚠️ A NEAR-LEAF. It imports storeConfig.js and NOTHING ELSE, so DailySetup.jsx
   (a React component), ShiftLeaderScorecard.jsx and the engines can all still
   share it without a cycle. storeConfig.js is itself a strict leaf that imports
   nothing, so the chain terminates one step down and cyclecheck confirms it.
   That is the ONLY import allowed here. Adding a second one, especially
   anything React or store.js, brings back the cycle this rule exists to
   prevent. Same rule nameMatch.js and slScorecardDefs.js live under.

   ⚠️ NIGHT HAS NO FIXED END, AND THAT IS DELIBERATE. The store's closing time
   is not the same every day and is not written down anywhere this file could
   trust — CLAUDE.md is explicit that station hours come from Matt and that two
   wrong commits shipped by trusting a stale sheet. So `night` carries a start
   and NO end, and anything measuring it must take the end from the station's
   own posted hours, which the board already carries per station
   ("DT TRADITIONAL (11AM-11PM)"). Guessing one store-wide close would put a made
   up number inside a labor calculation, which is the exact class of thing the
   Aug 5 sweep was hunting.
   ============================================================================ */

import { storeCfg } from "./storeConfig.js";

/* Decimal hours on a 24-hour clock. 10.5 = 10:30.

   ★ NOW READ FROM storeConfig.js (step 2, Aug 11 2026). Same four windows,
   same numbers; a store types its own in rather than having this file edited.

   ⚠️⚠️ THESE ARE *DECIMAL HOURS*. The config holds a SECOND definition of the
   same four windows, `boardPeriods`, in MINUTES from midnight, and the two
   disagree about where breakfast ends — 10:30 here, 11:00 there. That is the
   disagreement this file's header describes. Read the units before touching
   either one; 10.5 and 630 are the same instant and only one of them is right
   for a given caller.

   ⚠️ `night.end` IS STILL null AND MUST STAY null. Everything in the header
   note above about not guessing a store-wide closing time applies exactly as
   it did when these four lines were literals. A config that "helpfully"
   completes it puts an invented number inside a labor calculation. */
/* ★ A FUNCTION BEHIND A GETTER-FREE EXPORT WOULD NOT WORK HERE: DAYPARTS is an
   ARRAY that callers map, filter and index. It is read once per module load and
   the four derived maps below are built from it, so making it live means making
   them live too — see the note on each. */
export const DAYPARTS = storeCfg("stations.dayparts");

export const DAYPART_KEYS = DAYPARTS.map((d) => d.key);
export const DAYPART_BY_KEY = DAYPARTS.reduce((m, d) => { m[d.key] = d; return m; }, {});

/* The display string the two tools were each keeping their own copy of. */
export const DAYPART_WINDOW = DAYPARTS.reduce((m, d) => { m[d.key] = d.window; return m; }, {});
export const DAYPART_LABEL = DAYPARTS.reduce((m, d) => { m[d.key] = d.label; return m; }, {});

/* ★ THE NIGHT COLUMN'S SPECIFIC OUT TIME (Matt, Aug 6 2026: "The out times
   should be specific"). Night deliberately has no global end — stations end
   at 8, 9, 10 or 11PM while the generic label said "5-close" on every row, so
   a closer could not see from the board whether their station runs to 9 or
   to 11. The honest end is whatever posted window the station itself carries.
   Feed this any text containing it ("6AM-11PM", "EXPO 2 (11:15AM-2PM,
   5PM-8PM)") and the night label becomes "5-<last range's end>". With no
   readable window it stays "5-close" — a missing time must never become an
   invented one. */
export function nightWindowFrom(text) {
  const t = String(text || "");
  const re = /(\d[\d:]*\s*[AP]\.?M?\.?)\s*[-–]\s*(\d[\d:]*\s*[AP]\.?M?\.?)/gi;
  let end = null, m;
  while ((m = re.exec(t))) end = m[2];
  if (!end) return "5-close";
  return `5-${end.replace(/[\s.]/g, "").toUpperCase()}`;
}

/**
 * daypartHours(key, stationClose)
 *
 * How long one daypart runs, in hours.
 *
 * `stationClose` is the station's own closing time in decimal hours, and it is
 * REQUIRED for `night` and ignored for the other three.
 *
 * ⚠️ RETURNS NULL RATHER THAN A GUESS when night is asked for with no close.
 * A caller that cannot supply one must render nothing, not a zero and not a
 * default. Zero would quietly shrink a labor total and read as good news, which
 * is the failure mode this whole file is trying to avoid.
 */
export function daypartHours(key, stationClose) {
  const d = DAYPART_BY_KEY[key];
  if (!d) return null;
  if (d.end != null) return d.end - d.start;
  const close = Number(stationClose);
  if (!Number.isFinite(close) || close <= d.start) return null;
  return close - d.start;
}

/* ★ WHICH FOH SECTION A STATION BELONGS TO, for the Drive Thru versus Front
   Counter split (Matt, Aug 5 2026: "I want to know which side needs cut or
   adding").

   ⚠️ ONLY TWO SECTIONS ARE CLAIMED HERE, and the rest are honestly "shared".
   Front Line (window, expo, drinks, desserts) and Dining Room serve both sides
   of the house; assigning their hours to one would make that side look worse
   than it is and the other look better. A reader can act on "Drive Thru is 4
   hours over". Nobody can act on a number that quietly absorbed the expo. */
export const FOH_SIDE_PATTERNS = [
  { side: "dt", label: "Drive Thru",    test: (role) => /^DT\s/i.test(String(role || "")) },
  { side: "fc", label: "Front Counter", test: (role) => /^(REGISTER|TRADITIONAL BAGGER|MOBILE BAGGER)/i.test(String(role || "")) },
];

export function fohSide(role) {
  const hit = FOH_SIDE_PATTERNS.find((p) => p.test(role));
  return hit ? hit.side : "shared";
}

/* ★ A STATION'S OWN CLOSING TIME, off the name the board already shows.
   Roles are written "DT TRADITIONAL (11AM-11PM)" and some carry two windows,
   "EXPO 2 (11:15AM-2PM, 5PM-8PM)". The LAST end time is the close.
   ⚠️ Returns null when the name carries no hours, and the caller must treat
   that as unmeasurable rather than substituting a store default. A station with
   no posted hours is a station nobody has told us about. */
export function stationCloseHour(role) {
  const s = String(role || "");
  const m = s.match(/\(([^)]*)\)\s*$/);
  if (!m) return null;
  let last = null;
  const re = /(\d{1,2})(?::(\d{2}))?\s*(A|P)M?\b/gi;
  let hit;
  while ((hit = re.exec(m[1])) !== null) {
    let h = parseInt(hit[1], 10);
    const min = hit[2] ? parseInt(hit[2], 10) : 0;
    const pm = hit[3].toUpperCase() === "P";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    last = h + min / 60;
  }
  return last;
}

/**
 * fohSideHours({ stations, peopleOf })
 *
 * Scheduled hours on Drive Thru, on Front Counter, and on the stations that
 * serve both. Built from the board a leader already filled in, so it needs no
 * new data entry (Matt, Aug 5 2026: "can you pull the actual hrs from the setup
 * to avoid extra data entry?").
 *
 * `peopleOf` is injected rather than imported: the board's own cell parser lives
 * in DailySetup.jsx, a React component, and this file is a leaf that imports
 * nothing. Same reason SetupByPosition takes its helpers as props.
 *
 * ⚠️ IT COUNTS PEOPLE, NOT CELLS. A handoff cell holds two names and is two
 * people's hours. Counting cells would undercount every relay on the board.
 *
 * ⚠️ `unmeasured` IS RETURNED AND MUST BE SHOWN. Any night cell on a station
 * whose name carries no closing time cannot be measured, and it is left OUT of
 * the totals rather than guessed at. Silently dropping it would make that side
 * look leaner than it is, which on a labor screen means cutting somebody who
 * should have stayed. If unmeasured is above zero the caller has to say so.
 */
export function fohSideHours({ stations, peopleOf } = {}) {
  const out = { dt: 0, fc: 0, shared: 0, unmeasured: 0 };
  const list = Array.isArray(stations) ? stations : [];
  const people = typeof peopleOf === "function" ? peopleOf : () => [];
  for (const st of list) {
    if (!st) continue;
    const side = fohSide(st.role);
    const close = stationCloseHour(st.role);
    for (const d of DAYPARTS) {
      const n = people(st[d.key]).length;
      if (!n) continue;
      const h = daypartHours(d.key, close);
      if (h == null) { out.unmeasured += n; continue; }
      out[side] += n * h;
    }
  }
  return out;
}

/* ============================================================================
   THE DRIVE THRU SHARE OF FRONT-OF-HOUSE, OFF REAL SALES.

   Matt, Aug 5 2026, correcting me: "you actually said earlier to use the real
   sales data to decide". He was right. The Planner budgets DT as a fixed
   percentage of FOH hours, so DT is always exactly on budget by construction
   and the screen can never say which side to cut.

   ⚠️ FC IS CARRY OUT + DINE IN + ON DEMAND. Catering is excluded on purpose:
   it is a scheduled pickup, not a front counter queue, and folding it in would
   move the split without anybody being able to see why.

   ⚠️ TRAILING WEEKS, NOT LAST CALENDAR MONTH. The mix drifts a couple of
   points month to month, and a calendar boundary makes the budget jump on the
   1st for no operational reason. Four weeks tracks the season without one busy
   Saturday moving it.

   ⚠️ IT RETURNS null RATHER THAN A DEFAULT WHEN THERE IS NOT ENOUGH DATA, and
   the caller must show "not enough sales data" instead of a number. Falling
   back to a fixed percentage is how the hardcoded 70 became believable in the
   first place; a second silent default would be the same mistake wearing a
   different hat.
   ============================================================================ */
export const FC_CHANNELS = ["co", "di", "od"];

export function dtShareOfFoh(days, { minDays = 14 } = {}) {
  const rows = days && typeof days === "object" ? Object.values(days) : [];
  let dt = 0, fc = 0, n = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const d = Number(r.dt);
    const f = FC_CHANNELS.reduce((s, k) => s + (Number(r[k]) || 0), 0);
    /* A day with no sales at all is a closed day, not a zero-DT day. Counting
       it would drag the mix toward whichever side happened to be non-zero. */
    if (!Number.isFinite(d) || (d <= 0 && f <= 0)) continue;
    dt += Math.max(0, d);
    fc += f;
    n += 1;
  }
  if (n < minDays || dt + fc <= 0) return null;
  return { share: dt / (dt + fc), days: n, dtSales: dt, fcSales: fc };
}

/* Split a pot of FOH hours by a share. Kept next to the share so the two can
   never disagree about which side the number belongs to — `share` is always
   DT's, never FC's, and that has already been got backwards once in this
   codebase's history with dtPct. */
export function splitFohHours(fohHours, share) {
  /* ⚠️ Number(null) IS 0, AND 0 IS A VALID SHARE. Guarding with Number.isFinite
     alone let a null share through as "0% Drive Thru" and quietly handed every
     FOH hour to Front Counter — a confident wrong answer on a labor screen,
     which is the worst kind. Caught by its own test. This is the SECOND time
     the same trap has fired today; the first was a month with no demand
     variance being graded at the toughest band instead of held. */
  if (fohHours === null || fohHours === undefined || fohHours === "") return null;
  if (share === null || share === undefined || share === "") return null;
  const h = Number(fohHours);
  const s = Number(share);
  if (!Number.isFinite(h) || !Number.isFinite(s) || s < 0 || s > 1) return null;
  return { dt: h * s, fc: h * (1 - s) };
}

/* ── what a daypart LOOKS like ────────────────────────────────────────────
   The four colours the setup board has always drawn its columns in, moved
   down here so the schedule's board view draws the same four and cannot
   drift away from them. Same shape, same hex values, nothing re-picked.

   ⛔ DailySetup.jsx STILL HOLDS ITS OWN COPY as `PERIOD_COLORS`, and that is
   knowingly left for now rather than fixed blind at the end of a long session:
   it is a 5,000-line file more than one session edits, and the collapse is a
   two-line change (delete the const, import this) that deserves its own pass.
   Rule 8 says never define the same function twice and it is right; the reason
   this is a tolerable stopgap and a drifting `normName` was not is blast
   radius. A colour that disagrees is noticed and is cosmetic. Values were
   copied exactly so there is nothing to drift toward in the meantime. */
export const DAYPART_COLORS = {
  breakfast: { text: "#B45309", bg: "#FFFBEB", dot: "#F59E0B" }, // amber
  lunch: { text: "#C2410C", bg: "#FFF7ED", dot: "#F97316" },     // orange
  mid: { text: "#1D4ED8", bg: "#EFF6FF", dot: "#3B82F6" },       // blue
  night: { text: "#4338CA", bg: "#EEF2FF", dot: "#6366F1" },     // indigo
};

export const daypartColor = (key) =>
  DAYPART_COLORS[String(key || "").toLowerCase()] || { text: "#374151", bg: "#F9FAFB", dot: "#9CA3AF" };
