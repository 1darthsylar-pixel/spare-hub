/* ══════════════════════════════════════════════════════════════════════════
   storeHours.js — THE DAYS THIS STORE DOES NOT KEEP ITS NORMAL HOURS.

   ★ LEAF. Imports nothing. The scheduling engine reads it while deciding a
   week and one day the Worker will too, so no React, no store.js, no
   component, ever.

   ────────────────────────────────────────────────────────────────────────
   WHY
   ────────────────────────────────────────────────────────────────────────
   Matt, Aug 13 2026: "for holidays we only open 10:30-4 so log that. I make
   special cuts for those days."

   Every station's posted hours are keyed to a DAY OF THE WEEK — `stations.FOH`
   is `{ Mon: [...], Tue: [...] }` — so there has never been anywhere to say
   that one DATE is different. Build a week containing Thanksgiving today and
   the engine rosters Bulk Prep from 5am and Leader DT from 5:15am, because
   Thursday says so.

   ⇒ This holds the exceptions. Absent key, empty record, unknown date: normal
   hours, exactly as today. Rule 1.

   ⚠️⚠️ NOTHING IS SEEDED AND NO HOLIDAY IS NAMED IN THIS FILE. Not one date,
   not "Thanksgiving", not 10:30, not 4pm. Two reasons and both are real:
     • Design rule 18. Another store opens on days this one shuts, keeps
       different hours when it does, and is in another state. A seeded list
       would arrive in their repo looking deliberate.
     • Plausible-and-wrong is worse than blank. A wrong CLOSING time does not
       fail; it rosters somebody to a shift the store is not open for, and the
       schedule looks entirely normal.
   The store types its dates once on a screen and they are its data.

   ⚠️ EVERY TIME HERE IS MINUTES FROM MIDNIGHT, the same unit as availability,
   the stations, the schedule and the minor limits. 10:30am is 630. See the
   units warning at the head of availability.js for what mixing them has cost.

   ⚠️ THIS IS NOT THE SCHOOL CALENDAR AND THE TWO MUST NOT BE MERGED.
   `schoolCalendar.js` answers "does a MINOR have school on this date", which
   changes that person's hour limit. This answers "is the STORE open, and
   when", which changes every station on the board. The dates barely overlap:
   school is out for a teacher workday the store trades right through, and the
   store shuts on days school is already out for the summer.
   ══════════════════════════════════════════════════════════════════════════ */

export const STORE_HOURS_KEY = "gcfcr-store-hours-v1";

export const MIN_PER_DAY = 1440;

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/* A minute of the day, or null. NEVER 0 as a stand-in for "not typed" —
   midnight is a real answer and payRates.js already carries the scar of a
   missing value reading as a real zero. */
const minute = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MIN_PER_DAY ? Math.round(n) : null;
};

/* Guard the read. An absent key, an empty object, or a bare `{iso: {...}}` map
   written before `v: 1` existed all answer "no exceptions", which is a fully
   working state and is what every store starts with. Rule 1. */
export function readStoreHours(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const src = o.dates && typeof o.dates === "object" && !Array.isArray(o.dates)
    ? o.dates
    : (o.v || o.defaultOpen != null || o.updatedAt ? {} : o);

  const dates = {};
  Object.keys(src).forEach((k) => {
    if (!isIsoDate(k)) return;
    const d = src[k];
    if (!d || typeof d !== "object") return;
    /* `closed` beats any hours on the same row. A store that is shut is shut,
       and a record carrying both is a record somebody edited twice. */
    const closed = !!d.closed;
    /* ── the special cuts ────────────────────────────────────────────────
       Matt, Aug 13 2026: "I make special cuts for those days." Shorter store
       hours are only half of what a holiday is; the other half is that some
       stations do not run at all and some run their own hours.

       ⚠️ KEYED BY STATION id, NEVER BY NAME. A station's `role` string carries
       its posted hours ("WINDOW (6AM-11PM)") and those change between days, so
       a name is not an identity. `id` is what `stations.FOH` already keys on.

         { off: true }        not on the board that day
         { start, end }       its own window, which OVERRIDES the store clamp
                              — this is how prep comes in at 8 on a 10:30 day
                              without anybody guessing on his behalf. */
    const stationsIn = d.stations && typeof d.stations === "object" && !Array.isArray(d.stations) ? d.stations : {};
    const stations = {};
    Object.keys(stationsIn).forEach((sid) => {
      const row = stationsIn[sid];
      if (!row || typeof row !== "object") return;
      if (row.off) { stations[String(sid)] = { off: true }; return; }
      const st = minute(row.start), en = minute(row.end);
      /* Half a window is not a shorter day, it is a record nobody can read. */
      if (st == null || en == null || en <= st) return;
      stations[String(sid)] = { off: false, start: st, end: en };
    });

    dates[k] = {
      closed,
      open: closed ? null : minute(d.open),
      close: closed ? null : minute(d.close),
      note: String(d.note || ""),
      stations,
    };
  });

  return {
    v: 1,
    /* What this store usually does on an exception day, so adding the next one
       is one tap rather than typing two clock times again. Still typed, never
       assumed. */
    defaultOpen: minute(o.defaultOpen),
    defaultClose: minute(o.defaultClose),
    dates,
    updatedAt: String(o.updatedAt || ""),
    updatedBy: String(o.updatedBy || ""),
  };
}

export const hasExceptions = (cfg) => Object.keys(readStoreHours(cfg).dates).length > 0;

/* ── what is different about one date ─────────────────────────────────────
   Returns null when the date is ordinary, which is the common case and the
   one every caller must handle first.

     { closed: true }                    the store does not open
     { open, close }                     minutes; either may be null, meaning
                                         "normal at that end"

   ⚠️ A ROW WITH NEITHER TIME AND NO `closed` FALLS BACK TO THE STORE DEFAULT,
   and if that is not typed either it answers null — an ordinary day. Somebody
   who ticks a date and never says what the hours are has told us nothing, and
   guessing on their behalf is how a 5am opener survives onto a holiday. */
export function hoursForDate(cfg, iso) {
  const c = readStoreHours(cfg);
  const d = c.dates[String(iso || "")];
  if (!d) return null;
  if (d.closed) return { closed: true, open: null, close: null, note: d.note };
  const open = d.open != null ? d.open : c.defaultOpen;
  const close = d.close != null ? d.close : c.defaultClose;
  if (open == null && close == null) return null;
  return { closed: false, open, close, note: d.note };
}

/* ── the stations, as they really are on that date ────────────────────────
   Clamp every posted window into the store's opening window for the day and
   drop anything left with no time in it.

   ⚠️⚠️ IT RETURNS NEW OBJECTS AND NEVER MUTATES. The station list comes from
   `storeCfg`, which hands back the store's live config — clamping in place
   would shorten Thanksgiving's hours and then keep them shortened for every
   other Thursday in the same session, and the second bug would look nothing
   like the first.

   ⚠️ A STATION THAT CLOSES BEFORE THE STORE OPENS DISAPPEARS FOR THAT DAY, it
   does not become a hole. Biscuits runs 5:15am to 11am; on a 10:30-4 day that
   is thirty usable minutes, and on a noon opening it is none. Reporting a
   station nobody could staff as unstaffed is the same false alarm the
   core/peak work just removed.

   ⚠️ `hours: null` SURVIVES UNTOUCHED. That is how this store marks a row a
   leader fills by hand (TRAINER, TRAINING, MOBILE BAGGER, the leader rows), and
   clamping must not turn one into an empty array, which would read as "posted,
   and shut all day" rather than "not a posted position". */
export function stationsForDate(stations, cfg, iso, opts) {
  const list = Array.isArray(stations) ? stations : [];
  const win = hoursForDate(cfg, iso);
  if (!win) return list;
  if (win.closed) return [];

  /* ⚠️⚠️ THE OPENING CLAMP IS A CHOICE THE CALLER MAKES, AND HIS OWN SCHEDULE
     IS WHY. The first version cut EVERY station to the store's opening time.
     Matt's real Labor Day roster has **Ana Turcios on Prep from 8:00 AM on a
     day the store opens at 10:30** — prep comes in before the doors, exactly
     as it does on an ordinary day. Clamping her to 10:30 would have deleted
     two and a half hours of prep from a holiday and nobody would have seen it
     until the morning.

     ⇒ Front of house follows the DOORS. Back of house opens the BUILDING, so
     only its closing end moves. That split is not a guess: it is the FOH/BOH
     division this repo already keys every station list on, and the caller
     passes which one it is holding. Anything with no opinion clamps both ends,
     which is the old behaviour.

     ⚠️ THE CLOSING CLAMP IS NEVER OPTIONAL. The store being shut is not a
     matter of opinion, and a station posted past close on a holiday is how
     somebody gets rostered to an empty building. */
  const clampStart = !(opts && opts.clampStart === false);

  const lo = win.open == null ? 0 : win.open;
  const hi = win.close == null ? MIN_PER_DAY : win.close;
  if (hi <= lo) return [];

  /* ⚠️ A CUT THE STORE TYPED BEATS EVERY DEFAULT IN THIS FUNCTION, including
     the front/back opening rule. That rule is a sensible guess about a whole
     side; this is a decision about one station on one date, and the person who
     made it was standing in the building. */
  const cuts = readStoreHours(cfg).dates[String(iso || "")].stations || {};

  const out = [];
  list.forEach((st) => {
    if (!st) return;
    const cut = cuts[String(st.id || st.name || "")];
    if (cut && cut.off) return;                               // cut for the day
    if (!Array.isArray(st.hours)) { out.push(st); return; }   // manual-only row
    if (cut) { out.push({ ...st, hours: [{ start: cut.start, end: cut.end }] }); return; }
    const hours = st.hours
      .map((h) => ({
        ...h,
        start: clampStart ? Math.max(Number(h.start) || 0, lo) : (Number(h.start) || 0),
        end: Math.min(Number(h.end) || 0, hi),
      }))
      .filter((h) => h.end > h.start);
    if (!hours.length) return;
    out.push({ ...st, hours });
  });
  return out;
}

/* Which stations would already be running before the doors open on that date.
   ⚠️ THIS IS THE LIST A LEADER CUTS BY HAND, and naming it is the point. Matt
   said it himself: "I make special cuts for those days." The Hub cannot know
   that prep needs three hours on Labor Day and two on Christmas Eve, so it
   does not guess — it says which stations are affected and gets out of the way.
   Empty on an ordinary date. */
export function earlyStations(stations, cfg, iso) {
  const win = hoursForDate(cfg, iso);
  if (!win || win.closed || win.open == null) return [];
  return (Array.isArray(stations) ? stations : []).filter((st) =>
    st && Array.isArray(st.hours) && st.hours.some((h) => (Number(h.start) || 0) < win.open));
}

/* ── writers ──────────────────────────────────────────────────────────────
   ⚠️ EACH RETURNS null RATHER THAN STORING SOMETHING HALF-SET. A date row with
   an open time and no close is not a shorter day, it is a record nobody can
   read later. Rule 1: fail loudly rather than save something wrong. */
export function setDate(cfg, iso, entry, stamp) {
  const c = readStoreHours(cfg);
  if (!isIsoDate(iso)) return null;
  const e = entry && typeof entry === "object" ? entry : {};
  const closed = !!e.closed;
  const open = closed ? null : minute(e.open);
  const close = closed ? null : minute(e.close);
  /* Open with no close, or a close before the open, is refused. */
  if (!closed) {
    const o = open != null ? open : c.defaultOpen;
    const cl = close != null ? close : c.defaultClose;
    if (o == null || cl == null || cl <= o) return null;
  }
  return {
    ...c,
    dates: { ...c.dates, [iso]: { closed, open, close, note: String(e.note || "") } },
    updatedAt: (stamp && stamp.at) || "",
    updatedBy: (stamp && stamp.by) || "",
  };
}

export function removeDate(cfg, iso, stamp) {
  const c = readStoreHours(cfg);
  if (!c.dates[String(iso || "")]) return null;
  const dates = { ...c.dates };
  delete dates[String(iso)];
  return { ...c, dates, updatedAt: (stamp && stamp.at) || "", updatedBy: (stamp && stamp.by) || "" };
}

export function setDefaultWindow(cfg, open, close, stamp) {
  const c = readStoreHours(cfg);
  const o = minute(open), cl = minute(close);
  if (o == null || cl == null || cl <= o) return null;
  return { ...c, defaultOpen: o, defaultClose: cl, updatedAt: (stamp && stamp.at) || "", updatedBy: (stamp && stamp.by) || "" };
}

/* Every exception on or after `fromIso`, soonest first, for a screen that
   should show what is coming rather than what has been. */
export function upcoming(cfg, fromIso, limit = 12) {
  const c = readStoreHours(cfg);
  const from = isIsoDate(fromIso) ? String(fromIso) : "";
  return Object.keys(c.dates)
    .filter((iso) => !from || iso >= from)
    .sort()
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((iso) => ({ iso, ...c.dates[iso], resolved: hoursForDate(c, iso) }));
}

/* ── writing one station's cut ────────────────────────────────────────────
   `cut` is `{ off: true }`, or `{ start, end }` in minutes, or null to put the
   station back to its ordinary hours for that date.

   ⚠️ RETURNS null RATHER THAN STORING SOMETHING UNREADABLE, like every other
   writer here. A date that does not exist yet is refused too: a cut on a day
   the store never said was different is a note about nothing. */
export function setStationCut(cfg, iso, stationId, cut, stamp) {
  const c = readStoreHours(cfg);
  const d = c.dates[String(iso || "")];
  const sid = String(stationId == null ? "" : stationId).trim();
  if (!d || !sid) return null;

  const stations = { ...(d.stations || {}) };
  if (cut === null || cut === undefined) {
    if (!stations[sid]) return null;
    delete stations[sid];
  } else if (cut.off) {
    stations[sid] = { off: true };
  } else {
    const st = minute(cut.start), en = minute(cut.end);
    if (st == null || en == null || en <= st) return null;
    stations[sid] = { off: false, start: st, end: en };
  }

  return {
    ...c,
    dates: { ...c.dates, [String(iso)]: { ...d, stations } },
    updatedAt: (stamp && stamp.at) || "",
    updatedBy: (stamp && stamp.by) || "",
  };
}

/* Every cut on one date, as rows a screen can list. Empty on an ordinary date. */
export function cutsOn(cfg, iso) {
  const d = readStoreHours(cfg).dates[String(iso || "")];
  if (!d) return [];
  const s = d.stations || {};
  return Object.keys(s).sort().map((id) => ({ id, ...s[id] }));
}
