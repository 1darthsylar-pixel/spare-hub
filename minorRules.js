/* ══════════════════════════════════════════════════════════════════════════
   minorRules.js — THE HOUR LIMITS THIS STORE TYPED FOR ITS MINORS.

   ★ NEAR-LEAF. Imports schoolCalendar.js and nameMatch.js. Both bottom out one
   step down (timeOff.js imports nothing, nameMatch.js imports nothing), so the
   graph terminates and no cycle is possible. No React, no store.js, no
   component, ever — the scheduling engine reads this while deciding a week.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️⚠️ THIS FILE DOES NOT KNOW THE LAW AND MUST NEVER SAY THAT IT DOES.
   ────────────────────────────────────────────────────────────────────────
   Read this before changing a single string below.

   Matt asked, Aug 13 2026, for the North Carolina minor rules to be built in.
   `labor.nc.gov`, `nclabor.com` and `ncleg.gov` are all blocked from this
   network, so NOT ONE PRIMARY SOURCE COULD BE OPENED. The only thing available
   was a search summary, and the first summary returned CONFLATED THE 14-15 AND
   16-17 BANDS — which is precisely the error that puts a sixteen year old on a
   shift the store then has to explain.

   His own build spec says it in one line: "Verify the current rules against the
   NC Department of Labor before shipping. Do not hardcode remembered numbers."

   ⇒ SO NOTHING IS SEEDED. Every limit below starts null, which means NOT
   CHECKED. A store types its own numbers off its own copy of its own state's
   rules, and records where it got them. An empty record is a fully working
   state and is what ships.

   ⚠️ WHY NOT SEED THEM AND LET A STORE CORRECT THEM? Because nobody corrects a
   number that already looks right. UNEDITABLE-AND-WRONG IS WORSE THAN BLANK,
   and PLAUSIBLE-AND-WRONG is the same bug with better manners: blank gets
   reported in an hour, a wrong "3 hours" sits there for a year. The BOH board
   incident in the project rules is this exact failure — row one read
   "Primary Point / PRIMARY / 6:00am-8:00pm" and looked entirely usable.

   ⚠️ EVERY MESSAGE THIS FILE PRODUCES SAYS "over the limit typed in Minor
   rules". None of them says illegal, unlawful, violates, compliant, or names a
   state. That wording is load-bearing, not fussiness: scheduleWarnings.js
   already carries the rule that a screen claiming "complies with NC law" when
   it has never seen a birthday is worse than one that says nothing, because
   the first one gets believed.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ WHO IS A MINOR IS STILL DAILY SETUP'S LIST. There is not a second one.
   ────────────────────────────────────────────────────────────────────────
   `gcfcr-dailysetup-minors-v1` is a list of NAMES the board already keeps for
   breaks, and it stays the only answer to "is this person a minor". This file
   adds one thing nobody holds today: WHICH BAND each of those people is in.
   Two lists of who is a minor would drift, and the drifting one would be the
   one nobody looks at. Rule 8.

   ⚠️ THE HUB HAS NO DATE OF BIRTH and this file does not add one. A band is
   typed and a band goes stale on a birthday, which is a real cost and is said
   out loud on the screen rather than hidden. Storing DOBs for ~106 people to
   save that edit is a much larger decision about personnel data than an hour
   limit needs, and the spec puts DOB behind tier 3 for a reason.

   ⚠️⚠️ EVERY TIME IN THIS FILE IS MINUTES. Duration limits are minutes of work;
   `earliest` and `latest` are minutes from midnight. Same unit as
   availability.js, the stations, and the schedule, so every comparison is a
   subtraction with no conversion in it. See the units warning at the top of
   availability.js for what the alternative has already cost.
   ══════════════════════════════════════════════════════════════════════════ */

import { isSchoolDay, isSchoolNight, weekHasSchool } from "./schoolCalendar.js";
import { normName } from "./nameMatch.js";

export const MINOR_RULES_KEY = "gcfcr-minor-rules-v1";

/* Where the list of WHO is a minor actually lives. Daily Setup owns and writes
   it; everything in the scheduling platform reads it from here so the string
   is not typed out on three more screens. */
export const MINORS_KEY = "gcfcr-dailysetup-minors-v1";

/* The seven numbers a band can carry. The screen renders straight off this
   list, so adding a limit is one row here and nothing in the panel.
   `kind` tells the screen which input to draw: "dur" is a length of time,
   "clock" is a time of day. */
export const LIMIT_FIELDS = Object.freeze([
  { key: "maxSchoolDay", kind: "dur", label: "Most hours on a school day" },
  { key: "maxNonSchoolDay", kind: "dur", label: "Most hours on a non-school day" },
  { key: "maxSchoolWeek", kind: "dur", label: "Most hours in a week with school" },
  { key: "maxNonSchoolWeek", kind: "dur", label: "Most hours in a week with no school" },
  { key: "earliest", kind: "clock", label: "No earlier than" },
  { key: "latestSchool", kind: "clock", label: "No later than, before a school day" },
  { key: "latestNonSchool", kind: "clock", label: "No later than, otherwise" },
]);

const LIMIT_KEYS = LIMIT_FIELDS.map((f) => f.key);

/* A number or null. NEVER 0 as a stand-in for "not typed" — zero is a real and
   very different answer, and payRates.js already carries this scar: an hourly
   rate that returned 0 instead of null made an unknown wage look like free
   labour on a money screen. */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const nextBandId = (bands) => {
  let max = 0;
  (Array.isArray(bands) ? bands : []).forEach((b) => {
    const m = /^b(\d+)$/.exec(String((b && b.id) || ""));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `b${max + 1}`;
};

/* Guard the read. An absent key, an empty object and a hand-written array all
   answer "nothing typed yet", which is a fully working state. Rule 1. */
export function readMinorRules(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rows = Array.isArray(o.bands) ? o.bands : (Array.isArray(raw) ? raw : []);
  const seen = new Set();
  const bands = [];
  rows.forEach((r) => {
    if (!r || typeof r !== "object") return;
    const id = String(r.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    const band = { id, label: String(r.label || "").trim() };
    LIMIT_KEYS.forEach((k) => { band[k] = num(r[k]); });
    bands.push(band);
  });
  const peopleIn = o.people && typeof o.people === "object" ? o.people : {};
  const people = {};
  Object.keys(peopleIn).forEach((id) => {
    const b = String(peopleIn[id] || "");
    if (b && seen.has(b)) people[String(id)] = b;
  });
  return {
    v: 1,
    bands,
    people,
    /* Where the store got these numbers, and who last checked them. Not
       decoration: the whole reason this is typed rather than looked up is that
       nobody could vouch for a source, so the record carries its own. */
    source: String(o.source || ""),
    checkedAt: String(o.checkedAt || ""),
    checkedBy: String(o.checkedBy || ""),
  };
}

/* Has anybody typed anything at all? Drives every "we cannot check this" line
   on screen, and keeps the old rough warning in play until they have. */
export const hasLimits = (rules) =>
  readMinorRules(rules).bands.some((b) => LIMIT_KEYS.some((k) => b[k] !== null));

export const bandById = (rules, bandId) =>
  readMinorRules(rules).bands.find((b) => b.id === String(bandId || "")) || null;

export const bandForPerson = (rules, id) => readMinorRules(rules).people[String(id)] || "";

/* ── who is a minor ──────────────────────────────────────────────────────
   The board's list is NAMES and everything else in the Hub is keyed by roster
   id, so somebody has to join them. This is that somebody, in one place.

   ⚠️ MATCHED, NEVER ASSUMED. A name matching nobody is simply not a minor as
   far as the scheduler is concerned, which is the safe direction: it shortens
   nobody's shift rather than shortening the wrong person's. A first name is
   accepted because that is how the list is really written on the board, and a
   first name matching two people matches NEITHER — ambiguity is a miss. */
export function minorIdsFrom(names, roster) {
  const raw = (Array.isArray(names) ? names : [])
    .map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  if (!raw.length) return new Set();
  const wanted = new Set(raw.map((n) => normName(n) || n));
  const firstCount = new Map();
  const list = (Array.isArray(roster) ? roster : []).filter((p) => p && p.id != null && p.name);
  list.forEach((p) => {
    const f = String(p.name).trim().toLowerCase().split(/\s+/)[0];
    if (f) firstCount.set(f, (firstCount.get(f) || 0) + 1);
  });
  const out = new Set();
  list.forEach((p) => {
    const full = normName(p.name) || String(p.name).trim().toLowerCase();
    const first = String(p.name).trim().toLowerCase().split(/\s+/)[0];
    if (wanted.has(full)) { out.add(String(p.id)); return; }
    if (wanted.has(first) && firstCount.get(first) === 1) out.add(String(p.id));
  });
  return out;
}

/* ── the limits that apply on one day ────────────────────────────────────
   Returns what may be checked, plus WHY it is that answer, so a screen can say
   "school dates are not set" instead of quietly using the wrong column.

     maxShift   minutes, or null for not typed
     earliest   minutes from midnight, or null
     latest     minutes from midnight, or null
     school     true / false / null   ← the DAY, for the hours limit
     night      true / false / null   ← the NIGHT AFTER, for the latest limit
     assumed    true when school dates are unset and the school column was used

   ⚠️⚠️ UNKNOWN USES THE SCHOOL COLUMN, WHICH IS THE STRICTER ONE, AND SAYS SO.
   Defaulting the other way would hand a minor the long-day limit on a day
   nobody has classified. `assumed` exists so the screen can show that as a
   warning to go and set the dates rather than as a silent decision. */
export function limitsForDay(rules, cal, iso, bandId) {
  const band = bandById(rules, bandId);
  const school = isSchoolDay(cal, iso);
  const night = isSchoolNight(cal, iso);
  const assumed = school === null || night === null;
  if (!band) return { band: null, maxShift: null, earliest: null, latest: null, school, night, assumed };
  const useSchoolDay = school !== false;      // true or unknown
  const useSchoolNight = night !== false;     // true or unknown
  return {
    band,
    maxShift: useSchoolDay ? band.maxSchoolDay : band.maxNonSchoolDay,
    earliest: band.earliest,
    latest: useSchoolNight ? band.latestSchool : band.latestNonSchool,
    school, night, assumed,
  };
}

/* The weekly limit for a week, which is a property of the WEEK. */
export function limitsForWeek(rules, cal, isoList, bandId) {
  const band = bandById(rules, bandId);
  const hasSchool = weekHasSchool(cal, isoList);
  const assumed = hasSchool === null;
  if (!band) return { band: null, maxWeek: null, school: hasSchool, assumed };
  return {
    band,
    maxWeek: hasSchool !== false ? band.maxSchoolWeek : band.maxNonSchoolWeek,
    school: hasSchool,
    assumed,
  };
}

/* What the SCHEDULER needs for one day: only the people who actually have a
   limit to apply, keyed by id. Anybody with no group, or a group with nothing
   typed for this day, is left out entirely — an absent entry means "no typed
   limit" and the engine keeps the behaviour it had before this file existed.

   ⚠️ THE ENGINE GETS PLAIN NUMBERS, NOT THIS MODULE. scheduleEngine.js has to
   stay testable without a school calendar or a rules record in hand, so the
   whole question is answered here and handed over as a flat map. */
export function dayLimitsByPerson(rules, cal, iso, minorIds) {
  const ids = minorIds instanceof Set ? [...minorIds] : (Array.isArray(minorIds) ? minorIds : []);
  const out = {};
  ids.forEach((raw) => {
    const id = String(raw);
    const bandId = bandForPerson(rules, id);
    if (!bandId) return;
    const L = limitsForDay(rules, cal, iso, bandId);
    if (L.maxShift === null && L.earliest === null && L.latest === null) return;
    out[id] = { maxShift: L.maxShift, earliest: L.earliest, latest: L.latest };
  });
  return out;
}

/* ── checking one shift ──────────────────────────────────────────────────
   Returns plain reasons. NEVER a refusal, never a legal claim — see the header.
   A leader owns the final shift and a warning they can overrule is the whole
   difference between a tool and a tool that resents them. */
const hh = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0));
  const h = Math.floor(n / 60), r = n % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(r).padStart(2, "0")} ${ampm}`;
};
const dur = (m) => `${((Number(m) || 0) / 60).toFixed(1)}`;

export function checkMinorShift({ rules, cal, iso, bandId, start, end }) {
  const out = [];
  const L = limitsForDay(rules, cal, iso, bandId);
  if (!L.band) return out;
  const a = Number(start) || 0, b = Number(end) || 0;
  const worked = Math.max(0, b - a);
  const tail = L.assumed ? " (school dates are not set, so the school day limit was used)" : "";

  if (L.maxShift !== null && worked > L.maxShift) {
    out.push(`${dur(worked)} hours, over the ${dur(L.maxShift)} typed for ${L.band.label || "this band"}${tail}`);
  }
  if (L.earliest !== null && a < L.earliest) {
    out.push(`starts at ${hh(a)}, before the ${hh(L.earliest)} typed for ${L.band.label || "this band"}`);
  }
  if (L.latest !== null && b > L.latest) {
    out.push(`ends at ${hh(b)}, after the ${hh(L.latest)} typed for ${L.band.label || "this band"}${tail}`);
  }
  return out;
}

export function checkMinorWeek({ rules, cal, isoList, bandId, minutes }) {
  const L = limitsForWeek(rules, cal, isoList, bandId);
  if (!L.band || L.maxWeek === null) return [];
  const m = Math.max(0, Number(minutes) || 0);
  if (m <= L.maxWeek) return [];
  const tail = L.assumed ? " (school dates are not set, so the school week limit was used)" : "";
  return [`${dur(m)} hours this week, over the ${dur(L.maxWeek)} typed for ${L.band.label || "this band"}${tail}`];
}

/* ── writing ─────────────────────────────────────────────────────────────
   Every writer returns a whole guarded record. */

export function upsertBand(rules, entry) {
  const r = readMinorRules(rules);
  const id = String((entry && entry.id) || "").trim() || nextBandId(r.bands);
  const row = { id, label: String((entry && entry.label) || "").trim() };
  LIMIT_KEYS.forEach((k) => { row[k] = num(entry && entry[k]); });
  const i = r.bands.findIndex((b) => b.id === id);
  const bands = r.bands.slice();
  if (i >= 0) bands[i] = row; else bands.push(row);
  return { ...r, bands };
}

/* ⚠️ REMOVING A BAND UNSETS EVERYBODY WHO WAS IN IT, rather than leaving them
   pointing at a band that no longer exists. A dangling reference would read as
   "no limits" and look identical to somebody nobody had got to yet. */
export function removeBand(rules, bandId) {
  const r = readMinorRules(rules);
  const id = String(bandId || "");
  const people = {};
  Object.keys(r.people).forEach((k) => { if (r.people[k] !== id) people[k] = r.people[k]; });
  return { ...r, bands: r.bands.filter((b) => b.id !== id), people };
}

export function setPersonBand(rules, personId, bandId) {
  const r = readMinorRules(rules);
  const pid = String(personId || "");
  if (!pid) return r;
  const people = { ...r.people };
  const id = String(bandId || "");
  if (id && r.bands.some((b) => b.id === id)) people[pid] = id; else delete people[pid];
  return { ...r, people };
}

export function setSource(rules, source, stamp) {
  const r = readMinorRules(rules);
  return {
    ...r,
    source: String(source || ""),
    checkedAt: (stamp && stamp.at) || "",
    checkedBy: (stamp && stamp.by) || "",
  };
}

/* Everybody on the minors list who has no band, so the screen can name them
   instead of quietly checking nothing. Somebody missing from a check is
   indistinguishable from somebody who passed it. */
export function minorsWithoutBand(rules, minorIds) {
  const r = readMinorRules(rules);
  const ids = minorIds instanceof Set ? [...minorIds] : (Array.isArray(minorIds) ? minorIds : []);
  return ids.map(String).filter((id) => !r.people[id]);
}
