/**
 * l10Schedule.js — Gate City Hub · the L10 cadence, COMPUTED not hardcoded.
 * ---------------------------------------------------------------------------
 * Replaces two frozen strings that had to be hand-edited after every meeting:
 *   · NEXT_L10 in EOSTile.jsx      ("Wed, Jul 15 · 10:00 AM")
 *   · MEETING  in eosTouchIn.js    (same text, second copy)
 * Both said "Wed, Jul 15" forever. Two hardcodes, one fact — so they could
 * also silently disagree. Same bug class as the old `wk -2` stamp and the
 * hardcoded TODAY: a frozen value pretending to be current.
 *
 * THE RULE lives here and nowhere else. Nothing downstream stores a date.
 *
 * TIMEZONE: every instant is anchored to America/New_York WALL CLOCK and
 * re-resolved per occurrence, so 10:00 AM stays 10:00 AM across the DST
 * change in November. Do not "simplify" this to `+ 7 * 864e5` from a fixed
 * anchor — that silently becomes 9:00 AM on Nov 3.
 * ---------------------------------------------------------------------------
 */

import { eosFacilitator } from "./storeConfig.js";

const TZ = "America/New_York";

// ===== THE RULE — the only block anyone should need to edit =====
// Kickoff ran on Wednesdays, briefly moved to Tuesdays, and settled back onto
// WEDNESDAYS (Bri, Jul 27 2026: "we need to adjust the day to Wednesdays at
// 10a… on a regular basis they will stay Wednesdays").
const KICKOFF = [
  { y: 2026, m: 7, d: 15, hh: 10, mm: 0 }, // first L10
  { y: 2026, m: 7, d: 22, hh: 10, mm: 0 },
];
/* First Wednesday of the steady weekly cadence.
   ⚠️ CHANGED Jul 27 2026 FROM Jul 28 (a Tuesday) TO Jul 29 (a Wednesday).
   The Tuesday cadence was one day from starting — `WEEKLY_FROM` was Jul 28 at
   10:00 AM — so this landed with hours to spare. If you ever move the day
   again, do it BEFORE the next occurrence passes, or the Hub will have already
   told four directors the wrong morning.
   ⚠️ AND CHECK THE THREE THINGS THAT DON'T FOLLOW THIS CONSTANT:
     · the two "Wednesdays 10 AM" sentences in `noteOf` just below,
     · the "Wednesday" copy inside EOSTile.jsx (readiness + to-dos panels),
     · the touch-in bot's cron at cron-job.org, which fires the day before. */
const WEEKLY_FROM = { y: 2026, m: 7, d: 29, hh: 10, mm: 0 };
const HORIZON_WEEKS = 60;   // how far ahead to generate; extend when it runs out
const ROLLOVER_HOURS = 3;   // a meeting stays "next" until 3h past its start
// ================================================================

// Facilitator is STATED as Bri. The rotation Bri → Hannah → Matt is
// drafted but NOT confirmed (see READINESS item b-facilitator in EOSTile.jsx),
// so this is deliberately NOT auto-rotated. Wire it here once order + weeks
// are agreed — one change, both consumers pick it up.
// (Kyleeka came out of the rotation Aug 4 2026 when she left the EOS board.)
/* ⚠️ THE NAME LIVES IN ownerSeed.js NOW, read through `eosFacilitator()`, so
   this file and EOSTile.jsx can no longer disagree about who runs the L10.
   Re-exported because two callers already import it from here. */
export const facilitatorName = () => eosFacilitator();

/* ⚠️ NO DANGLING COLON WHEN NOBODY IS NAMED. A store that has not set a
   facilitator gets the sentence left off rather than "Facilitator: ." */
const facilitatorSuffix = () => {
  const who = eosFacilitator();
  return who ? ` Facilitator: ${who}.` : "";
};

export const AGENDA_LINE =
  "Check-in → Scorecard → Rocks → Headlines → To-dos → IDS → Wrap";

// Offset (minutes) of TZ at a given instant. Standard Intl round-trip.
const tzOffsetMin = (d) => {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const { type, value } of f.formatToParts(d)) p[type] = value;
  // hour can format as "24" for midnight in some engines — normalize.
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - d.getTime()) / 60000;
};

// Instant for a wall-clock time in TZ. Date.UTC handles day overflow, so
// { d: 29 + 7 } correctly rolls into the next month.
const fromNY = ({ y, m, d, hh, mm }) => {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMin(new Date(guess)) * 60000);
};

// Every scheduled L10, sorted, de-duped.
const occurrences = () => {
  const list = KICKOFF.map(fromNY);
  for (let i = 0; i < HORIZON_WEEKS; i++) {
    list.push(fromNY({ ...WEEKLY_FROM, d: WEEKLY_FROM.d + i * 7 }));
  }
  list.sort((a, b) => a - b);
  const seen = new Set();
  return list.filter((d) => {
    const t = d.getTime();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
};

// "Wed, Jul 22 · 10:00 AM"
const labelOf = (d) => {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const p = {};
  for (const { type, value } of f.formatToParts(d)) p[type] = value;
  return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}`;
};

const noteOf = (idx, all) => {
  const inKickoff = idx < KICKOFF.length;
  if (inKickoff && all[idx + 1]) {
    return `Then ${labelOf(all[idx + 1])}, then Wednesdays 10 AM going forward.${facilitatorSuffix()}`;
  }
  return `Weekly — Wednesdays 10 AM.${facilitatorSuffix()}`;
};

/**
 * The next L10 relative to `now`.
 * @returns {{ at: Date, isFirst: boolean, label: string, note: string }}
 *   at      — the instant of the meeting
 *   isFirst — true only for the very first L10 (drives the "First L10" badge)
 *   label   — "Wed, Jul 22 · 10:00 AM"
 *   note    — what follows + facilitator
 */
export function nextL10(now = new Date()) {
  const all = occurrences();
  const cutoff = now.getTime() - ROLLOVER_HOURS * 3600e3;
  let idx = all.findIndex((d) => d.getTime() > cutoff);
  if (idx === -1) idx = all.length - 1; // past the horizon — bump HORIZON_WEEKS
  const at = all[idx];
  return { at, isFirst: idx === 0, label: labelOf(at), note: noteOf(idx, all) };
}
