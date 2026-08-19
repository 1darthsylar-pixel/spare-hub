/**
 * setupRows.js — the Hub schedule, turned into Daily Setup import rows.
 *
 * ★★ WHY THIS IS ITS OWN FILE, AND IT IS NOT A TIDY-UP. These three things
 * lived in DailySetup.jsx, which is a `.jsx` — no Node test can import it, and
 * nothing in `checks/` can execute it. So the one path go-live depends on had
 * never run against a real saved week, and a shape mismatch sat in it for days
 * looking exactly like working code. Moving them into a leaf `.js` is the fix
 * to the CAUSE; setupRows.test.mjs is only what the move makes possible.
 *
 * ⚠️ LEAF MODULE, IMPORTS NOTHING. Same rule as scheduleAck.js and
 * scheduleWarnings.js. Pull anything in here and it stops being testable
 * without the browser, which is the whole reason the file exists.
 *
 * ⚠️⚠️ MINUTES BECOME DECIMAL HOURS HERE, AND THIS IS THE ONLY PLACE IT
 * HAPPENS. Everything in scheduleEngine.js and availability.js is minutes from
 * midnight, to match `stations[...].hours`. Everything on the setup board and
 * in both auto-assign engines is decimal hours, because that is what
 * `parseRanges` returns. 570 and 9.5 are the same instant. Getting this
 * backwards puts somebody on at half past nine at night.
 */

// HotSchedules job code -> BOH section. First match wins; anything unmatched
// stays roster-only (or FOH, on auto-split). Order matters: specific -> general.
export const BOH_JOB_MAP = [
  { re: /bread/i, section: 'BREADING' },
  { re: /load|filter|thaw/i, section: 'BREADING' },
  { re: /fry|fries|hash/i, section: 'FRY STATION' },
  { re: /machine/i, section: 'MACHINES' },
  { re: /\bprep\b/i, section: 'PREP' },
  { re: /truck|receiv/i, section: 'TRUCK / RECEIVING' },
  { re: /dish|sanit/i, section: 'DISH / SANITATION' },
  { re: /biscuit|egg|nugget|strip|soup|\bmac\b|secondary/i, section: 'SECONDARY' },
  { re: /board|sandwich/i, section: 'PRIMARY' },
  { re: /primary|point|special/i, section: 'PRIMARY' },
  { re: /kitchen lead|kitchen manager|kitchen mgr/i, section: 'LEADERSHIP' },
  { re: /\bcook\b|kitchen|\bboh\b|grill/i, section: 'SECONDARY' },
];

export function mapJobToSection(job) {
  if (!job) return null;
  const hit = BOH_JOB_MAP.find((j) => j.re.test(job));
  return hit ? hit.section : null;
}

/* ════════════════════════════════════════════════════════════════════════
   🐛 THE BUG THIS FILE WAS OPENED FOR. Found Aug 19 2026, before the button
   was ever unlocked.

   TWO SPELLINGS OF THE SAME DAY, ONE LOOKUP, NO MATCH EVER.

   • A saved week is keyed by the SHORT name. `buildWeek` writes
     `out[d.day] = { iso, sides }` and its callers hand it
     `["Mon","Tue","Wed","Thu","Fri","Sat"]` (ScheduleBuilder.boardDays, from
     the store's own station config).
   • Daily Setup names its days IN FULL: `DAYS = ['Monday', … 'Saturday']`.
     That is what the day picker holds, what the Import tab's dropdown holds,
     and what was handed straight to the lookup below.

   ⇒ `sched.days['Monday']` is `undefined` on a week that has a Monday.
   EVERY day. EVERY week. The button would have answered "the Hub schedule for
   the week of … has nobody on Monday" for a fully built week, and a leader
   would have gone back to pasting HotSchedules lines that no longer exist.

   ⚠️ IT LOOKED FINE BECAUSE IT NEVER RAN. `HUB_SCHEDULE_PULL_READY` is false
   and has been since Aug 14, so nothing has ever called this with a real week.
   A locked path is not a working path, and shipping the unlock on go-live
   morning would have been the first time anyone found out.

   ⚠️ THE FILE ALREADY KNEW. DailySetup.jsx says it in a comment eight hundred
   lines up: "buildDayBoard takes 'Mon'…'Sat'; DAYS holds full names, so
   slice(0,3)". Every other crossing does the slice. This one forgot.

   ★ THE FIX ASKS THE WEEK WHAT ITS DAYS ARE CALLED rather than assuming
   either spelling. A store can rename the keys in its station config (rule
   18), so hardcoding a second Monday→Mon map here would be a third mechanism
   for one fact, and three drift faster than two.
   ⚠️ EXACT MATCH FIRST, ALWAYS. The three-letter compare is the fallback, so a
   store whose config genuinely says "Monday" is answered by its own key and
   never by a guess.
   ⚠️ IT RETURNS THE KEY, NOT THE DAY. A caller that needs to know whether the
   week has the day at all can check for null without reaching into `days`. */
export function dayKeyIn(sched, dayName) {
  const days = sched && sched.days && typeof sched.days === 'object' ? sched.days : null;
  if (!days) return null;
  const want = String(dayName == null ? '' : dayName).trim();
  if (!want) return null;
  if (Object.prototype.hasOwnProperty.call(days, want)) return want;
  /* Three letters is enough to separate all seven English days, and it is the
     same rule the rest of DailySetup already uses. Anything shorter than three
     is not a day name and must not be allowed to match Sat against Sun. */
  const head = want.slice(0, 3).toLowerCase();
  if (head.length < 3) return null;
  const hit = Object.keys(days).find((k) => String(k).slice(0, 3).toLowerCase() === head);
  return hit == null ? null : hit;
}

/* ============ THE HUB SCHEDULE, AS IMPORT ROWS ============
   Turns a week saved by the Schedule tile into exactly what `parseImportText`
   produces, so a published week goes down the SAME path a HotSchedules paste
   does: Preview, Check for changes, Rebuild, the engines, gaps, breaks, undo
   and history all work with no change at all.

   ⚠️⚠️ THE ROWS CARRY JOB CODES, NOT STATIONS, AND THAT IS THE WHOLE POINT.
   The Schedule tile can show a position preview, but the board is authoritative
   on the day: `autoAssignFOH`/`autoAssignBOH` hold the store's locks, the
   leader-per-daypart rule, the trainer spread and the rotation tiebreak. Handing
   them a station would be a second engine quietly overruling the real one. They
   are handed the same thing HotSchedules hands them — who is on, when, and what
   they are certified to do — and they place people themselves.

   ⚠️ ONE ROW PER PERSON. A person cannot hold shifts on both sides of one day —
   the engine shares one `takenToday` set across FOH and BOH for exactly that
   reason — but this merges by id anyway rather than trusting it, because two
   rows for one person would place them twice and both boards would look right.
   ★ PURE (design rule 7). */
export function scheduleRowsFor(sched, dayName) {
  const key = dayKeyIn(sched, dayName);
  const day = key == null ? null : sched.days[key];
  if (!day || !day.sides) return [];
  const byId = new Map();
  ['FOH', 'BOH'].forEach((side) => {
    const shifts = (day.sides[side] && day.sides[side].shifts) || [];
    shifts.forEach((s) => {
      if (!s || !s.name) return;
      const start = Number(s.start) / 60;
      const end = Number(s.end) / 60;
      if (!(end > start)) return;          // never emit a zero or backwards shift
      const job = String(s.job || '');
      const skill = String(s.skillWord || '');
      const section = mapJobToSection(job);
      const block = { start, end, job, skill, section };
      const key2 = String(s.id == null ? s.name.toLowerCase() : s.id);
      const row = byId.get(key2);
      if (row) {
        row.ranges.push({ start, end });
        row.blocks.push(block);
        return;
      }
      byId.set(key2, {
        name: s.name,
        id: s.id == null ? null : String(s.id),
        ranges: [{ start, end }],
        blocks: [block],
        job, skill, section,
      });
    });
  });
  return [...byId.values()].map((p) => {
    p.ranges.sort((a, b) => a.start - b.start);
    p.blocks.sort((a, b) => a.start - b.start);
    p.hours = p.ranges.reduce((t, r) => t + Math.max(0, r.end - r.start), 0);
    /* 🐛 THE PRIMARY JOB IS THE EARLIEST ONE, NOT THE FIRST ONE SEEN.
       `job`/`skill`/`section` used to be frozen from whichever shift happened
       to come first in the stored array, and the array is not time-ordered —
       FOH is read before BOH, and a day's shifts are written in fill order, not
       clock order. So somebody who opened on Fries and closed on Machines could
       land on the roster as a Machines person, and `section` decides which BOH
       board they go to. parseImportText has always taken the earliest block
       with a job; this now matches it, which is the whole promise of this
       function. ⚠️ AFTER the sort, never before. */
    const primary = p.blocks.find((b) => b.job);
    if (primary) {
      p.job = primary.job;
      p.section = primary.section;
    }
    if (!p.skill) {
      const s = p.blocks.find((b) => b.skill);
      if (s) p.skill = s.skill;
    }
    return p;
  });
}
