/* ══════════════════════════════════════════════════════════════════════════
   timeOff.js — WHO ASKED FOR A DAY OFF, AND WHO SAID YES.

   ★ STRICT LEAF. Imports NOTHING, and must stay that way. scheduleEngine.js
   reads it while deciding a week and has to stay runnable outside React, the
   way FOHAutoAssign.js is. No React, no store.js, no component, ever.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ DATES ARE ISO STRINGS AND ARE COMPARED AS STRINGS. NO `Date` OBJECTS.
   ────────────────────────────────────────────────────────────────────────
   "2026-08-20" <= "2026-08-21" is true by plain string comparison, because ISO
   dates sort the same way they read. So a range test is `iso >= from && iso <=
   to` and nothing else.

   That is not a shortcut, it is the safest available answer. The moment a
   `new Date("2026-08-20")` appears in this file it is parsed as UTC midnight,
   which in this timezone is the EVENING OF THE 19TH — so a day off asked for on
   the 20th blocks the 19th, in summer only, and looks fine in every test run in
   the morning. The Hub already has `fromIso` for when a real Date is needed;
   nothing here needs one, so nothing here builds one.

   ⚠️ ONE DAY OFF IS `from === to`. There is no separate single-day shape. Two
   shapes for one idea is how a renderer ends up reading a field the editor
   never writes.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ ONLY "approved" BLOCKS A SHIFT. Pending does not, and that is deliberate.
   ────────────────────────────────────────────────────────────────────────
   A request nobody has answered is not a promise. If pending removed somebody
   from the schedule, anyone could take a day off by asking for it and never
   being told no — and the leader would never see the hole, because the week
   would build around it and look complete.

   ⇒ So the screen has to show a leader what is still pending BEFORE they build,
   which is the whole reason `pendingCount` exists.
   ══════════════════════════════════════════════════════════════════════════ */

export const TIMEOFF_KEY = "gcfcr-timeoff-v1";

export const STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  DENIED: "denied",
});

/* Guard the read. A key written before `v` existed, or a bare array from some
   future hand-edit, still reads. Design rule 1. */
export function readTimeOff(raw) {
  if (Array.isArray(raw)) return { v: 1, requests: raw };
  if (!raw || typeof raw !== "object") return { v: 1, requests: [] };
  return { v: raw.v || 1, requests: Array.isArray(raw.requests) ? raw.requests : [] };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s) => ISO_RE.test(String(s || ""));

/* Does a request cover this date? Approved requests only — see the header. */
export function coversDate(req, iso) {
  if (!req || req.status !== STATUS.APPROVED) return false;
  const from = String(req.from || ""), to = String(req.to || from);
  if (!isIsoDate(from) || !isIsoDate(to)) return false;
  return iso >= from && iso <= to;
}

/* Everybody approved off on one date. Returns a Set of member ids as strings.
   ⚠️ IDS, NOT NAMES. Two people called Camila is not a hypothetical on this
   roster, and a name-keyed day off would give one of them the other's. */
export function offIdsOn(store, iso) {
  const out = new Set();
  if (!isIsoDate(iso)) return out;
  (readTimeOff(store).requests || []).forEach((r) => {
    if (coversDate(r, iso) && r.memberId != null) out.add(String(r.memberId));
  });
  return out;
}

/* The same thing for a list of dates at once, so building a week is one pass
   over the requests instead of one pass per day. */
export function offIdsByDate(store, isoList) {
  const map = {};
  (Array.isArray(isoList) ? isoList : []).forEach((iso) => { map[iso] = new Set(); });
  (readTimeOff(store).requests || []).forEach((r) => {
    if (!r || r.status !== STATUS.APPROVED || r.memberId == null) return;
    Object.keys(map).forEach((iso) => {
      if (coversDate(r, iso)) map[iso].add(String(r.memberId));
    });
  });
  return map;
}

/* ── asking ──────────────────────────────────────────────────────────── */

/* Why this request cannot be saved, or null if it is fine.
   ⚠️ A REASON STRING, NOT A BOOLEAN. The screen prints this, so a refused save
   tells somebody what to change instead of just going red. */
export function requestProblem(req, today) {
  if (!req) return "Nothing to save.";
  if (req.memberId == null || String(req.memberId) === "") return "That person is not on the roster.";
  const from = String(req.from || ""), to = String(req.to || "");
  if (!isIsoDate(from)) return "Pick a start date.";
  if (!isIsoDate(to)) return "Pick an end date.";
  if (to < from) return "The last day is before the first day.";
  if (today && isIsoDate(today) && from < today) return "That start date has already passed.";
  return null;
}

/* Does this clash with something the same person already has in?
   ⚠️ DENIED ONES DO NOT CLASH. A refused week must be askable again, otherwise
   one "no" locks those dates for good with nothing on screen explaining why. */
export function overlapping(store, memberId, from, to, ignoreId) {
  const me = String(memberId);
  return (readTimeOff(store).requests || []).filter((r) => {
    if (!r || String(r.memberId) !== me) return false;
    if (ignoreId && r.id === ignoreId) return false;
    if (r.status === STATUS.DENIED) return false;
    const a = String(r.from || ""), b = String(r.to || r.from || "");
    return from <= b && to >= a;
  });
}

/* ── reading ─────────────────────────────────────────────────────────── */

export const requestsFor = (store, memberId) =>
  (readTimeOff(store).requests || [])
    .filter((r) => r && String(r.memberId) === String(memberId))
    .sort((a, b) => String(b.from).localeCompare(String(a.from)));

export const pendingRequests = (store) =>
  (readTimeOff(store).requests || [])
    .filter((r) => r && r.status === STATUS.PENDING)
    .sort((a, b) => String(a.from).localeCompare(String(b.from)));

export const pendingCount = (store) => pendingRequests(store).length;

/* Anything still unanswered that falls inside a week. This is what a leader
   needs to see before they press Build: a pending request does NOT block the
   schedule, so an unanswered one becomes a shift somebody thinks they are off
   for. Takes the week's ISO dates rather than a Monday, so it cannot disagree
   with whatever days the board actually runs. */
export function pendingInDates(store, isoList) {
  const dates = Array.isArray(isoList) ? isoList : [];
  if (!dates.length) return [];
  const lo = dates.reduce((a, b) => (a < b ? a : b));
  const hi = dates.reduce((a, b) => (a > b ? a : b));
  return pendingRequests(store).filter((r) => {
    const from = String(r.from || ""), to = String(r.to || r.from || "");
    return from <= hi && to >= lo;
  });
}

/* One line for a request, for a list. */
export function fmtRange(req, fmtDate) {
  const f = (s) => (typeof fmtDate === "function" ? fmtDate(s) : s);
  const from = String(req && req.from || ""), to = String(req && req.to || from);
  return from === to ? f(from) : `${f(from)} to ${f(to)}`;
}

/* How many days a request covers. String maths only, so no Date is built:
   walk the calendar by counting, capped so a typo cannot spin. */
export function dayCount(req) {
  const from = String(req && req.from || ""), to = String(req && req.to || from);
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return 0;
  let n = 0, cur = from;
  while (cur <= to && n < 400) { n++; cur = nextIso(cur); }
  return n;
}

/* The day after an ISO date, as an ISO date, without constructing a Date.
   ⚠️ LEAP YEARS INCLUDED — the century rule matters in 2100 and costs one
   line, and "it will be somebody else's problem" is how the last one shipped. */
export function nextIso(iso) {
  if (!isIsoDate(iso)) return iso;
  let [y, m, d] = iso.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  d += 1;
  if (d > len) { d = 1; m += 1; }
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
