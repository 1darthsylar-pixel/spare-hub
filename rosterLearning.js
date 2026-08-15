/* ══════════════════════════════════════════════════════════════════════════
   rosterLearning.js — WHAT THIS STORE ACTUALLY DOES, read off its own boards.

   Matt, Aug 14 2026: "i want the auto scheduler to learn from the uploaded
   weekly rosters how to assign shifts without any gaps", and "i want the
   scheduler to be smart and learn every week".

   ★ NEAR-LEAF. Imports `shiftHours.js` and nothing else. No storage, no UI, no
   React — the caller hands over boards it has already loaded, so this can be
   run from a test, from the Worker, or from the browser.

   ────────────────────────────────────────────────────────────────────────
   WHAT IT LEARNS, AND WHY EACH ONE
   ────────────────────────────────────────────────────────────────────────
   Every saved Daily Setup week carries a `roster` per day: the shifts
   HotSchedules really produced, in the store's own words.

     coverage   how many people are on at each moment of a weekday. This is the
                answer to "no gaps": the store already staffs a shape that
                works, and the engine's own station-open count is a DIFFERENT
                shape. Where they disagree, the store is right — it has been
                running for years and the station list is a wish.
     shapes     the start/end pairs the store really uses. A generated shift of
                6:15am to 1:45pm is arithmetically fine and nobody works it.
     headcount  how many bodies a weekday takes, front and back.

   ⚠️⚠️ IT LEARNS EVERY WEEK BY ITSELF, WITH NOTHING TO RETRAIN. It reads the
   boards at call time, so the week saved on Sunday is training data on Monday.
   There is no model file, no snapshot, and nothing for anybody to remember to
   refresh — which is the only version of "smart" that survives contact with a
   restaurant.

   ⚠️⚠️ A DAY WITH AN EMPTY ROSTER IS NOT A DAY WITH NOBODY ON IT. Measured
   across the seven saved weeks: 22 day-boards were never imported at all and
   carry `roster: []`. Averaging those in would teach the engine that Saturday
   needs half the staff it needs. They are SKIPPED, and `weeks` reports how many
   real ones an answer came from, so a caller can refuse a thin one.

   ⚠️ THE MEDIAN, NOT THE MEAN. One holiday week with the store shut at 4pm
   drags a mean down across every slot; a median ignores it. With seven weeks
   that matters, and it costs nothing.
   ══════════════════════════════════════════════════════════════════════════ */
import { shiftSpan } from "./shiftHours.js";

/* Quarter hours, the same grid scheduleEngine.js works on, so a curve learned
   here lines up with a need curve computed there without resampling. */
export const SLOT_MIN = 15;
export const SLOTS = (24 * 60) / SLOT_MIN;

export const WEEK_DAYS = Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
/* The three-letter form the schedule engine and availability use. Same order,
   so an index is interchangeable. */
export const SHORT_DAYS = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

const clampSlot = (n) => Math.max(0, Math.min(SLOTS, Math.round(n)));
const toSlot = (hours) => clampSlot((Number(hours) || 0) * 60 / SLOT_MIN);

/* ══════════════════════════════════════════════════════════════════════════
   ★★ READING A WHOLE ROSTER, WHICH IS MORE THAN READING EACH LINE.

   `shiftSpan` fixes a line whose own segments run backwards. It cannot fix a
   line that is a SINGLE segment: "Benjamin Smith 5-11" is 5am-11am or 5pm-11pm
   and the line does not say. On the real Aug 10 kitchen board that is seven of
   twenty-five people on a Friday, every one of them a closer, every one read as
   a morning shift.

   ⇒ THE LIST ITSELF CARRIES THE ANSWER. A HotSchedules roster comes out sorted
   by start time, so a line that appears to start before the line above it is
   the ambiguous case, and shoving it twelve hours forward puts it where the
   sort says it belongs.

   ⚠️⚠️ AND IT IS ONLY APPLIED WHEN THE LIST REALLY IS SORTED. `looksSorted`
   checks the unambiguous lines — the ones with more than one segment, which
   cannot be misread — and only if THOSE ascend is the rule used on the rest. A
   roster somebody hand-edited out of order is left exactly as written, because
   a confident correction to a list that was never sorted would invent shifts.

   ⚠️ REPORTED, NEVER SILENT. `lifted` counts the lines this moved, so a caller
   can show it and a test can assert it. A parser that quietly rewrites its
   input is the thing this whole file exists to fix. */
export function readRoster(lines) {
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => typeof l === "string" && l.trim());
  const spans = rows.map((line) => ({ line, span: shiftSpan(line) }));
  const read = spans.filter((r) => r.span);

  /* Which lines cannot be misread: more than one segment pins them to a half
     of the day. A single-segment line starting at or after noon is also
     unambiguous — nothing shoves it further. */
  const firm = read.filter((r) => r.span.start >= 12 || / \d[^,]*,/.test(r.line));
  const looksSorted = firm.length > 1
    && firm.every((r, i) => i === 0 || r.span.start >= firm[i - 1].span.start - 0.001);

  let lifted = 0;
  const out = [];
  let floor = null;
  for (const r of read) {
    let { start, end } = r.span;
    const ambiguous = start < 12 && !/ \d[^,]*,/.test(r.line);
    if (looksSorted && ambiguous && floor != null && start < floor - 0.001 && start + 12 < 24) {
      start += 12; end += 12; lifted += 1;
    }
    if (end > 24) end = 24;
    if (end > start) { out.push({ start, end }); floor = Math.max(floor == null ? -1 : floor, start); }
  }
  return { shifts: out, unreadable: rows.length - read.length, lifted, sorted: looksSorted };
}

/* Bodies on at each quarter hour, from a list of {start,end} in decimal hours. */
export function coverageOf(shifts) {
  const curve = new Array(SLOTS).fill(0);
  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    const a = toSlot(s.start), b = toSlot(s.end);
    for (let t = a; t < b; t++) curve[t] += 1;
  });
  return curve;
}

/* ⚠️ THE MEDIAN OF EACH SLOT INDEPENDENTLY, not the median week. A store does
   not have a typical week; it has a typical Tuesday lunch. Taking one week's
   whole curve as "the" curve would carry that week's quirks across the day. */
function medianCurves(curves) {
  const out = new Array(SLOTS).fill(0);
  if (!curves.length) return out;
  for (let t = 0; t < SLOTS; t++) {
    const col = curves.map((c) => c[t]).sort((a, b) => a - b);
    const mid = col.length >> 1;
    out[t] = col.length % 2 ? col[mid] : Math.round((col[mid - 1] + col[mid]) / 2);
  }
  return out;
}

const shapeKey = (s) => `${s.start}|${s.end}`;

/* ══════════════════════════════════════════════════════════════════════════
   ★★ THE WHOLE LESSON, from however many weeks of boards the caller has.

   `boards` is `{ "<side>": { "<mondayISO>": { "<DayName>": { roster: [...] } } } }`
   — the shape ScheduleBuilder already loads for its placement memory, so no
   new read is added anywhere.

   Returns, per side per weekday:
     coverage   number[96], bodies on at each quarter hour (median across weeks)
     peak       the highest number in it, and when
     shapes     [{ start, end, count }] sorted by how often the store uses it
     headcount  median number of people on that day
     weeks      how many real rosters this came from  ⚠️ READ THIS
   ══════════════════════════════════════════════════════════════════════════ */
export function learnFrom(boards) {
  const src = boards && typeof boards === "object" ? boards : {};
  const out = {};
  Object.keys(src).forEach((side) => {
    const weeks = src[side] && typeof src[side] === "object" ? src[side] : {};
    out[side] = {};
    WEEK_DAYS.forEach((day, di) => {
      const curves = [];
      const counts = [];
      const shapes = new Map();
      let lifted = 0, unreadable = 0;

      Object.keys(weeks).forEach((wk) => {
        const dayData = weeks[wk] && weeks[wk][day];
        const lines = dayData && Array.isArray(dayData.roster) ? dayData.roster : [];
        /* ⚠️ THE SKIP THAT MAKES THIS HONEST. A board nobody imported has an
           empty roster and means "no data", not "no staff". */
        if (!lines.length) return;
        const { shifts, lifted: lf, unreadable: un } = readRoster(lines);
        if (!shifts.length) return;
        lifted += lf; unreadable += un;
        curves.push(coverageOf(shifts));
        counts.push(shifts.length);
        shifts.forEach((s) => {
          const k = shapeKey(s);
          shapes.set(k, (shapes.get(k) || 0) + 1);
        });
      });

      const coverage = medianCurves(curves);
      let peak = 0, peakAt = 0;
      coverage.forEach((n, t) => { if (n > peak) { peak = n; peakAt = t; } });
      const sortedCounts = counts.slice().sort((a, b) => a - b);

      out[side][SHORT_DAYS[di]] = {
        day, weeks: curves.length, coverage, peak,
        peakAt: peakAt * SLOT_MIN,
        headcount: sortedCounts.length ? sortedCounts[sortedCounts.length >> 1] : 0,
        shapes: [...shapes.entries()]
          .map(([k, count]) => {
            const [start, end] = k.split("|").map(Number);
            return { start, end, count };
          })
          .sort((a, b) => b.count - a.count || a.start - b.start),
        lifted, unreadable,
      };
    });
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ★ WHERE A PROPOSED WEEK FALLS SHORT OF WHAT THE STORE REALLY RUNS.

   Hands back the slots where `have` is under `want`, merged into spans so a
   leader reads "6:00am-8:15am, 2 short" rather than nine consecutive rows.

   ⚠️ SHORT, NOT WRONG. Being under the learned curve is not automatically a
   mistake — a genuinely quieter week should be under it. This says where and by
   how much; deciding is the engine's job and then the leader's.

   ⚠️ `tolerance` IS A COUNT OF PEOPLE, NOT A PERCENTAGE. One body short at 3am
   and one body short at noon are not the same thing, and a percentage makes
   them look the same. */
export function shortfall(have, want, tolerance = 0) {
  const a = Array.isArray(have) ? have : [];
  const b = Array.isArray(want) ? want : [];
  const tol = Math.max(0, Number(tolerance) || 0);
  const spans = [];
  let cur = null;
  for (let t = 0; t < SLOTS; t++) {
    const miss = (b[t] || 0) - (a[t] || 0);
    if (miss > tol) {
      if (!cur) cur = { start: t, end: t + 1, short: miss };
      else { cur.end = t + 1; cur.short = Math.max(cur.short, miss); }
    } else if (cur) { spans.push(cur); cur = null; }
  }
  if (cur) spans.push(cur);
  return spans.map((s) => ({
    startMin: s.start * SLOT_MIN,
    endMin: s.end * SLOT_MIN,
    short: s.short,
  }));
}

/* The learned shape closest to a span the engine wants to fill, so a generated
   shift looks like one somebody would actually be asked to work.
   ⚠️ NULL WHEN NOTHING IS CLOSE, never a nearest-at-any-distance. A four-hour
   hole answered with the store's nine-hour opening shift is a worse shift than
   the arithmetic one it replaced. */
export function nearestShape(shapes, startHr, endHr, maxDriftHr = 1.5) {
  const list = Array.isArray(shapes) ? shapes : [];
  let best = null, bestCost = Infinity;
  list.forEach((s) => {
    const cost = Math.abs(s.start - startHr) + Math.abs(s.end - endHr);
    /* Ties go to the shape the store uses more often. */
    if (cost < bestCost || (cost === bestCost && best && s.count > best.count)) { best = s; bestCost = cost; }
  });
  if (!best) return null;
  return Math.abs(best.start - startHr) <= maxDriftHr && Math.abs(best.end - endHr) <= maxDriftHr ? best : null;
}
