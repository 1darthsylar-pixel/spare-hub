/* ══════════════════════════════════════════════════════════════════════════
   shiftHours.js — WHAT HOURS A ROSTER LINE MEANS. ONE ANSWER.

   ★ STRICT LEAF. Imports nothing, and must stay that way. DailySetup.jsx (a
   React component), FOHAutoAssign.js and BOHAutoAssign.js all need this, and
   the engines are themselves leaves that DailySetup imports — anything with a
   dependency here would close that graph.

   🐛🐛 WHY THIS FILE EXISTS: THE BOARD AND THE ENGINES READ THE SAME ROSTER
   LINE DIFFERENTLY, AND HAD FOR MONTHS.

   `parseRanges` was defined THREE times — DailySetup.jsx (38 lines) and both
   engines (16 lines each) — and the two versions had drifted. The board ran
   TWO passes; the engines ran one. Measured across 28 real roster forms on
   Aug 7 2026, six parsed differently, and in every single one the BOARD SAW A
   SHIFT AND THE ENGINE SAW NOTHING:

       "5:00 PM 8:00 PM"        board 17-20     engine (none)
       "6:00 AM 2:00 PM"        board 6-14      engine (none)
       "Ana - 5:00 PM 8:00 PM"  board 17-20     engine (none)
       "5:00 A.M. 2:00 P.M."    board 5-14      engine (none)

   Every one is the same shape: two clock times separated by a SPACE instead of
   a dash. The board renders that person's hours; the auto-assign engine treats
   them as having none and cannot place them.

   ⚠️ THE MIGRATION WAS STRICTLY ADDITIVE, which is what made it safe to do
   three hours before open. There is NO input where both versions parse and
   disagree — every dash form is byte-identical, because TIME_RANGE_DASH and
   the engines' TIME_RANGE_RE are the same regex written with different escapes.
   The engines gain shifts they were blind to. Nothing they already read moved.

   ⚠️ `parseClock` was also duplicated three ways but the three were
   behaviourally IDENTICAL — the only difference was single vs double quotes.
   It moved here for the same reason, not because it was broken.

   ⚠️ STILL WRONG, AND DELIBERATELY LEFT ALONE: "5:00a 2:00p" (two clocks,
   space-separated, short meridiem) parses as nothing in BOTH versions, because
   TIME_RANGE_TWOCLOCK requires the a.m./p.m. form and a bare "a"/"p" does not
   match it. That is a real gap, but widening the pattern changes what the
   BOARD reads too, which is a behaviour change nobody has asked for and cannot
   be checked in the window this was done in. Raised, not smuggled in.
   ══════════════════════════════════════════════════════════════════════════ */

/* Two clock tokens joined by a dash: "5-2", "5:00a-2:00p", "11AM-11PM". */
export const TIME_RANGE_DASH = /(\d{1,2}(?::\d{2})?)\s*(am?|pm?)?\s*[-–—]\s*(\d{1,2}(?::\d{2})?)\s*(am?|pm?)?/gi;
/* Two fully-qualified clock times with no dash: "5:00 PM 8:00 PM". This is the
   pass the engines never had. */
export const TIME_RANGE_TWOCLOCK = /(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/gi;

/* One clock token to decimal hours. 10:30 → 10.5. Returns null for anything
   that is not a clock, which is how a name or a station label falls through. */
export function parseClock(tok, mer) {
  const m = (tok || '').match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 24 || min > 59) return null;
  if (mer) {
    const p = mer.toLowerCase().startsWith('p');
    if (p && h < 12) h += 12;
    if (!p && h === 12) h = 0;
  }
  return h + min / 60;
}

/* Pulls every "start-end" range out of a string. Runs two passes: the
   two-clock form first, then the dash form, skipping anything pass 1 already
   consumed so one span cannot be counted twice.
   Without am/pm markers it leans on store hours: opens 5AM, so a bare start of
   1–4 reads as PM, and the end rolls forward past the start. */
export function parseRanges(str) {
  const out = [];
  const seen = new Set();
  const push = (s, e) => {
    if (s == null || e == null || e <= s) return;
    if (e > 24) e = 24;
    const k = `${s}-${e}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ start: s, end: e });
  };

  // Pass 1 — two explicit clock times with am/pm ("5:00 PM 8:00 PM").
  let m;
  const reTwo = new RegExp(TIME_RANGE_TWOCLOCK.source, 'gi');
  const consumed = [];
  while ((m = reTwo.exec(str || ''))) {
    const s = parseClock(m[1], m[2]);
    const e = parseClock(m[3], m[4]);
    push(s, e);
    consumed.push([m.index, m.index + m[0].length]);
  }

  // Pass 2 — dash-joined ranges, skipping spans already consumed by pass 1.
  const reDash = new RegExp(TIME_RANGE_DASH.source, 'gi');
  while ((m = reDash.exec(str || ''))) {
    const overlaps = consumed.some(([a, b]) => m.index < b && m.index + m[0].length > a);
    if (overlaps) continue;
    let s = parseClock(m[1], m[2]);
    let e = parseClock(m[3], m[4]);
    if (s == null || e == null) continue;
    if (!m[2] && s < 5) s += 12;
    if (!m[4]) { while (e <= s) e += 12; }
    push(s, e);
  }

  return out.sort((a, b) => a.start - b.start);
}

/* ══════════════════════════════════════════════════════════════════════════
   ★★ ONE ROSTER LINE → ONE SHIFT, READ IN DAY ORDER.

   Matt, Aug 14 2026: "i want the auto scheduler to learn from the uploaded
   weekly rosters how to assign shifts without any gaps."

   ⚠️⚠️ `parseRanges` ABOVE CANNOT ANSWER THIS AND IT IS NOT A BUG IN IT. It
   answers "what time ranges appear in this text", each one judged on its own.
   That is the right question for a station's posted hours ("6AM-8PM") and for
   an availability line, which are the two things it was written for.

   A HotSchedules roster line asks a different question. It is a sequence of
   contiguous DAYPART SEGMENTS of ONE shift, running forward through the day:

       "Ana Turcios 5-11, 11-2"                  5am → 2pm
       "Brooke Southern 2-5, 5-11"               2pm → 11pm
       "Yasmin Robles Torres 11-2, 2-5, 5-11"    11am → 11pm

   Judged one at a time, that last "5-11" is 5am-11am — which is what the Hub
   reads today, and it puts Yasmin on a morning shift she did not work, EARLIER
   than the segment printed before it. Measured on the real Aug 10 board: it
   misreads any line whose last segment is an evening one, which is every
   closer.

   ⇒ MONOTONIC. Each segment must start at or after the previous one ended; a
   segment that lands earlier is pushed forward by twelve hours. That single
   rule is the whole difference, and it cannot make a morning line worse
   because a morning line already ascends.

   ⚠️ IT DOES NOT TOUCH `parseRanges`, ON PURPOSE. Three engines and the board
   read station hours through that, and a station legitimately shuts and
   reopens ("5:15am-11am, 5pm-8pm") — ascending there too, but the RULE is
   different and quietly changing a shared parser to serve a new caller is how
   a fix in one screen becomes a bug in three.

   ⚠️ RETURNS DECIMAL HOURS, like everything else in this file. The scheduling
   engine works in MINUTES from midnight; convert at the boundary, once.

   ★ MODULE LEVEL AND PURE. */
export function parseShiftSegments(str) {
  const raw = parseRanges(str);
  if (!raw.length) return [];
  /* ⚠️ SORTED BY WHERE THEY APPEAR IN THE TEXT, NOT BY TIME. `parseRanges`
     returns them time-sorted, which is exactly the order this cannot trust —
     a mis-parsed evening segment sorts to the front and takes the whole line
     with it. So the segments are re-found in text order first. */
  const inText = [];
  const seen = new Set();
  const re = new RegExp(TIME_RANGE_DASH.source, "gi");
  let m;
  while ((m = re.exec(String(str || "")))) {
    const one = parseRanges(m[0]);
    if (!one.length) continue;
    const k = `${m.index}`;
    if (seen.has(k)) continue;
    seen.add(k);
    inText.push(one[0]);
  }
  const list = inText.length ? inText : raw;

  const out = [];
  let floor = null;
  for (const seg of list) {
    let { start, end } = seg;
    /* Forward by whole half-days until this segment starts at or after the end
       of the one before it. Two shoves is the ceiling: a third would mean the
       line spans more than a day, which is a bad line rather than a late one. */
    let shoves = 0;
    while (floor != null && start < floor && shoves < 2) { start += 12; end += 12; shoves += 1; }
    /* An end that landed before its own start is the same fix, one level in. */
    while (end <= start && shoves < 3) { end += 12; shoves += 1; }
    if (start >= 24 || end > 24.001) {
      /* Past midnight. The board has no way to draw it and the engine has no
         slot for it, so it is DROPPED rather than clamped — a clamped shift is
         a wrong number that looks right. */
      continue;
    }
    out.push({ start, end });
    floor = end;
  }
  return out;
}

/* The whole shift a roster line describes: first start to last end, or null.
   ⚠️ NULL, NEVER {0,0}. A line nobody could read must be countable as
   unreadable; a zero-length shift at midnight would quietly join the maths. */
export function shiftSpan(str) {
  const segs = parseShiftSegments(str);
  if (!segs.length) return null;
  return { start: segs[0].start, end: segs[segs.length - 1].end };
}
