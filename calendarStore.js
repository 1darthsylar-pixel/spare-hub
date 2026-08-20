/* ============================================================================
   calendarStore.js — Gate City Hub

   The internal calendar's rules. Who owns a type, who may book it, whether an
   owner is still taking bookings, and where each owner's times are stored.

   Bri, Aug 10 2026: "directors, HR, and executive directors can have a shared
   calendar we can all collaborate on and each have an individual calendar…
   I would like to have multiple options such as Leadership Interviews,
   Coaching, Evaluations, and L10, but the option to edit, add, or delete
   additional calendar types… edit who can schedule specific types of events
   (based on tiers in the Hub)… a 'Schedule' button underneath each director,
   HR, or Ex Director."

   ★ LEAF. Imports two other leaves and nothing else. App.jsx, the tile, Team
   Directory and worker.js all need these answers, and a rule about who may book
   whose time must have exactly one definition — this repo spent a whole day
   proving what happens when an identity rule exists twice.

   ═══ THE TWO STORES, AND WHY THEY ARE SHAPED DIFFERENTLY ═══════════════════

   TYPES — one row for the store. Rarely written, only by owners, and everybody
   needs the whole list to render a picker. Contention is near zero.

   SLOTS — ONE ROW PER OWNER, and this is the load-bearing decision. Every
   booking is a read-modify-write. Put ten leaders' times in one row and two
   people booking in the same second overwrite each other, silently. That is not
   hypothetical here: `gc-goal-submissions-v1` lost entries exactly that way on
   Jul 31 and the file still carries the note. Per-owner rows mean two leaders'
   calendars can never touch the same record, whatever the traffic.
   ⚠️ KEYED ON THE BARE ID so `tm27` and `27` cannot open two different
   calendars for one person. See nameMatch.js for why both shapes exist.
   ============================================================================ */

import { sameId, bareId } from "./nameMatch.js";
import { TEAM_TOOL_ADMIN_ROLES } from "./adminRoles.js";

export const TYPES_KEY = "gc-cal-types-v1";
export const slotsKey = (ownerId) => `gc-cal-slots-v1:${bareId(ownerId)}`;

/* ★ THE OWNER SET IS THE TEAM-TOOL ADMIN SET, NOT A NEW LIST. Bri asked for
   "directors, HR, and executive directors"; that list is already written down
   once, in adminRoles.js, and already means exactly those people plus her and
   Nick. A fresh list here would be the twelfth hand-written role list in the
   repo and the fifth copy of this one — which adminRoles.js exists to stop. */
const OWNER_ROLES = new Set(TEAM_TOOL_ADMIN_ROLES);
export const isCalendarOwner = (role) =>
  OWNER_ROLES.has(String(role || "").trim().toLowerCase());

/* ═══ IS THIS OWNER STILL TAKING BOOKINGS? ══════════════════════════════════
   Matt, Aug 10 2026, asked what happens when a leader leaves: "stop new
   bookings when they leave."

   ⚠️ THIS GATES BOOKING ONLY. Bookings already made stay on both calendars and
   keep showing until they pass. Somebody who has an evaluation with Kyleeka
   next week must not have it silently vanish because her last day was entered;
   the person who needs to know is a human, and deleting the row is how they
   find out the hard way.
   ⚠️ FAILS CLOSED. No roster row, an unknown status, or a title that is no
   longer an owner title all stop new bookings. Refusing to book is recoverable
   in a sentence; booking time with somebody who has left is not. */
export function ownerAccepting(person) {
  if (!person) return false;
  const status = String(person.status || "Active").trim().toLowerCase();
  if (status !== "active") return false;
  return isCalendarOwner(person.role);
}

// ── types ───────────────────────────────────────────────────────────────────
/* A type:
     { id, label, ownerId, coHostIds: [], minTier: 1, mins: 30, active: true,
       desc: "" }
   `minTier` is the Hub tier that may BOOK it — 1 anyone, 2 leaders, 3 directors
   and up — which is Bri's "edit who can schedule specific types of events
   (based on tiers in the Hub)" expressed in the tiers the Hub already has.

   ⚠️ `desc` IS NEW (Bri, Aug 11 2026: "We can also add a short description of
   each meeting type so someone knows what they are signing up for"). Optional,
   and every reader goes through `typeDesc` below, so a type saved before this
   existed reads as "" rather than "undefined" on a screen. Design rule 1: the
   old records were not migrated and did not need to be. */

/* ═══ HOW LONG IS IT? ═══════════════════════════════════════════════════════
   Bri, Aug 11 2026: "Can we make the times for events in terms of hours and
   minutes, not just minutes?"

   ⚠️⚠️ STORAGE IS STILL MINUTES AND DOES NOT MOVE. Hours and minutes is how a
   person TYPES it and READS it, not how it is kept. Every event, slot and type
   in the database already holds a minute count, the Worker's ICS builder reads
   minutes, and the booking route does its arithmetic in minutes. Changing the
   stored unit to satisfy a label would have rewritten live records for a
   wording change, which is the trade design rule 1 exists to refuse.

   ⚠️ ONE DEFINITION, FIVE SCREENS. "N min" was written out at nine call sites
   across four files. Nine copies of a format string is nine chances for the
   calendar to describe the same meeting two ways. */
export const splitDuration = (mins) => {
  const n = Math.max(0, Math.floor(Number(mins) || 0));
  return { h: Math.floor(n / 60), m: n % 60 };
};

/* Hours and minutes back to storage. Clamped to the same 5-to-480 window
   `makeEvent` already enforces, so the two cannot disagree about what is
   allowed — a form that accepts 900 minutes and a writer that silently stores
   480 is a save that looks like it worked. */
export const joinDuration = (h, m) => {
  const total = (Math.max(0, Math.floor(Number(h) || 0)) * 60)
    + Math.max(0, Math.floor(Number(m) || 0));
  return Math.max(5, Math.min(480, total || 30));
};

/* ⚠️ LABELS ARE PASSED IN because Professional Growth renders in Spanish and
   English off one component. A hardcoded "hr" here would have been the one
   English word left in a translated sentence. Defaults keep every other caller
   a one-argument call. */
export function durationText(mins, labels) {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return "";
  const L = labels || {};
  const hr = L.hr || "hr";
  const min = L.min || "min";
  const { h, m } = splitDuration(n);
  if (!h) return `${m} ${min}`;
  if (!m) return `${h} ${hr}`;
  return `${h} ${hr} ${m} ${min}`;
}

/* The description, guarded. A type saved before `desc` existed has no such key
   and must read as empty, never as the string "undefined" on a booking screen. */
export const typeDesc = (t) => String((t && t.desc) || "").trim();

/* ═══ IS THIS PERSON ALREADY BUSY? ══════════════════════════════════════════
   Bri, Aug 11 2026: "Double booking can alert the person scheduling that
   someone is already booked, but they can push the invite anyway if they
   choose. If the invitee is double booked, alert with both items to compare
   for accept/decline — give the choice to the invitee to accept one and
   decline the other — even if one has already been accepted."

   ⚠️⚠️ IT NEVER BLOCKS. Every path this feeds ends in the invitation being
   sendable. Her sentence has "but they can push the invite anyway" in it, and
   a check that refused would be answering a question she did not ask.

   ⚠️ TOUCHING IS NOT CLASHING. A meeting that ends at 10:00 and one that starts
   at 10:00 are back to back, which is a normal day, not a conflict. Strict
   `<` on both sides. Getting this wrong makes the alert fire on every
   consecutive pair and teaches everyone to ignore it inside a week.

   ⚠️ AN UNREADABLE TIME CANNOT BE PROVEN TO CLASH, so it does not. This is the
   one place here that fails OPEN rather than closed, deliberately: the cost of
   a missed warning is a person deciding for themselves, which is what the
   feature does anyway, and the cost of a false one is an alert nobody trusts.

   ⚠️ SAME `at` CONVENTION AS EVERYTHING ELSE. Both sides are datetime-local
   strings read through `new Date`, so both land in the DEVICE's own day and
   neither is sliced as text. See the dayKey note above for the evening-shift
   bug that convention caused. */
const spanOf = (x) => {
  const s = new Date(String((x && x.at) || "")).getTime();
  if (!Number.isFinite(s)) return null;
  const m = Math.max(1, Number((x && x.mins) || 30));
  return { s, e: s + m * 60000 };
};

export function overlaps(a, b) {
  const A = spanOf(a);
  const B = spanOf(b);
  if (!A || !B) return false;
  return A.s < B.e && B.s < A.e;
}

/* Which of `others` collide with `item`. Used by the Worker to answer "who is
   busy" and by the screen to show a person their two clashing meetings, so the
   two can never disagree about what counts. */
export const clashesFor = (item, others) =>
  (Array.isArray(others) ? others : []).filter((o) => o && overlaps(item, o));

/* ⚠️ AN UNANSWERED INVITATION IS NOT A COMMITMENT (Matt's ruling, Aug 12 2026).
   Being asked to something is not being at it, and treating a maybe as a clash
   would have an organiser scheduling around meetings nobody agreed to. What
   makes you busy: a meeting you called, and one you said yes to. A decline
   never does, and neither does silence. */
export function busyItems(organised, invitedPairs, replies) {
  const out = eventList(organised).map((e) => ({ at: e.at, mins: e.mins, title: e.title, why: "yours" }));
  for (const p of (Array.isArray(invitedPairs) ? invitedPairs : [])) {
    const ev = p && p.event;
    if (!ev) continue;
    if (replyStatus(ev, replies) !== ACCEPTED) continue;
    out.push({ at: ev.at, mins: ev.mins, title: ev.title, why: "accepted" });
  }
  return out;
}
export const typeList = (types) => (Array.isArray(types) ? types.filter(Boolean) : []);

/* Everything this person runs, whether it is theirs or they were added to it.
   Bri: "Hannah and I often conduct leadership interviews or evaluations
   together so I would want to add her to those certain event types." A co-host
   sees and manages the type; the times still hang off the OWNER's calendar, so
   there is one diary per type rather than two that can disagree. */
export const isCoHost = (t, personId) =>
  Array.isArray(t && t.coHostIds) && t.coHostIds.some((id) => sameId(id, personId));
export const ownsType = (t, personId) => !!t && sameId(t.ownerId, personId);
export const canManageType = (t, personId) => ownsType(t, personId) || isCoHost(t, personId);
export const typesRunBy = (types, personId) =>
  typeList(types).filter((t) => canManageType(t, personId));
export const typesOwnedBy = (types, personId) =>
  typeList(types).filter((t) => ownsType(t, personId));

/* ═══ MAY THIS PERSON BOOK THIS TYPE? ═══════════════════════════════════════
   Matt's ruling, Aug 10: anyone may book, gated per type. So Coaching can be
   open to the whole team while Evaluations and L10 are leaders only, which is
   what Bri asked for and is hers to set per type rather than mine to hardcode.

   ⚠️ EVERY ARM FAILS CLOSED. A missing type, a retired one, an owner who has
   left, or a tier we could not work out all refuse. */
export function canBookType(type, viewerTier, accepting) {
  if (!type || type.active === false) return false;
  if (!accepting) return false;
  const tier = Number(viewerTier);
  if (!Number.isFinite(tier) || tier < 1) return false;
  return tier >= Number(type.minTier || 1);
}

/* The types a given person may book with a given owner. `accepting` is the
   answer from ownerAccepting for that owner, passed in rather than recomputed
   so the caller reads the roster once. */
export function bookableTypes(types, ownerId, viewerTier, accepting) {
  return typesOwnedBy(types, ownerId).filter((t) => canBookType(t, viewerTier, accepting));
}

// ── slots ───────────────────────────────────────────────────────────────────
/* A slot: { id, typeId, at, mins, booked: null | { uid, slug, name, at } } */
export const slotList = (slots) => (Array.isArray(slots) ? slots.filter(Boolean) : []);
export const bySoonest = (a, b) =>
  String((a && a.at) || "").localeCompare(String((b && b.at) || ""));

/* Open times for one type, soonest first. */
export const openSlots = (slots, typeId) =>
  slotList(slots).filter((s) => !s.booked && String(s.typeId) === String(typeId)).sort(bySoonest);

/* ═══ IS THIS SLOT BOOKED BY THIS PERSON? ═══════════════════════════════════
   ⚠️ MATCHED ON THE BOOKER'S `uid` — the id off the signed token, which
   /api/calendar writes and nothing in a browser can set. Never on a name typed
   anywhere, and deliberately NOT on the slug either: the slug is built from a
   name, so the day somebody's nickname changes in HR their own booking stops
   being theirs and the Cancel button disappears from under them.
   `sameId` because both id shapes are real here — `tm27` and `27` are one
   person, and this repo spent a day proving what happens when they are not
   treated as one. A missing uid matches nobody rather than everybody. */
export const bookedBy = (slot, uid) => !!(slot && slot.booked && sameId(slot.booked.uid, uid));

/* The slot this person holds on this owner's calendar, or null. Pass a typeId
   to ask the narrower question — "do they already hold one of THIS type" —
   which is the one-per-type rule the booking route enforces. Both the route and
   the booking screen ask through here, so "you already have one" can never mean
   two different things on the two sides of the same button. */
export const heldBy = (slots, uid, typeId) =>
  slotList(slots).find((s) => bookedBy(s, uid)
    && (typeId == null || String(s.typeId) === String(typeId))) || null;

/* Everything still ahead of now, booked or not — what a month view draws.
   Past slots are kept in the record and simply stop being offered. */
export const upcoming = (slots, now = new Date()) =>
  slotList(slots).filter((s) => {
    const d = new Date(s.at);
    return !isNaN(d) && d >= now;
  }).sort(bySoonest);

/* ═══ THE MONTH GRID ════════════════════════════════════════════════════════
   Bri, Aug 10 2026: "maybe have a month at a glance option as well as something
   detailed if needed."

   ⚠️ LOCAL DATES, NEVER ISO SLICING. `s.at` is written by a `datetime-local`
   input, so `at.slice(0, 10)` looks right and is wrong the moment a time is
   stored with a zone — and this repo has the scar: the Team Directory's reveal
   dates used a UTC form that "named tomorrow after 8pm Eastern", which is the
   whole evening shift. `en-CA` gives YYYY-MM-DD in the DEVICE's own day, which
   is the day the person standing in the restaurant means. */
export const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? "" : x.toLocaleDateString("en-CA");
};

/* Every day of the month `anchor` falls in, padded out to whole weeks so the
   grid is rectangular. Sunday first, matching every other date surface here. */
export function monthGrid(anchor) {
  /* ⚠️ `null` AND `""` ARE REJECTED BEFORE new Date() SEES THEM, because both
     parse to the EPOCH rather than to Invalid Date — so an isNaN guard alone
     lets a missing anchor through and quietly draws January 1970. A month grid
     with no month is nothing, not 1970. */
  if (!(anchor instanceof Date) && (anchor == null || anchor === "")) return [];
  const a = anchor instanceof Date ? anchor : new Date(anchor);
  if (isNaN(a)) return [];
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const out = [];
  /* Six weeks covers every possible month layout. Trailing all-blank weeks are
     dropped below so a short month does not draw an empty row. */
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ date: d, key: dayKey(d), inMonth: d.getMonth() === a.getMonth() });
  }
  while (out.length > 28 && !out.slice(-7).some((c) => c.inMonth)) out.length -= 7;
  return out;
}

/* Slots grouped by the day they fall on: { "2026-08-20": [slot, slot] }.
   Takes an already-merged list so a month can show one owner's published times
   and that person's own bookings elsewhere in one grid. */
export function byDay(slots) {
  const out = {};
  for (const s of slotList(slots)) {
    const k = dayKey(s.at);
    if (!k) continue;                      // an unparseable time is dropped, not crashed on
    (out[k] || (out[k] = [])).push(s);
  }
  for (const k of Object.keys(out)) out[k].sort(bySoonest);
  return out;
}

/* ═══ INVITATIONS ═══════════════════════════════════════════════════════════
   Bri, Aug 11 2026: "let's make an option to self-schedule ourselves on the
   calendar, as well as invite others… They should be able to accept or decline
   anything scheduled… I want to also be able to reschedule and propose new
   days/times if needed."

   ★★ THIS IS THE OTHER DIRECTION, AND IT IS ADDED BESIDE THE BOOKING ABOVE,
   NEVER ON TOP OF IT. Everything above is Calendly: an owner publishes times
   and somebody takes one. This is Google Calendar: an organiser names a time
   and invites people, who answer. Both are real needs — people book Bri's
   office hours, and Bri schedules an L10 — and they are opposite arrows. The
   booking screen keeps working exactly as it does today; nothing above this
   line changed. Replacing a working surface with a half-finished better one is
   a regression even when the new design is better (design rule 16).

   ⚠️⚠️ TWO ROWS, AND EXACTLY ONE WRITER EACH. This is the same ruling the SLOTS
   comment at the top of this file makes, for the same reason, and it matters
   MORE here. An L10 invites five directors; five people can answer inside the
   same minute. Put their answers in the event record and two accepts are a
   read-modify-write race that silently loses one — which is precisely how
   `gc-goal-submissions-v1` lost entries on Jul 31.

       gc-cal-events-v1:<organiserId>   written ONLY by the organiser
       gc-cal-replies-v1:<personId>     written ONLY by that person

   The event holds WHO WAS INVITED. Each person's own row holds WHAT THEY SAID.
   Nobody ever writes a row somebody else also writes, so the race cannot exist
   rather than being unlikely.

   ⚠️ A DECLINE NEVER REMOVES ANYBODY. Bri, asked directly what should happen:
   "Stays on marked out unless I manually remove it or reschedule it." So the
   invitee list is the organiser's, the answer is the invitee's, and a decline
   changes the answer and nothing else. An event that quietly loses people as
   they decline would leave an organiser unable to see who is not coming, which
   is the entire question they are asking.

   ⚠️⚠️ AND NOTHING EVER CLEARS A REPLY ROW, INCLUDING RESCHEDULING. That is
   the third decision holding the two above up. Moving a meeting has to undo
   every answer, and the obvious way to do that — reach into all five invitees'
   rows and blank them — is precisely the cross-writing the one-writer rule
   forbids, reintroducing the exact race in the one operation that touches
   everybody at once. Instead the reply records the meeting time it was about
   and a stale answer stops counting on its own. See answerIsCurrent.
   ══════════════════════════════════════════════════════════════════════════ */

export const eventsKey = (organiserId) => `gc-cal-events-v1:${bareId(organiserId)}`;
export const repliesKey = (personId) => `gc-cal-replies-v1:${bareId(personId)}`;

/* invited = asked, has not answered. It is a real state, not a missing one:
   "three people have not replied" is the thing an organiser chases. */
export const INVITED = "invited";
export const ACCEPTED = "accepted";
export const DECLINED = "declined";
const ANSWERS = new Set([ACCEPTED, DECLINED]);

/* An event:
     { id, typeId, title, at, mins, organiserId, inviteeIds: [], note }
   `at` is a datetime-local string, the same shape a slot's `at` is, so dayKey
   and monthGrid above read both without a second date convention. */
export const eventList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

export function makeEvent(fields) {
  const f = fields || {};
  const ids = Array.isArray(f.inviteeIds) ? f.inviteeIds : [];
  /* ⚠️ DEDUPED ON THE BARE ID. `tm27` and `27` are one person, and inviting
     them twice would show two rows for one human and count them twice in
     "4 of 6 accepted". Same rule the slots key uses. */
  const seen = new Set();
  const inviteeIds = [];
  for (const id of ids) {
    const b = bareId(id);
    if (!b || seen.has(b)) continue;
    seen.add(b);
    inviteeIds.push(String(id));
  }
  return {
    id: String(f.id || ""),
    typeId: f.typeId == null ? null : String(f.typeId),
    title: String(f.title || "").trim(),
    at: String(f.at || ""),
    mins: Math.max(5, Math.min(480, parseInt(f.mins, 10) || 30)),
    organiserId: String(f.organiserId || ""),
    inviteeIds,
    note: String(f.note || "").trim(),
    /* ⚠️⚠️ CARRIED THROUGH, NEVER DEFAULTED HERE, AND THE DIFFERENCE IS THE
       WHOLE GUARD. `update` rebuilds an event by spreading the stored one into
       this function, so if this line invented a value the stamp would reset on
       every title edit and 60 people would be re-alerted about a typo.
       Absent stays absent; the CREATE path is the only caller that sets it. */
    ...(f.notifiedFor === undefined ? {} : { notifiedFor: String(f.notifiedFor) }),
  };
}

/* ═══ HAS THIS MEETING BEEN ANNOUNCED, AT THIS TIME? ════════════════════════
   ★ THE STAMP IS THE MEETING'S TIME, NOT A BOOLEAN OR A DATE, and that one
   choice is what makes the reschedule rule fall out instead of being written
   twice. Bri's ruling is that moving a meeting clears every answer and re-asks;
   re-asking somebody without telling them is exactly the hole notifications
   exist to close. Because the stamp holds the `at` that was announced, a moved
   meeting stops matching and needs telling again, and a title edit does not.
   No second flag, no "wasRescheduled", nothing for the two rules to drift apart
   on.

   ⚠️⚠️ ABSENT MEANS "FROM BEFORE THIS EXISTED", AND IT MEANS DO NOT SEND.
   That is rule 1 doing real work rather than being quoted. Meetings written
   before notifications shipped have no stamp and nobody was ever told about
   them. Treating absent as "never sent" would have the first deploy announce
   every meeting already on every calendar — including ones in the past — to
   everybody invited. The empty string is the "new and unsent" value, and only
   the create path sets it, so new and old are distinguishable forever.

   ⚠️ AN EVENT WITH NO `at` NEVER NEEDS TELLING. Nothing can build a calendar
   invite out of a missing time, and the caller would be asking 60 people to
   attend nothing. */
export function needsTelling(ev) {
  if (!ev || !ev.at) return false;
  if (ev.notifiedFor === undefined || ev.notifiedFor === null) return false;
  return String(ev.notifiedFor) !== String(ev.at);
}

/* Stamp it as told, for the time it was told about. Returns a NEW object —
   the caller writes it — because every other rule in this leaf is pure and one
   that mutated its argument would be the odd one out. */
export const markTold = (ev) => ({ ...(ev || {}), notifiedFor: String((ev && ev.at) || "") });

export const isInvited = (ev, personId) =>
  !!ev && Array.isArray(ev.inviteeIds) && ev.inviteeIds.some((id) => sameId(id, personId));

/* The organiser runs it. Co-hosts on the TYPE run it too, which is Bri's
   "Hannah and I often conduct leadership interviews together" carried over
   from the booking side rather than invented again here. */
export const organises = (ev, personId) => !!ev && sameId(ev.organiserId, personId);
export function canManageEvent(ev, personId, types) {
  if (organises(ev, personId)) return true;
  const t = typeList(types).find((x) => x && String(x.id) === String(ev && ev.typeId));
  return !!t && isCoHost(t, personId);
}

/* A reply row: { [eventId]: { status, at, forAt, proposedAt, note } }
   ⚠️ `proposedAt` RIDES ON A DECLINE, deliberately. Bri: "a rescheduling
   proposal can be an option upon declining if we want." Declining with a
   suggestion and declining flat are the same answer with different
   helpfulness, not two different answers — modelling them as two statuses
   would make "who is not coming" a question with two correct queries.

   ⚠️⚠️ `forAt` IS THE MEETING TIME THIS ANSWER WAS ABOUT, and it is what makes
   rescheduling safe. `at` is WHEN they answered; `forAt` is WHAT they answered
   about. See answerIsCurrent below. */
export function makeReply(status, extra) {
  const e = extra || {};
  const s = ANSWERS.has(status) ? status : INVITED;
  const out = { status: s, at: String(e.at || ""), forAt: String(e.forAt || "") };
  if (s === DECLINED && e.proposedAt) out.proposedAt = String(e.proposedAt);
  if (e.note) out.note = String(e.note).trim();
  return out;
}

export const replyMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/* ═══ IS THIS ANSWER STILL AN ANSWER? ═══════════════════════════════════════
   ★★ THE RULE THAT LETS RESCHEDULING WORK WITHOUT ANYBODY WRITING ANYBODY
   ELSE'S ROW. An accept answers a QUESTION — "can you make 9am Tuesday". Move
   the meeting and that question is gone, so the answer to it is gone with it.

   The obvious build is: on reschedule, go and clear all five invitees' reply
   rows. That is exactly the cross-writing this file is built to forbid — five
   rows, five owners, one writer reaching into all of them, and an answer given
   in the same second is silently lost. The race would be back, in the one
   place the whole design exists to keep it out of.

   ⚠️ SO NOTHING IS EVER CLEARED. The reply records WHICH TIME it was about,
   and an answer about a time the meeting no longer sits at simply stops
   counting. Rescheduling writes one row — the organiser's own event — and
   every stale answer falls away on its own.

   ⚠️ STRING EQUALITY ON THE TIME, NOT A TIMESTAMP COMPARISON. `at` is a
   datetime-local string and both sides are copies of the same field, so this
   asks "the same meeting time?" and never "which happened first?". No clock
   skew between a phone and the Worker, no timezone, nothing to get wrong.

   ⚠️ AND IT CANNOT BE BYPASSED. A version counter on the event only works if
   every writer remembers to bump it; this reads the time itself, so ANY path
   that moves a meeting invalidates the answers, including one written later by
   somebody who never read this comment.

   ⚠️ MISSING EITHER SIDE MEANS NOT CURRENT, which re-asks somebody who may
   already have answered. That is the safe direction and it is the same one
   `ownerAccepting` takes: being asked twice is recoverable in a sentence,
   walking into a room expecting four people who never agreed is not. */
export function answerIsCurrent(ev, reply) {
  const evAt = String((ev && ev.at) || "");
  const forAt = String((reply && reply.forAt) || "");
  return !!evAt && !!forAt && evAt === forAt;
}

/* One person's answer to one event. `replies` is THAT person's row.
   ⚠️ NO ROW AND NO ENTRY BOTH MEAN `invited`, never "declined" and never a
   blank. Somebody who has not opened the Hub yet has not refused, and an
   organiser reading "declined" for a person who was never asked would chase
   the wrong conversation.
   ⚠️ AN ANSWER TO AN OLD TIME READS `invited` TOO, for the same reason: they
   have not answered THIS question. See answerIsCurrent above.
   ⚠️ TAKES THE EVENT, NOT AN ID, ON PURPOSE. The freshness rule needs the
   event's time, and a second id-only reader would be a way to skip the check
   without noticing — design rule 8. */
export function replyStatus(ev, replies) {
  const r = replyMap(replies)[String((ev && ev.id) || "")];
  const s = r && r.status;
  if (!ANSWERS.has(s)) return INVITED;
  return answerIsCurrent(ev, r) ? s : INVITED;
}

/* ⚠️ AN ANSWER FROM SOMEBODY NOT ON THE LIST IS IGNORED, not counted. The
   invitee list is the organiser's; a stale reply row from before somebody was
   removed must not put them back in the tally. */
export function statusFor(ev, personId, repliesByPerson) {
  if (!isInvited(ev, personId)) return null;
  const rows = (repliesByPerson && typeof repliesByPerson === "object") ? repliesByPerson : {};
  const key = Object.keys(rows).find((k) => sameId(k, personId));
  return replyStatus(ev, key == null ? null : rows[key]);
}

/* Who is coming, who is not, and who has not said — the three numbers an
   organiser actually wants. Declines are RETURNED, not filtered out. */
export function attendance(ev, repliesByPerson) {
  const out = { accepted: [], declined: [], pending: [] };
  for (const id of (ev && ev.inviteeIds) || []) {
    const s = statusFor(ev, id, repliesByPerson);
    if (s === ACCEPTED) out.accepted.push(String(id));
    else if (s === DECLINED) out.declined.push(String(id));
    else out.pending.push(String(id));
  }
  return out;
}

/* Rescheduling is the ORGANISER moving the event, and every answer stops
   counting the moment it lands.
   ⚠️ THIS IS THE WHOLE REASON IT LIVES HERE. An accept is an answer to a
   QUESTION — "can you make 9am Tuesday" — so carrying it onto a different time
   would record consent nobody gave, and an organiser would walk into a room
   expecting four people who never agreed to be there. Everyone is asked again.
   ⚠️ IT CLEARS NOTHING, AND IT DOES NOT NEED TO. Changing `at` is what
   invalidates the answers, through answerIsCurrent above, so this writes the
   organiser's own row and no other. `reask` is the list to TELL — a re-invite
   nobody hears about is a meeting nobody comes to — and is no longer a list of
   rows for somebody to go and overwrite. */
export function reschedule(ev, at, mins) {
  const next = makeEvent({ ...ev, at, mins: mins == null ? ev && ev.mins : mins });
  return { event: next, reask: [...(next.inviteeIds || [])] };
}

/* Everything still ahead of now, soonest first — the same rule `upcoming` uses
   for slots, so the two halves of the calendar age out identically. */
export function upcomingEvents(list, now = new Date()) {
  return eventList(list).filter((e) => {
    const d = new Date(e.at);
    return !isNaN(d) && d >= now;
  }).sort(bySoonest);
}

/* Events this person needs to answer: invited, still ahead, no answer yet. */
export function awaitingReply(list, personId, replies, now = new Date()) {
  return upcomingEvents(list, now)
    .filter((e) => isInvited(e, personId) && replyStatus(e, replies) === INVITED);
}

/* ══════════════════════════════════════════════════════════════════════════
   WHO TO SHOW IN THE "Who is coming" LIST.

   Matt, Aug 19 2026: "I would like the same view as Lineup for the list of
   people to invite to a meeting."

   ⛔ WHAT IT WAS. Every person on the roster, all at once, as a wall of chips.
   At ~106 people that is a very long scroll to find one name, with no way to
   search and no way to tell at a glance who you had already picked. Lineup hit
   exactly this and answered it with one box — see PeopleSearch in
   Availability.jsx, whose own comment records that the skills tab had no way to
   find a person at all.

   ⚠️⚠️ SOMEBODY ALREADY PICKED IS ALWAYS SHOWN, EVEN IF THEY DO NOT MATCH.
   This is the whole care in the function. Filter them out and typing a second
   name makes the first one vanish off the screen — the selection is still there
   in state, so nothing is lost, but the person sending the invitation cannot
   SEE who is on it and has no way to take one off. A picker you cannot review
   before you press send is worse than a long list.

   ⚠️ SORTED BY NAME, because the roster's own order is not one anybody can
   predict: the live list runs Denise before Brooke and Daisy before Hannah.
   ⚠️ AND NEVER YOURSELF. Calling a meeting already puts you in it. */
export function invitePickList(people, query, picked, myId) {
  const all = Array.isArray(people) ? people : [];
  const on = new Set((Array.isArray(picked) ? picked : []).map((x) => bareId(x)));
  const q = String(query == null ? "" : query).trim().toLowerCase();
  const mine = bareId(myId);
  return all
    .filter((p) => p && p.name && (!mine || bareId(p.id) !== mine))
    .filter((p) => !q || on.has(bareId(p.id)) || String(p.name).toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
