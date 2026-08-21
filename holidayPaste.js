/* ============================================================================
   holidayPaste.js — read a ControlPoint holiday block into store hours.

   ★ LEAF. Imports nothing. The screen calls it and a test drives it; nothing
   in checks/ can execute a .jsx, so the rule about what a paste means has to
   live somewhere a test can reach.

   ═══ WHY ═══════════════════════════════════════════════════════════════════
   Matt, Aug 21 2026: "i don't want to type them in. i want you to."

   He cannot be typed for. Writing store hours needs a signed-in session, and
   hand-writing the store's own database bypasses every writer in
   storeHours.js. So the answer is to make the typing unnecessary: ControlPoint
   already lists every holiday with its hours, and a paste is not typing.

   ⚠️ IT NAMES NO HOLIDAY AND SEEDS NO DATE, same rule as storeHours.js. It
   reads whatever the store pasted. Another operator's Thanksgiving is not this
   one's, and a seeded list would arrive in their repo looking deliberate.

   ═══ WHAT IT READS ═════════════════════════════════════════════════════════
   ControlPoint prints one card per holiday: a name, a MM/DD/YYYY date, then a
   row per ordering channel.

       Labor Day    09/07/2026
       Restaurant (Dine-In, Carry-out, Catering Pick-up)   10:30 am to 4:00 pm
       Drive Thru                                          10:30 am to 4:00 pm
       Curb Side                                            6:00 am to 9:00 pm
       3rd Party Delivery                                  10:30 am to 4:00 pm
       CFA Delivery                                         6:00 am to 9:00 pm
       Catering Delivery                                   Closed

   ⚠️⚠️ THE RESTAURANT LINE IS THE STORE, AND THE OTHERS ARE NOT. What the Hub
   needs is "is the building open, and when", because that is what decides who
   is rostered. A delivery channel is a service running out of the building,
   not the building. Reading the earliest open across all six would have put
   Labor Day at 6:00am off the Curb Side row.

   ⚠️⚠️ AND CURB SIDE AND CFA DELIVERY ARE DEFAULTS, NOT HOURS. Matt, Aug 21
   2026: "those channels are switched off" and "its just a default for control
   point to show". Both read 6:00 am to 9:00 pm on EVERY holiday in his store,
   including days the restaurant shuts at 4pm and days it never opens. A parser
   that averaged, or took the widest, or trusted the first row it met, would
   have produced a store open until 9pm on Christmas Eve.

   ⇒ ONLY the Restaurant row sets the store's hours. Drive Thru is kept
   separately because it genuinely runs later than the dining room on some days
   and that is a station cut, not a store cut.
   ============================================================================ */

/* "10:30 am" → 630. Minutes from midnight, the unit storeHours.js uses. */
export function readClock(s) {
  const m = String(s || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h < 1 || h > 12 || min > 59) return null;
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return h * 60 + min;
}

/* "09/07/2026" → "2026-09-07". Refuses anything else rather than guessing:
   a misread date writes hours onto a day the store is open normally. */
export function readDate(s) {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]), yy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  /* Round-trip it, so 02/30/2026 is refused rather than becoming March 2nd. */
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  const back = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return back === iso ? iso : null;
}

/* The channel a line belongs to, or "" for anything this file does not know.
   ⚠️ MATCHED ON THE START OF THE LINE. "Catering Delivery" and the Restaurant
   row's own "Catering Pick-up" both contain the word catering, and a loose
   `includes` put the delivery row's Closed onto the whole store. */
export function channelOf(line) {
  const s = String(line || "").trim().toLowerCase();
  if (s.startsWith("restaurant")) return "restaurant";
  if (s.startsWith("drive thru") || s.startsWith("drive-thru")) return "driveThru";
  if (s.startsWith("curb side") || s.startsWith("curbside")) return "curbSide";
  if (s.startsWith("3rd party") || s.startsWith("third party")) return "thirdParty";
  if (s.startsWith("cfa delivery")) return "cfaDelivery";
  if (s.startsWith("catering delivery")) return "cateringDelivery";
  return "";
}

const HOURS_RE = /(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s*to\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i;

/* Read a whole pasted block. Returns { days: [...], skipped: [...], error }.
   Never throws: the paste box prints what came back, and a crash there is a
   blank screen mid-shift. */
export function parseHolidayPaste(text) {
  const raw = String(text || "");
  if (!raw.trim()) return { days: [], skipped: [], error: "Nothing was pasted." };

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days = [];
  const skipped = [];
  let cur = null;

  const finish = () => {
    if (!cur) return;
    /* ⚠️ A CARD WITH NO RESTAURANT ROW TELLS US NOTHING ABOUT THE BUILDING.
       Refused by name so somebody can see which one and why, rather than
       silently producing a shorter list than the page they copied. */
    if (!cur.restaurant) skipped.push(`${cur.name || cur.iso}: no Restaurant line, so the store's own hours are not in it`);
    else days.push({
      iso: cur.iso,
      name: cur.name,
      closed: cur.restaurant.closed,
      open: cur.restaurant.closed ? null : cur.restaurant.open,
      close: cur.restaurant.closed ? null : cur.restaurant.close,
      /* Kept, not applied. The screen offers it as a station cut, because the
         drive thru running an hour past the dining room is a real thing and
         the Hub has a place for it. */
      driveThru: cur.driveThru || null,
    });
    cur = null;
  };

  for (const line of lines) {
    /* A holiday card starts wherever a date appears. The name is whatever sat
       in front of it on the same line, which is how ControlPoint prints it. */
    const dm = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dm) {
      const iso = readDate(dm[1]);
      finish();
      if (!iso) { skipped.push(`${dm[1]} is not a date this can read`); continue; }
      cur = { iso, name: line.slice(0, dm.index).trim(), restaurant: null, driveThru: null };
      continue;
    }
    if (!cur) continue;                       // header noise before the first card

    const ch = channelOf(line);
    if (ch !== "restaurant" && ch !== "driveThru") continue;   // see the block above

    if (/\bclosed\b/i.test(line)) { cur[ch] = { closed: true }; continue; }
    const hm = line.match(HOURS_RE);
    if (!hm) continue;
    const open = readClock(hm[1]), close = readClock(hm[2]);
    /* ⚠️ A CLOSE THAT IS NOT AFTER THE OPEN IS REFUSED, not repaired. It means
       the line was misread, and `setDate` would refuse it anyway — better to
       say which day than to hand storeHours a row it rejects silently. */
    if (open == null || close == null || close <= open) {
      skipped.push(`${cur.name || cur.iso}: "${line}" did not read as a pair of times`);
      continue;
    }
    cur[ch] = { closed: false, open, close };
  }
  finish();

  if (!days.length && !skipped.length) {
    return { days: [], skipped: [], error: "No holidays were found in that. Copy the whole block, including the dates." };
  }
  return { days, skipped, error: "" };
}

/* ⚠️⚠️ THE STORE'S OWN RULE, USED AS A CHECK ON THE PAGE.

   Matt, Aug 13 2026: "for holidays we only open 10:30-4 so log that."
   And again, Aug 21 2026: "all holidays close at 4 if open."

   ControlPoint agrees on four of his six open days and disagrees on exactly
   one: Black Friday, which it has trading until 9pm. That is almost certainly
   right — Black Friday is a busy day, not a holiday in the sense he means —
   but "almost certainly" is not a thing to write into the roster silently.

   ⛔ IT FLAGS, IT DOES NOT CORRECT. Guessing 4pm on a day the store actually
   trades until 9 leaves a busy Friday short of everybody; guessing 9pm on a
   day it shuts at 4 rosters a full crew for five hours of a closed building.
   Both are expensive and only the operator knows which. The screen shows it
   before anything is written, which is where a person can settle it. */
export const HOLIDAY_CLOSE = 16 * 60;   // 4:00 pm

export const lateForAHoliday = (d) =>
  !!d && !d.closed && Number.isFinite(d.close) && d.close > HOLIDAY_CLOSE;

/* Which of the parsed days differ from what is already stored, so the screen
   can say "4 new, 3 already right" instead of claiming it changed everything.
   ⚠️ COMPARES AGAINST THE STORED RECORD, not against a previous paste. */
export function newOnly(days, stored) {
  const have = (stored && stored.dates) || {};
  const out = { add: [], same: [], change: [] };
  for (const d of days || []) {
    const cur = have[d.iso];
    if (!cur) { out.add.push(d); continue; }
    const sameClosed = !!cur.closed === !!d.closed;
    const sameHours = d.closed ? true : (cur.open === d.open && cur.close === d.close);
    if (sameClosed && sameHours) out.same.push(d);
    else out.change.push(d);
  }
  return out;
}
