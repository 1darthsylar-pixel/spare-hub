/* ============================================================================
   announcements.js — THE RULES FOR AN ANNOUNCEMENT, IN ONE PLACE

   Matt, Aug 13 2026, setting the boundary before any of this was written:
   "Every message in the Hub is attached to something. A shift, a swap, a
   request off, or an announcement. There is no free-form chat between team
   members." And the reason, in his words: "free-form employee messages in a
   system I host make me the custodian of records that get subpoenaed in a
   harassment or wage claim. Attached messaging is narrow enough to be
   defensible. Open chat is not."

   ⚠️⚠️ SO THERE IS NO `to` FIELD ON A MESSAGE HERE, AND THERE MUST NEVER BE.
   An announcement has an AUDIENCE, resolved once at send time into a list of
   ids. A person cannot address another person. If a future change adds a way
   to name one recipient, that is a direct message wearing an announcement's
   clothes, and it is the drift this file exists to refuse.

   ★ LEAF MODULE. Imports NOTHING BUT nameMatch.js, which is itself
   dependency-free — the same bargain boardOwner.js takes and for the same
   reason. The worker and the screen both read this file, so "who can see this"
   cannot mean two different things in two places, and after Aug 13 neither can
   "is this the same person" (see the id note further down, which is the bug
   that took the whole feature down on its first day).

   ⚠️ TARGETS ARE RESOLVED AT SEND TIME AND STORED, never recomputed on read.
   A person who changes role next month must still appear on the read list of
   an announcement sent to their old role, because the question the list
   answers is "who was told", not "who would be told today". Recomputing would
   silently rewrite history every time somebody moved teams.

   ⚠️ NOTHING IS EVER EDITED OR DELETED. A correction is a new announcement; a
   retraction is a flag that keeps the original readable. Both are Matt's
   rules and both are here rather than in a screen, because a screen that
   forgets them is one deploy away.
   ============================================================================ */

/* ── Retention ───────────────────────────────────────────────────────────
   ⚠️⚠️ DEFAULTS, NOT SETTINGS. Every one of these is overridable per store
   through Store Settings, and that is design rule 18 rather than politeness:
   a retention period is a thing a store's own lawyer has an opinion about, and
   a number written in this file is Gate City's opinion travelling into
   somebody else's records policy without them choosing it.
   ⚠️ `null` MEANS KEEP INDEFINITELY and is deliberately not a huge number.
   A big number is a period that quietly expires; null cannot. */
export const RETENTION_DEFAULT_DAYS = {
  announcements: null,   // Matt: "keep indefinitely"
  shiftThreads: null,    // "keep with the request" — the request's own lifetime
  escalations: 365,      // "12 months"
};

/* ⚠️ A USER NEVER DELETES. Purging is an owner action on a schedule, which is
   why this answers a question rather than offering a delete: the caller is a
   scheduled purge, never a screen. Retention off (null) always answers false,
   so "keep indefinitely" cannot be overridden by a stale date.

   ⚠️⚠️ IT TAKES A DATE, NOT A RECORD, AND THAT CHANGED Aug 13 2026 WHEN THE
   PURGE WAS ACTUALLY WRITTEN. It used to read `rec.createdAt`, which is the
   field ONE of the three messaging types carries:

     announcement   createdAt
     escalation     at
     shift thread   nothing at all — only a per-post `at`

   So it silently answered false for two of the three, and a purge built on it
   would have reported "0 removed" forever while looking like it worked. That
   is the worst shape a delete job can have: a thing that looks connected and
   serves nothing.

   ⇒ THE CALLER SAYS WHICH DATE IT MEANS. A record cannot be asked to guess
   where its own timestamp lives, and a helper that tried three field names
   would quietly pick the wrong one the first time a fourth type arrived.
   Free to change: this had ZERO callers before today.

   ⚠️ ANYTHING UNREADABLE ANSWERS false — a missing or malformed date must
   never round to "old enough to delete". Every uncertain case keeps the
   record, because a wrongly kept record is a tidiness problem and a wrongly
   deleted one is gone. */
export function purgeableOn(whenIso, days, now = new Date()) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return false;
  if (!whenIso) return false;
  const made = new Date(whenIso);
  if (isNaN(made)) return false;
  return (now - made) / 86400000 > d;
}

/* ── The audience ────────────────────────────────────────────────────────
   Four kinds and no more, matching what Matt asked for: everyone, one role,
   one team, one shift. The KIND and its LABEL are stored beside the resolved
   ids so a read list can say what the sender chose, not just how many people
   it hit — "Role: Team Leader" is auditable, "34 people" is not. */
/* ⚠️ "leaders" ADDED Aug 14 2026. Matt: "for announcements we need a leaderships
   dropdown and a whole team drop down." The whole team was already `everyone`;
   leadership was the one that could only be done by picking roles one at a time
   and sending the same notice four times.

   ⚠️ ADDING A KIND CANNOT BREAK A STORED RECORD. Every announcement stores its
   own `kind`, and `makeAnnouncement` falls back to "everyone" for anything it
   does not recognise — so old rows keep reading exactly as they did, and a row
   written by a newer client cannot confuse an older reader into a WIDER
   audience than intended. Design rule 1.
   ⚠️ WHO IS A LEADER IS NOT DECIDED HERE. It is `hrTierOfTitle` in hrRoster.js,
   the same ladder HR access and the Lineup groups read. A second opinion about
   who counts as leadership is exactly the drift design rule 8 is about. */
export const AUDIENCE_KINDS = ["everyone", "leaders", "role", "team", "shift"];

export function audienceLabel(aud) {
  const a = aud || {};
  const k = String(a.kind || "");
  if (k === "leaders") return "Leadership";
  if (k === "role") return `Role: ${a.role || "—"}`;
  if (k === "team") return `Team: ${a.teamName || a.teamId || "—"}`;
  if (k === "shift") return `Shift: ${a.shift || "—"}`;
  return "Everyone";
}

const clean = (v) => String(v == null ? "" : v).trim();

/* ⚠️⚠️ THIS FILE USED TO COMPARE IDS WITH `===` AND IT BROKE THE WHOLE FEATURE.
   Measured in the live project Aug 13 2026, hours after part 1 merged:

     gcfcr-hr-team-v1   ids are  tm1, tm2, tm3 …   ← what the compose box sends
     gcfcr-hr-pins      keys are 1, 2, 3 …          ← what sign-in mints into the
     gcfcr-hr-status    keys are 1, 2, 3 …             token, so `uid` is BARE

   So `targetIds` held "tm55" while `uid` was "55", `"tm55" === "55"` is false,
   and EVERY team member saw zero announcements, could not open one, and could
   not confirm one. A leader could post all day and it reached nobody. Proved
   against the booted Worker with production-shaped ids: 3 passed, 5 failed.

   ⚠️ MY OWN TEST FIXTURE IS WHAT HID IT. The 35 assertions that shipped part 1
   seeded the roster as `{id:"17"}` — bare — so both sides agreed and every one
   of them passed. That is the "fixture that only ever carries the assumed
   record" failure supabase-schema.sql already warns about, in a test I wrote
   the same day I read the warning.

   ⇒ IDS ARE COMPARED BARE, EVERYWHERE, THROUGH THE ONE HELPER THE REPO ALREADY
   HAS. `bareId` is nameMatch.js's and it is why `sameId` exists — `tm27` and
   `27` are one person in every other corner of this app.

   ⚠️ THIS FILE IS NO LONGER "IMPORTS NOTHING"; it imports nameMatch.js and
   NOTHING ELSE. That is the bargain boardOwner.js already took and documented,
   for this exact reason: nameMatch.js is itself dependency-free, so the leaf
   property survives. Copying `bareId` in here instead would have been a THIRD
   private copy of it (shiftThreads.js and escalations.js each hold one), and
   design rule 8 exists because `normName` once existed three times and the
   thing it decides is who matches whom. */
import { bareId } from "./nameMatch.js";

const sameId = (a, b) => {
  const x = bareId(a);
  return x !== "" && x === bareId(b);
};

/* Deduped on the BARE id, so the same person arriving as "tm55" through one
   audience source and "55" through another is one recipient, not two. The
   read list would otherwise show them twice and "12 of 30 opened" stops
   adding up.
   ⚠️ THE ROSTER'S OWN SPELLING IS WHAT GETS STORED, not the bared one. The
   read list names people by looking these ids up in the roster, and rewriting
   them here would leave a stored record that no longer matches the list it
   came from. Compare loosely, store faithfully. */
function uniqIds(ids) {
  const seen = new Set(); const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const s = clean(raw);
    const k = bareId(s);
    if (!s || !k || seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out;
}

/* Was this sent to this person, whichever way either id is spelled. One
   function, because the four places that used to ask this each asked it with
   their own `===` and all four were wrong together. */
const isTarget = (a, personId) =>
  (Array.isArray(a && a.targetIds) ? a.targetIds : []).some((id) => sameId(id, personId));

/* One person's stamp out of an `opens` or `acks` map, found by bare id. The
   fast path is the key the routes actually write (bare); the scan is the
   fallback for a map keyed the other way, which is rule 1 — old records must
   still read, and this app has shapes written by more than one route. */
export function stampFor(map, personId) {
  const m = map && typeof map === "object" ? map : {};
  const k = bareId(personId);
  if (!k) return null;
  if (m[k]) return m[k];
  for (const key of Object.keys(m)) {
    if (bareId(key) === k) return m[key];
  }
  return null;
}

export function makeAnnouncement(f) {
  const x = f || {};
  const aud = x.audience || { kind: "everyone" };
  return {
    id: clean(x.id),
    title: clean(x.title),
    body: clean(x.body),
    byId: clean(x.byId),
    byName: clean(x.byName),
    createdAt: clean(x.createdAt),
    audience: {
      kind: AUDIENCE_KINDS.includes(String(aud.kind)) ? String(aud.kind) : "everyone",
      role: clean(aud.role),
      teamId: clean(aud.teamId),
      teamName: clean(aud.teamName),
      shift: clean(aud.shift),
    },
    audienceLabel: audienceLabel(aud),
    targetIds: uniqIds(x.targetIds),
    requiresAck: !!x.requiresAck,
    /* ⚠️ OPENS ARE TRACKED WHETHER OR NOT AN ACKNOWLEDGEMENT IS REQUIRED
       (Matt's answer, Aug 13). The read list is a separate thing from the
       toggle: a leader wants to know who has seen the closing change even when
       nobody had to sign for it. */
    opens: (x.opens && typeof x.opens === "object" && !Array.isArray(x.opens)) ? x.opens : {},
    acks: (x.acks && typeof x.acks === "object" && !Array.isArray(x.acks)) ? x.acks : {},
    /* null, or { at, byId, byName, why }. Never removes the record. */
    retracted: x.retracted && typeof x.retracted === "object" ? x.retracted : null,
  };
}

export const announcementList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

export const isRetracted = (a) => !!(a && a.retracted && a.retracted.at);

/* ── Who may see it ──────────────────────────────────────────────────────
   ⚠️⚠️ THE ONE RULE, AND BOTH HALVES OF THE APP ASK IT HERE. Matt: "Leaders
   can see everything in their store. Team members see only what was sent to
   them." A leader seeing everything is a deliberate widening for a records
   system — somebody has to be able to answer "what was the team told" — and it
   is the ONLY widening.
   ⚠️ A RETRACTED ANNOUNCEMENT IS STILL VISIBLE to the people it reached. That
   is Matt's "retract it, visibly": a message that vanishes is a message that
   can be denied, which is the opposite of a record. The screen marks it. */
export function visibleTo(a, personId, isLeader) {
  if (!a) return false;
  if (isLeader) return true;
  if (!bareId(personId)) return false;
  return isTarget(a, personId);
}

export const forPerson = (list, personId, isLeader) =>
  announcementList(list).filter((a) => visibleTo(a, personId, isLeader));

/* ── The read list ───────────────────────────────────────────────────────
   Matt: "Who has opened it, who has not, with timestamps. Not a count, actual
   names." So this returns PEOPLE, and the caller supplies the names — the leaf
   has no roster and must not grow one.
   ⚠️ IT WALKS `targetIds`, NOT `opens`. Building it from who opened would list
   only the people who read it, and the entire value of this screen is the other
   column. Somebody who never opened it has no row in `opens` and must still
   appear. */
export function readList(a, nameOf) {
  const ann = a || {};
  const opens = ann.opens || {};
  const acks = ann.acks || {};
  const name = typeof nameOf === "function" ? nameOf : (id) => String(id);
  const rows = (Array.isArray(ann.targetIds) ? ann.targetIds : []).map((id) => {
    const key = clean(id);
    /* ⚠️ THE STAMP IS FOUND BY BARE ID, NOT BY THE KEY AS WRITTEN. `targetIds`
       carries the roster's "tm55" while the routes key `opens` and `acks` by
       the token's bare "55", so a straight `opens[key]` lookup found nothing
       and the read list showed all 106 people as Not opened forever — the
       column the whole feature exists for, wrong in the safe-looking direction.
       Falls back to a scan so a map written either way still reads (rule 1). */
    const o = stampFor(opens, key);
    const k = stampFor(acks, key);
    return {
      id: key,
      name: name(key) || key,
      openedAt: o && o.at ? String(o.at) : "",
      ackedAt: k && k.at ? String(k.at) : "",
    };
  });
  const opened = rows.filter((r) => r.openedAt);
  const notOpened = rows.filter((r) => !r.openedAt);
  return {
    rows,
    opened,
    notOpened,
    acked: rows.filter((r) => r.ackedAt),
    /* Counts come off the same arrays the names do, so the number and the list
       cannot disagree — the badge lesson, applied before it can happen. */
    openedCount: opened.length,
    totalCount: rows.length,
    ackedCount: rows.filter((r) => r.ackedAt).length,
  };
}

/* Has this person opened it / signed it. Used by the screen to decide whether
   to show the Acknowledge button, and by the route to avoid a pointless write. */
export const hasOpened = (a, personId) => !!(a && stampFor(a.opens, personId));
export const hasAcked = (a, personId) => !!(a && stampFor(a.acks, personId));

/* Still owed: sent to me, needs acknowledgement, retracted ones excluded.
   ⚠️ A RETRACTED ANNOUNCEMENT NEVER OWES A SIGNATURE. Chasing somebody to
   acknowledge something the sender has withdrawn is the system arguing with
   itself in front of a team member. */
export function awaitingAck(list, personId) {
  if (!bareId(personId)) return [];
  return announcementList(list).filter((a) =>
    a.requiresAck
    && !isRetracted(a)
    && isTarget(a, personId)
    && !hasAcked(a, personId));
}

/* ── The sentence stored against the record ──────────────────────────────
   The handbook and the document sends both store the words the person agreed
   to alongside the signature, so a receipt can be read years later without the
   screen that produced it. An announcement gets the same treatment. */
export const ACK_STATEMENT =
  "I confirm I have read this announcement and understand what it asks of me.";
