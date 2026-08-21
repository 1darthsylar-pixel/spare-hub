/* ============================================================================
   holidayPolicy.js — what THIS store does on a holiday.

   ★ LEAF. Imports usHolidays.js and nothing else, so a test can drive the
   whole rule without booting a Worker or a screen.

   ═══ THE PRECEDENCE, WHICH IS THE ENTIRE FILE ══════════════════════════════
   Matt, Aug 21 2026: "build this into the lineup systam so it doesnt need
   entered anymore but leave the option to edit."

   Both halves of that sentence are load-bearing, and they are in tension unless
   the order is written down and tested:

     1. A DATE THE OPERATOR SET WINS. Typed on the Hours screen or pasted from
        ControlPoint. This is "the option to edit", and it has to beat everything
        below or editing does nothing.
     2. Then that holiday's own setting. Christmas Eve opening at 6 while every
        other holiday opens at 10:30.
     3. Then the store's holiday default.
     4. Then nothing at all, and the day is an ordinary trading day.

   ⚠️⚠️ FOUR IS NOT "CLOSED". A store that has said nothing about Thanksgiving
   gets its NORMAL hours, not a shut building. Guessing closed would silently
   delete a trading day from the roster, and a store that has just installed the
   Hub has said nothing about anything. Rule 1: absent means unchanged.

   ⚠️ NOTHING IN THIS FILE KNOWS A TIME. No 10:30, no 4pm, no dollar figure.
   Every number comes from the store's config. Grep this file for a digit that
   is not an index and there should be none.
   ============================================================================ */
import { holidayKeyFor, HOLIDAY_NAMES } from "./usHolidays.js";

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/* Minutes from midnight, or null. Never 0 as a stand-in for "not set" —
   midnight is a real answer, the same scar payRates.js and storeHours.js carry. */
const minute = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? Math.round(n) : null;
};

const money = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/* Guard the read, so an absent or half-written config answers "no policy"
   rather than throwing on a screen mid-shift. */
export function readHolidayPolicy(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const byKeyIn = o.byKey && typeof o.byKey === "object" && !Array.isArray(o.byKey) ? o.byKey : {};
  const byKey = {};
  Object.keys(byKeyIn).forEach((k) => {
    const row = byKeyIn[k];
    if (!row || typeof row !== "object") return;
    /* `closed` beats hours on the same row, matching storeHours.js. */
    if (row.closed) { byKey[k] = { closed: true, baseSales: money(row.baseSales) }; return; }
    /* ⭐⭐ `normal` — THIS DATE IS A HOLIDAY ON THE CALENDAR AND AN ORDINARY
       TRADING DAY IN THIS STORE. Matt, Aug 21 2026: "Black Friday is normal
       hours."

       ⛔ WITHOUT THIS THERE WAS NO WAY TO SAY IT, and the gap was dangerous
       rather than merely missing. A store default of 10:30-4 applies to every
       holiday that has no row of its own, so the moment Gate City set one,
       Black Friday would have quietly become a 10:30-4 day. His ControlPoint
       page has the restaurant trading 6am to 9pm that day. **A busy Friday
       would have been rostered to a five and a half hour window.**

       ⚠️ IT MUST BEAT THE STORE DEFAULT, WHICH `open`/`close` CANNOT DO. Giving
       the row explicit hours would mean copying today's ordinary hours into the
       config, where they would rot the first time the store changed them. This
       says "whatever a normal day is", and stays true afterwards.
       ⚠️ AND IT DROPS `baseSales` WITH THEM, on purpose. A normal-hours day is
       forecast off ordinary days, not off the short-holiday figure.
       ⚠️ `closed` still wins if somebody sets both, because a contradiction
       should fail toward the shut day rather than roster a crew. */
    if (row.normal) { byKey[k] = { closed: false, normal: true, open: null, close: null, baseSales: null }; return; }
    byKey[k] = { closed: false, normal: false, open: minute(row.open), close: minute(row.close), baseSales: money(row.baseSales) };
  });
  return { open: minute(o.open), close: minute(o.close), baseSales: money(o.baseSales), byKey };
}

/* What the store does on `dateIso`, before anything the operator set by hand.
   Returns null when this date is not a holiday, or when the store has said
   nothing that applies to it.

   `source` names which rule answered, so a screen can say "your Christmas Eve
   setting" rather than presenting every day as if it were typed. */
export function holidayDefault(policyRaw, dateIso) {
  if (!isIsoDate(dateIso)) return null;
  const key = holidayKeyFor(dateIso);
  if (!key) return null;

  const p = readHolidayPolicy(policyRaw);
  const own = p.byKey[key];

  if (own && own.closed) {
    return { key, name: HOLIDAY_NAMES[key] || key, closed: true, open: null, close: null,
             baseSales: own.baseSales, source: "holiday" };
  }

  /* ⭐ AN ORDINARY TRADING DAY ANSWERS `null`, WHICH IS THE SAME ANSWER AS "the
     store has said nothing" — and that is exactly right, because the two mean
     the same thing to every caller: use the store's own weekday hours. Saying
     it out loud here is what stops the store default swallowing the day. */
  if (own && own.normal) return null;

  /* ⚠️ THE HOLIDAY'S OWN HOURS FILL IN OVER THE STORE DEFAULT ONE FIELD AT A
     TIME. Christmas Eve opens at 6 and still closes at 4 with everything else,
     so a store that set only `open` on it must not lose its close. */
  const open = (own && own.open != null) ? own.open : p.open;
  const close = (own && own.close != null) ? own.close : p.close;
  const baseSales = (own && own.baseSales != null) ? own.baseSales : p.baseSales;

  /* ⚠️ HALF A WINDOW IS NOT A WINDOW. An open with no close cannot clamp a
     board, and storeHours.js would refuse it anyway. Say nothing instead of
     saying something unusable. */
  if (open == null || close == null || close <= open) {
    return baseSales != null
      ? { key, name: HOLIDAY_NAMES[key] || key, closed: false, open: null, close: null, baseSales, source: "sales-only" }
      : null;
  }
  return { key, name: HOLIDAY_NAMES[key] || key, closed: false, open, close, baseSales,
           source: own ? "holiday" : "store" };
}

/* The final answer for a date: what the operator set, else the policy.

   ⚠️⚠️ `stored` IS A DATE ROW OUT OF storeHours.js, AND ITS PRESENCE ALONE IS
   THE OVERRIDE — not whether its values look sensible. Somebody typed that day
   on purpose, possibly to disagree with the default, and second-guessing it is
   how "leave the option to edit" quietly stops being true. */
export function hoursForHoliday(policyRaw, stored, dateIso) {
  if (stored && typeof stored === "object") {
    const key = holidayKeyFor(dateIso);
    const p = readHolidayPolicy(policyRaw);
    const own = key ? p.byKey[key] : null;
    return {
      key, name: key ? (HOLIDAY_NAMES[key] || key) : "",
      closed: !!stored.closed,
      open: stored.closed ? null : minute(stored.open),
      close: stored.closed ? null : minute(stored.close),
      /* Sales still fall through: an operator typing hours is not saying
         anything about what the day takes. */
      /* ⚠️ A NORMAL-HOURS DAY CONTRIBUTES NO SALES BASIS EITHER, so a typed
         day on it is forecast off ordinary days rather than the short-holiday
         figure. Same reasoning as the read above. */
      baseSales: (own && own.normal) ? null
        : (own && own.baseSales != null) ? own.baseSales : p.baseSales,
      source: "typed",
    };
  }
  return holidayDefault(policyRaw, dateIso);
}

/* Every holiday from a date forward, with what this store would do about each.
   Feeds the screen, so somebody can see a year at a glance and correct one. */
export function holidayPlan(policyRaw, storedDates, fromIso, holidaysFromFn, limit = 12) {
  const stored = (storedDates && typeof storedDates === "object") ? storedDates : {};
  return (holidaysFromFn(fromIso, limit) || []).map((h) => {
    const row = hoursForHoliday(policyRaw, stored[h.iso], h.iso);
    return { ...h, ...(row || { closed: false, open: null, close: null, baseSales: null, source: "none" }) };
  });
}
