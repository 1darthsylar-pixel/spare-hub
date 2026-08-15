/* ============================================================================
   demerits.js — Leadership Standards engine

   Matt, Aug 1 2026: "we need to create a demerit system for leadership
   demotions." The Leadership Handbook already ends every role page with
   "failure to uphold these responsibilities has the potential to result in
   DEMOTION" — the consequence was agreed, the PATH was never defined. This is
   the path, modelled on the Team Member Points System the handbook already
   uses (coaching → written → final → termination), but as a SEPARATE
   leadership track.

   ★ LEAF MODULE — IMPORTS NOTHING. Same rule as nameMatch.js: the thing that
   decides who gets demoted must never sit inside an import cycle, which in
   this repo surfaces as "Cannot access 'X' before initialization" and a blank
   page. It is also why every function here is pure and node-testable.

   ⚠️ THE NUMBERS ARE HANNAH'S AND BRI'S, NOT MINE. Everything in CONFIG below
   was sent to them Aug 2 as a starting proposal (group DM C0BL3NT5RLZ) and is
   built to be changed in one place. The handbook is explicit that "point
   values and consequences are set by HR" — so when they answer, edit CONFIG
   and nothing else moves.

   ⚠️ WHAT THIS SYSTEM IS NOT. Falsification, cash integrity and harassment do
   NOT belong here — they skip every ladder and document under the existing
   Serious lines in HR Console, which already works. Attendance and personal
   conduct stay on the team member points system. This is only the leadership
   layer on top, covering the duties printed on the role pages.

   ⚠️ NOTHING HERE FIRES A CONSEQUENCE BY ITSELF. It reports a stage; a human
   files the documentation. A count must never terminate anyone — the Guadalupe
   QIV case is why: the Hub could not prove who pressed Finish, and an
   automatic accusation built on incomplete data is the nightmare outcome.
   ============================================================================ */

/* Every threshold, weight and window in one object. HR edits this, not logic. */
export const CONFIG = {
  windowDays: 90,        // a point expires this long after it was earned
  coachingAt: 3,
  writtenAt: 5,
  reviewAt: 7,
  planDays: 30,          // length of the improvement plan at the written step
  /* ⚠️ `cleanMonthsToReturn` IS GONE, AND ITS ABSENCE IS THE DECISION.
     Hannah and Bri, Aug 3 2026: "Remove that there is a 'way back' — it needs
     to be understood that if there is action like demotion needed, it is
     likely that leadership will not be the best fit for our team. There is not
     a hard 'once demoted, never opportunity to climb back up' but we don't
     want the option to be given on paper to be taken advantage of like
     demotion is a 'temporary discipline'."
     So re-promotion stays possible and stays a human decision. It is simply
     not a published number anyone can count down to. Do not reinstate this
     without asking them. */
};

/* ⚠️⚠️ THE THREE TEAM-SITE DUTIES USE A `get label()`, NOT A PLAIN STRING, AND
   THAT IS THE WHOLE REASON THIS FILE IMPORTS ANYTHING AT ALL.
   `DUTIES` is a module-level const, built once at import — BEFORE
   `applyStoreOverrides` merges a store's saved settings. A plain
   `label: \`${programLabel()} ...\`` here would capture whatever was deployed
   and then look dynamic while never being it. That is the same trap that put
   this store's name into another store's Leadership 101 class.
   ⇒ A getter runs on every read instead, so `d.label` picks up a rename typed
   in Store Settings with no consumer changing. Every reader stays
   `d.label` — HRConsole reads it in four places — and `JSON.stringify` and
   object spread both invoke getters, so nothing downstream sees a difference.
   ⚠️ NOT A CYCLE, CHECKED RATHER THAN ASSUMED: storeConfig.js does not import
   this file. Its only mention of `demerits.js` is a comment. The import-cycle
   check covers it from here on. */
import { programLabel } from "./storeConfig.js";

/* The duty catalog, weighted 1/2/3, drawn from the handbook role pages.
   `id` is permanent — entries are stored with it, so renaming a label is safe
   but changing an id orphans history. That guarantee is what makes the three
   getters below safe: a filed entry stores `duty` and `w`, never the label, so
   a store renaming its programme re-labels its whole history correctly rather
   than orphaning it. */
export const DUTIES = [
  { id: "shift-dropped",   w: 1, label: "Dropped a leadership shift without arranging coverage" },
  { id: "trainer-task",    w: 1, label: "Weekly trainer task missed" },
  { id: "setup-missed",    w: 1, label: "Setup not done or not followed on your shift" },
  { id: "log-blank",       w: 1, label: "A log you own left blank (waste, SOS tracker)" },
  /* Added by Hannah and Bri, Aug 3 2026. The Peak Reachers duties are theirs:
     leading a team is a leadership responsibility like any other on the role
     pages. ⚠️ `pr-chat-silent` happens in SLACK, which the Hub cannot see, so
     it can only ever be filed by a person — same as every other entry here.
     Nothing in this system auto-files, deliberately. */
  { id: "commitment-notice", w: 1, label: "Missed a leadership commitment with notice (class, evaluation, meeting)" },
  { id: "pr-goal-missed",  w: 1, get label() { return `${programLabel()} monthly goal submission missed`; } },
  { id: "pr-chat-silent",  w: 1, get label() { return `No ${programLabel()} team chat that week (minimum once a week)`; } },
  /* ⚠️ MOVED 2 → 3 by Hannah and Bri, Aug 3 2026. Safe to change: makeEntry
     freezes `w` onto each entry when it is filed and weightOf prefers the
     stored value, so anything already on record keeps the points it was filed
     at. A catalogue edit changes what happens NEXT, never the past. */
  { id: "commitment-noshow", w: 3, label: "No-show to a leadership commitment, no notice (class, evaluation, meeting)" },
  { id: "repeat-after-coaching", w: 2, label: "Same issue again after documented coaching" },
  { id: "undocumented-incident", w: 2, label: "Incident handled but never documented" },
  { id: "safety-check-skipped", w: 2, label: "Food safety or AHA check skipped on your watch" },
  { id: "pr-goal-missed-2", w: 2, get label() { return `Two ${programLabel()} goal submissions missed in a row`; } },
  { id: "drawer-pattern",  w: 3, label: "Pattern of unverified drawer counts on your shifts" },
  { id: "no-leader",       w: 3, label: "Left a shift without a leader in place" },
  { id: "directed-skip",   w: 3, label: "Directed a team member to skip a standard" },
];

export const dutyById = (id) => DUTIES.find((d) => d.id === id) || null;

/* Stages, lowest first. `at` reads from CONFIG so HR's edit moves everything. */
export const stages = () => ([
  { key: "coaching", at: CONFIG.coachingAt, label: "Documented coaching",
    action: "A logged conversation. Name the focus. Not punitive." },
  { key: "written",  at: CONFIG.writtenAt,  label: `Written warning + ${CONFIG.planDays}-day plan`,
    action: "Specific focus areas, check-in dates, signed like any documentation." },
  { key: "review",   at: CONFIG.reviewAt,   label: "Demotion review",
    action: "Director/Ex Director + HR meet, owner signs off. One tier down, or an extended plan." },
]);

/* ── date helpers (UTC-safe, string in / string out) ──────────────────────
   Entries carry an ISO date string, never a Date object — a stored Date
   round-trips through JSON as a string anyway, and comparing strings avoids
   every timezone trap the rest of this repo has already been bitten by. */
const dayMs = 24 * 60 * 60 * 1000;
const toTime = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return (y && m && d) ? Date.UTC(y, m - 1, d) : NaN;
};

/* Demerits still counting as of `asOf`. A demerit earned exactly windowDays
   ago has EXPIRED — the window is "the last 90 days", not "90 days and one". */
export function activeEntries(entries, asOf) {
  const now = toTime(asOf);
  if (!Array.isArray(entries) || Number.isNaN(now)) return [];
  return entries.filter((e) => {
    if (!e || e.voided) return false;
    /* ★★ A PENDING ENTRY COUNTS FOR NOTHING UNTIL HR FILES IT (Hannah, Aug 4
       2026: "If they need to file something, leave it pending for HR review and
       I can file it").
       ⚠️ THIS FILTER IS THE WHOLE SAFETY OF THE FEATURE. Without it, submitting
       a pending point would move somebody's rolling total the moment it was
       logged — and the total is what decides coaching, a written warning and a
       demotion review. Somebody could be pushed to a step by an entry HR had
       not yet agreed to and might bin. Pending means pending: not on the total,
       not on the ladder, not in the notification. */
    if (e.pending) return false;
    const t = toTime(e.date);
    if (Number.isNaN(t)) return false;
    const age = (now - t) / dayMs;
    return age >= 0 && age < CONFIG.windowDays;
  });
}

/* The weight of an entry: whatever was STORED on it, falling back to the
   catalog. ⚠️ Stored weight wins on purpose — re-weighting a duty later must
   not silently re-score somebody's history and push them over a threshold
   they never crossed. */
export const weightOf = (e) => {
  const w = Number(e && e.w);
  if (Number.isFinite(w) && w > 0) return w;
  const d = dutyById(e && e.duty);
  return d ? d.w : 0;
};

export function totalFor(entries, asOf) {
  return activeEntries(entries, asOf).reduce((s, e) => s + weightOf(e), 0);
}

/* The stage a total has reached — the HIGHEST one crossed, or null. */
export function stageFor(total) {
  const n = Number(total) || 0;
  let hit = null;
  for (const s of stages()) if (n >= s.at) hit = s;
  return hit;
}

/* What is coming next, for the banner: how far to the next step. */
export function nextStage(total) {
  const n = Number(total) || 0;
  return stages().find((s) => n < s.at) || null;
}

/* Full picture for one person, which is all the UI ever needs. */
export function standing(entries, asOf) {
  const active = activeEntries(entries, asOf);
  const total = active.reduce((s, e) => s + weightOf(e), 0);
  const stage = stageFor(total);
  const next = nextStage(total);
  return {
    total,
    active,
    stage,                                    // null until the first threshold
    next,
    toNext: next ? next.at - total : null,    // demerits until the next step
    expiring: expiringWithin(entries, asOf, 14),
  };
}

/* Entries about to roll off, so a leader can see the slate cleaning itself.
   Sorted soonest-first. */
export function expiringWithin(entries, asOf, days) {
  const now = toTime(asOf);
  if (Number.isNaN(now)) return [];
  return activeEntries(entries, asOf)
    .map((e) => ({ entry: e, daysLeft: Math.ceil(CONFIG.windowDays - (now - toTime(e.date)) / dayMs) }))
    .filter((x) => x.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ⚠️ `eligibleToReturn` WAS HERE AND IS DELETED ON PURPOSE, Aug 3 2026.
   It computed whether someone had gone enough clean months after a demotion to
   be eligible again. Hannah and Bri removed that idea: "we don't want the
   option to be given on paper to be taken advantage of like demotion is a
   'temporary discipline'."

   Re-promotion is still possible. It is a conversation, not a countdown, and
   nothing in the Hub should imply otherwise by computing a date. Left as a
   note rather than deleted silently so the next person does not helpfully
   rebuild it. Nothing imported it — checked before removing. */

/* Build a storable entry. Kept here so every caller writes the same shape.
   ⚠️ `w` is frozen onto the entry at creation — see weightOf. */
export function makeEntry({ duty, date, by, note, source }) {
  const d = dutyById(duty);
  return {
    id: `dm_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
    duty,
    w: d ? d.w : 0,
    date: String(date || "").slice(0, 10),
    by: by || "",
    note: note || "",
    source: source || "manual",   // "manual" | "suggested" — the smart queue lands here
    at: new Date().toISOString(),
  };
}

/* The entries waiting on HR. Kept beside activeEntries on purpose: the two are
   opposite halves of one rule, and a caller that finds one should see the
   other. Voided pendings are dropped — a discarded submission is not a queue
   item, it is history. */
export function pendingEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e && e.pending && !e.voided);
}
