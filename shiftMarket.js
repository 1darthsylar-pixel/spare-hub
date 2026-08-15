/* ══════════════════════════════════════════════════════════════════════════
   shiftMarket.js — DROPPED SHIFTS, WHO WANTS THEM, AND WHETHER THAT IS A
   GOOD IDEA.

   ★ NEAR-LEAF. Imports availability.js, timeOff.js, scheduleEngine.js and
   scheduleWarnings.js. Every one of those bottoms out in modules that import
   nothing or import only storeConfig/nameMatch/shiftHours, so the graph stays a
   DAG and cyclecheck proves it. No React, no storage, no UI.

   ────────────────────────────────────────────────────────────────────────
   ⚠️⚠️ THE CHECK IS THE PRODUCT. `checkClaim` IS WHY THIS FILE EXISTS.
   ────────────────────────────────────────────────────────────────────────
   Matt, Aug 13 2026: approving a pickup blind "is the single biggest quality
   gap in the category". HotSchedules approves blind. So the leader must be able
   to see, BEFORE tapping anything: is this person trained for that side, are
   they actually free, what does it do to their week, does it tip them into
   overtime, and are they on the minors list.

   ⇒ So `checkClaim` runs the SAME rules the schedule builder already runs,
   imported rather than restated. If a rule ever disagreed between "the machine
   would not schedule this" and "the leader was told it was fine", the approval
   screen would be actively lying, and it is the screen people trust most
   because it is the one they tap once and walk away from.

   ⚠️ IT RETURNS FINDINGS, NOT A VERDICT TO OBEY. `ok` means nothing blocking
   was found; a leader may still approve a claim with blockers, and there are
   real reasons to (somebody covering a rush is a decision). What the leader may
   NOT do is approve one without being shown.

   ────────────────────────────────────────────────────────────────────────
   ⚠️ THE SHIFT DOES NOT MOVE UNTIL A CLAIM IS APPROVED.
   ────────────────────────────────────────────────────────────────────────
   Releasing puts a shift on the board and nothing else. It stays the original
   person's, on the schedule, on the setup board, and in their hours, right up
   until a leader says yes. Anything else means a shift with nobody responsible
   for it, which is how a Saturday opens with a hole nobody noticed.

   ⚠️ AN APPROVED SWAP IS MARKED `manual: true` ON THE SCHEDULE. Without that,
   the next press of Build would hand the shift straight back to the person who
   dropped it — see `preplaced` in scheduleEngine.js. A swap is a human decision
   and it survives a rebuild like any other.
   ══════════════════════════════════════════════════════════════════════════ */

import { coversSpan, fmtMin, dayState } from "./availability.js";
import { offIdsOn } from "./timeOff.js";
import { sideSkill, DEFAULT_RULES } from "./scheduleEngine.js";
import { MINOR_LOOK } from "./scheduleWarnings.js";

export const MARKET_KEY = "gcfcr-shift-market-v1";

export const OFFER = Object.freeze({
  OPEN: "open",
  APPROVED: "approved",
  WITHDRAWN: "withdrawn",
  DENIED: "denied",
});

/* Guard the read. Rule 1. */
export function readMarket(raw) {
  if (Array.isArray(raw)) return { v: 1, offers: raw };
  if (!raw || typeof raw !== "object") return { v: 1, offers: [] };
  return { v: raw.v || 1, offers: Array.isArray(raw.offers) ? raw.offers : [] };
}

/* An offer names the shift by where it sits, not by an id, because shifts are
   rebuilt and any id we minted would not survive a press of Build. */
export const offerMatchesShift = (o, weekOf, day, side, personId, start) =>
  o && o.weekOf === weekOf && o.day === day && o.side === side &&
  String(o.fromPersonId) === String(personId) && Number(o.start) === Number(start);

export const openOffers = (market) =>
  readMarket(market).offers.filter((o) => o && o.status === OFFER.OPEN);

export const offersFor = (market, personId) =>
  readMarket(market).offers.filter((o) => o && String(o.fromPersonId) === String(personId));

export const claimCount = (o) => ((o && o.claims) || []).length;

export const hasClaimed = (o, personId) =>
  ((o && o.claims) || []).some((c) => String(c.personId) === String(personId));

/* ── the check ───────────────────────────────────────────────────────────
   `ctx` carries everything already loaded by the screen:
     { avail, skills, minors, timeOff, terminated, week, rules }
   `week` is a built schedule, used only to count the claimer's other hours. */

/* Every shift this person already holds in the week, excluding the one being
   given away. Same flattening the warnings use, kept local because this needs
   the exclusion and that one does not. */
function personShifts(week, personId, exclude) {
  const out = [];
  const days = (week && week.days) || {};
  Object.keys(days).forEach((day) => {
    const sides = (days[day] || {}).sides || {};
    Object.keys(sides).forEach((side) => {
      ((sides[side] || {}).shifts || []).forEach((s) => {
        if (!s || String(s.id) !== String(personId)) return;
        if (exclude && exclude.day === day && exclude.side === side &&
            Number(exclude.start) === Number(s.start)) return;
        out.push({ ...s, day, side });
      });
    });
  });
  return out;
}

const mins = (s) => Math.max(0, Number(s.end) - Number(s.start));

/* THE ANSWER A LEADER SEES BEFORE THEY TAP APPROVE.

   Returns { ok, blockers[], notes[], rated, ratedLabel, hoursBefore, hoursAfter,
             overtime, score } — score sorts the clean ones to the top. */
export function checkClaim({ offer, claimerId, claimerName, ctx }) {
  const c = ctx || {};
  const R = { ...DEFAULT_RULES, ...(c.rules || {}) };
  const id = String(claimerId);
  const A = (c.avail && c.avail.people) || c.avail || {};
  const S = (c.skills && c.skills.people) || c.skills || {};
  const gone = c.terminated instanceof Set ? c.terminated : new Set();
  const minorSet = c.minors instanceof Set ? c.minors : new Set();

  const blockers = [], notes = [];
  const shift = { start: Number(offer.start), end: Number(offer.end) };

  /* 1 — do they still work here */
  if (gone.has(id)) blockers.push("Has left the team");

  /* 2 — approved time off that day */
  if (offer.iso && offIdsOn(c.timeOff, offer.iso).has(id)) {
    blockers.push("Has approved time off that day");
  }

  /* 3 — availability, end to end. `coversSpan` is the shared reader; a split
     availability does NOT cover a shift across the join. */
  const rec = A[id];
  const st = dayState(rec, offer.day);
  if (st === "unset") blockers.push("No availability on file");
  else if (st === "off") blockers.push(`Not available on ${offer.day}`);
  else if (!coversSpan(rec, offer.day, shift.start, shift.end)) {
    blockers.push(`Free on ${offer.day}, but not ${fmtMin(shift.start)}-${fmtMin(shift.end)}`);
  }

  /* 4 — trained for that side */
  const rated = sideSkill(S[id], offer.side);
  if (!rated) blockers.push(`Not trained on ${offer.side}`);

  /* 5 — already working that day, overlapping */
  const others = personShifts(c.week, id, null);
  const sameDay = others.filter((s) => s.day === offer.day);
  const clash = sameDay.find((s) => shift.start < s.end && shift.end > s.start);
  if (clash) blockers.push(`Already on ${fmtMin(clash.start)}-${fmtMin(clash.end)} that day`);

  /* 6 — what it does to their week */
  const beforeMin = others.reduce((t, s) => t + mins(s), 0);
  const hoursBefore = beforeMin / 60;
  const hoursAfter = (beforeMin + (shift.end - shift.start)) / 60;
  const overtime = hoursAfter > R.maxWeekHours;
  if (overtime) notes.push(`Takes them to ${hoursAfter.toFixed(1)} hours, over ${R.maxWeekHours}`);

  /* 7 — minors. ⚠️ THE HUB HAS NO DATE OF BIRTH, so this can only ever say
     that somebody is on the hand-typed minors list and that the shift is long
     or late. It must not be worded as a legal check. See scheduleWarnings.js. */
  if (minorSet.has(id)) {
    notes.push("On the minors list");
    if (shift.end - shift.start > MINOR_LOOK.maxMinutes) {
      notes.push(`Shift is ${((shift.end - shift.start) / 60).toFixed(1)} hours`);
    }
    if (shift.end > MINOR_LOOK.latestEnd) notes.push(`Shift ends at ${fmtMin(shift.end)}`);
  }

  /* Clean first, then fewer notes, then the stronger person, then whoever has
     the lightest week — spreading hours beats piling them on one willing body. */
  const score = (blockers.length ? -1000 : 0) - notes.length * 10 + rated - hoursBefore / 10;

  return {
    claimerId: id,
    claimerName,
    ok: blockers.length === 0,
    blockers,
    notes,
    rated,
    ratedLabel: ["none", "beginner", "intermediate", "advanced"][rated] || "none",
    hoursBefore,
    hoursAfter,
    overtime,
    score,
  };
}

/* Every claimer on an offer, checked and ranked so the clean ones are first. */
export function rankClaims(offer, ctx) {
  return ((offer && offer.claims) || [])
    .map((cl) => checkClaim({ offer, claimerId: cl.personId, claimerName: cl.personName, ctx }))
    .sort((a, b) => b.score - a.score);
}

/* ── moving the shift ────────────────────────────────────────────────────
   Pure: takes a built week and returns a new one with the shift reassigned.

   ⚠️ `manual: true` IS NOT OPTIONAL. Without it the next press of Build hands
   the shift straight back to whoever dropped it, because the auto pass only
   preserves shifts a human touched. An approved swap IS a human decision.
   ⚠️ THE JOB CODE FOLLOWS THE NEW PERSON, not the old one. The board matches
   people to stations through the job code, so leaving the leaver's code on the
   shift would place the wrong person on the wrong station on the day. */
export function applySwap(week, offer, claimerId, claimerName, claimerJob, claimerSkillWord) {
  const days = { ...((week && week.days) || {}) };
  const dayRec = { ...(days[offer.day] || {}) };
  const sides = { ...(dayRec.sides || {}) };
  const sideRec = { ...(sides[offer.side] || { shifts: [] }) };
  let moved = false;
  sideRec.shifts = (sideRec.shifts || []).map((s) => {
    if (moved) return s;
    if (String(s.id) !== String(offer.fromPersonId) || Number(s.start) !== Number(offer.start)) return s;
    moved = true;
    return {
      ...s,
      id: String(claimerId),
      name: claimerName,
      job: claimerJob || "",
      skillWord: claimerSkillWord || "",
      manual: true,
      swappedFrom: offer.fromPersonName || "",
    };
  });
  if (!moved) return { week, moved: false };
  sideRec.hours = sideRec.shifts.reduce((t, x) => t + (x.end - x.start), 0) / 60;
  sides[offer.side] = sideRec;
  dayRec.sides = sides;
  days[offer.day] = dayRec;
  return { week: { ...week, days }, moved: true };
}

/* One line describing an offer, for a list. */
export const fmtOffer = (o) =>
  `${o.day} ${fmtMin(o.start)}-${fmtMin(o.end)} · ${o.side}`;

/* ══════════════════════════════════════════════════════════════════════════
   ★★ AUTO APPROVAL, AND THE RULES THAT HOLD IT BACK.

   Matt, Aug 14 2026: "i want the hub to auto approve shift swaps with rules",
   and separately "We will be testing shift swaps next week before launching the
   schedule."

   ⚠️⚠️ IT SHIPS OFF. `on: false`. A store turns this on when it has decided the
   machine may move a person on its board without anybody looking, which is a
   real decision and not one the code gets to make by arriving. Same shape as
   `features.tokens` in storeConfig — the switch is store data with a screen.

   ⚠️ EVERY RULE IS A REASON TO STOP, NEVER A REASON TO GO. The default answer
   is "a leader decides". A claim gets approved only when it clears all of them,
   and `why` always says which one stopped it, because a swap board that
   silently does nothing looks identical to one that is broken.
   ══════════════════════════════════════════════════════════════════════════ */
export const DEFAULT_SWAP_POLICY = Object.freeze({
  /* ⚠️ OFF. See above. */
  on: false,
  /* Hours between now and the shift starting. Under this, a leader looks.
     A swap approved forty minutes before the door opens is exactly the one
     somebody should have seen. */
  minNoticeHours: 12,
  /* ⚠️ THE FLIGHT RISK RULE, AND IT IS A RULE RATHER THAN A REPORT ON PURPOSE.
     Matt, Aug 14 2026: "also pay attention to the shift swaps for flight
     risks." Somebody handing off their third shift of the week is telling the
     store something, and the worst possible response is a machine quietly
     making it frictionless. Past this count their drops still go up on the
     board — they just need a human to say yes. */
  maxDropsPerWeek: 2,
});

export function readSwapPolicy(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    on: p.on === true,
    minNoticeHours: num(p.minNoticeHours, DEFAULT_SWAP_POLICY.minNoticeHours),
    maxDropsPerWeek: num(p.maxDropsPerWeek, DEFAULT_SWAP_POLICY.maxDropsPerWeek),
  };
}

/* ── how often somebody hands a shift off ────────────────────────────────
   Counts OFFERS THEY MADE, not shifts they lost. Withdrawing one still counts:
   putting a shift up and taking it back is the same signal, and a count that
   only rose when somebody else picked it up would go up or down depending on
   how helpful their coworkers were that week.
   ⚠️ A DENIED OFFER COUNTS TOO. It was still a shift they did not want. */
export function dropCount(market, personId, weekOf) {
  const id = String(personId);
  return readMarket(market).offers.filter(
    (o) => o && String(o.fromPersonId) === id && (!weekOf || o.weekOf === weekOf),
  ).length;
}

/* Every week they have dropped in, most recent first, so a leader reads a
   pattern rather than one number. ⚠️ Weeks with none are absent, deliberately:
   this answers "how often", and padding it with zeroes would make three drops
   in three weeks look the same as three in twelve. */
export function dropHistory(market, personId) {
  const id = String(personId);
  const byWeek = new Map();
  readMarket(market).offers.forEach((o) => {
    if (!o || String(o.fromPersonId) !== id) return;
    byWeek.set(o.weekOf, (byWeek.get(o.weekOf) || 0) + 1);
  });
  const weeks = [...byWeek.entries()]
    .map(([weekOf, count]) => ({ weekOf, count }))
    .sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)));
  return { total: weeks.reduce((t, w) => t + w.count, 0), weeks };
}

/* One short line for a leader looking at an offer, or "" when there is nothing
   worth saying. ⚠️ TWO IS NOT A PATTERN AND MUST NOT READ LIKE ONE. Everybody
   swaps a shift; the line only appears once somebody is past the store's own
   cap, which is the same number that stops auto approval. */
export function dropFlag(market, personId, weekOf, policy) {
  const P = readSwapPolicy(policy);
  const week = dropCount(market, personId, weekOf);
  if (week <= P.maxDropsPerWeek) return "";
  const all = dropHistory(market, personId);
  const spread = all.weeks.length;
  return spread > 1
    ? `${week} shifts given up this week · ${all.total} across ${spread} weeks`
    : `${week} shifts given up this week`;
}

/* ── the decision ────────────────────────────────────────────────────────
   `ranked` is rankClaims(offer, ctx) — already checked and sorted, so this
   never re-runs a rule and cannot disagree with the screen showing it.

   Returns { approve, why }:
     approve  the winning ranked result, or null
     why      always set, in words a leader reads

   ⚠️ `nowMs` AND `startsAtMs` ARE PASSED IN, NEVER READ FROM THE CLOCK HERE.
   A pure function of its arguments is one a test can put on a Friday night. */
export function autoDecision({ offer, ranked, policy, market, nowMs, startsAtMs }) {
  const P = readSwapPolicy(policy);
  const list = Array.isArray(ranked) ? ranked : [];
  if (!P.on) return { approve: null, why: "Auto approve is off" };
  if (!offer || offer.status !== OFFER.OPEN) return { approve: null, why: "Not open" };
  if (!list.length) return { approve: null, why: "Nobody has claimed it yet" };

  /* Notice. ⚠️ AN UNKNOWN START TIME IS NOT ENOUGH NOTICE. When the caller
     cannot work out when the shift begins, that is a reason for a human, not a
     reason to skip the rule.
     ⚠️⚠️ `typeof`, NOT `Number(...)`. `Number(null)` and `Number("")` are both
     0, which is finite and means 1 Jan 1970 — so a caller that could not read
     the clock would have looked like a caller reporting infinite notice, and
     every shift would have cleared the rule. Caught by this file's own test. */
  const isMs = (v) => typeof v === "number" && Number.isFinite(v);
  if (!isMs(startsAtMs) || !isMs(nowMs)) {
    return { approve: null, why: "Cannot tell when that shift starts" };
  }
  const noticeHrs = (startsAtMs - nowMs) / 3600000;
  if (noticeHrs < P.minNoticeHours) {
    return {
      approve: null,
      why: noticeHrs < 0
        ? "That shift has already started"
        : `Starts in ${noticeHrs.toFixed(noticeHrs < 2 ? 1 : 0)} hours, under the ${P.minNoticeHours} hour rule`,
    };
  }

  /* How often this person is handing shifts off. */
  const drops = dropCount(market, offer.fromPersonId, offer.weekOf);
  if (drops > P.maxDropsPerWeek) {
    return { approve: null, why: `${offer.fromPersonName || "They"} has given up ${drops} shifts this week` };
  }

  /* ⚠️ CLEAN MEANS NO BLOCKERS AND NO NOTES. A note is overtime, or the minors
     list, or a long shift — every one of them a thing somebody should decide
     rather than discover on a payroll report. */
  const best = list[0];
  if (!best || !best.ok) return { approve: null, why: "No clean claim yet" };
  if (best.notes && best.notes.length) {
    return { approve: null, why: best.notes[0] };
  }

  const others = list.filter((r) => r.ok && (!r.notes || !r.notes.length)).length - 1;
  return {
    approve: best,
    why: others > 0
      ? `${best.claimerName} takes it, ahead of ${others} other${others === 1 ? "" : "s"}`
      : `${best.claimerName} takes it`,
  };
}
