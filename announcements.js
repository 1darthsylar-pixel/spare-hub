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

    /* ── SUPERSEDING ────────────────────────────────────────────────────────
       🐛 Matt, Aug 21 2026: "More people are opening now. If a new announcement
       supercedes an old One then the old one should disappear. It will be too
       much clutter otherwise."

       He was reading a list with "Ops checklists — tonight's recap" on it three
       times, beside a daily food safety walk, a daily waste log check and a
       daily morning digest. Twenty recurring jobs write one of these a day. The
       list only ever grows, and the day it matters is the day a real message
       has to be found in it.

       `series` NAMES THE JOB, NOT THE MESSAGE. Titles carry dates — "Waste log
       check — 2026-08-19" — so two runs of one job never share a title, which
       is exactly why they stack. The series is the stable half.

       ⚠️ A ONE-OFF HAS NO SERIES AND IS NEVER REPLACED. An announcement a
       person writes by hand has `series: ""`, and nothing supersedes it. The
       Lineup message will still be on the list in October.

       ⚠️⚠️ SUPERSEDED IS NOT RETRACTED AND NOT DELETED, and the difference is
       the whole design. Retracting is a person saying "ignore this", and it
       stays visible and marked, because a message that vanishes is a message
       that can be denied. Superseding is bookkeeping: the record and its read
       list stay exactly as they were, and only the LIST stops showing it. The
       screen already promises "once sent this cannot be edited or deleted",
       and that promise still holds. */
    series: clean(x.series),
    /* null, or { at, byId } naming the announcement that replaced it. */
    supersededBy: x.supersededBy && typeof x.supersededBy === "object" ? x.supersededBy : null,
  };
}

export const announcementList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

export const isRetracted = (a) => !!(a && a.retracted && a.retracted.at);

/* Replaced by a newer run of the same job. The record is intact; it is only
   off the list. */
export const isSuperseded = (a) => !!(a && a.supersededBy && a.supersededBy.at);

/* ⚠️⚠️ THE ANNOUNCEMENTS THAT WERE ALREADY ON FILE.

   🐛 Matt, Aug 21 2026, looking at the list AFTER the supersede fix shipped:
   the same three "Ops checklists — tonight's recap" rows, unchanged.

   Superseding keys on `series`, and every record written before that field
   existed has none. So the fix was working perfectly on records it had never
   seen and doing nothing at all to the backlog somebody was actually looking
   at. Correct, and useless, which is the worst pair.

   ⇒ A LEGACY RECORD INFERS ITS SERIES FROM ITS TITLE. Nothing is written and
   no stored record is touched: the inference happens on read, so the same fix
   reaches the rows already on file.

   ⛔ HUB-WRITTEN RECORDS ONLY, AND THAT IS THE WHOLE SAFETY. `postHubRecap`
   sets `byId: ""`; a person composing an announcement gets `byId: uid`. So a
   real author's message can never be inferred into a series, and the rule
   "a hand-written announcement is never replaced" survives untouched. Two
   directors posting "Team meeting" a week apart still both stand. */
const TITLE_KEY = (t) => String(t || "")
  .toLowerCase()
  /* Dates are what make two runs of one job look like two different things,
     so they are exactly what has to come out. */
  .replace(/\d{4}-\d{2}-\d{2}/g, " ")
  .replace(/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/g, " ")
  .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/g, " ")
  .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
  /* A range reads "… — 2026-08-10 to 2026-08-16" and loses both halves above,
     leaving a bare "to" that would key two different weeks differently. */
  .replace(/\bto\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/* The series a record belongs to. "" means nothing may ever replace it.

   ⚠️ THE STORED SERIES WINS WHEN THERE IS ONE. Two posts from one job can carry
   different titles on purpose — the primary and secondary fry boil-outs — and
   two different jobs could one day carry the same one. Trusting the title over
   a stated series would collapse the first pair and merge the second.

   ⚠️ A LEGACY ROW HAS NO SERIES, so it falls back to its title. See
   `seriesResolver` for how it then finds the series its title belongs to. */
export function seriesOf(a) {
  if (!a) return "";
  if (clean(a.byId)) return "";                 // a person wrote it
  return clean(a.series) || TITLE_KEY(a.title);
}

/* ⚠️⚠️ A LEGACY ROW ADOPTS THE SERIES ITS TITLE MAPS TO, and this two-pass is
   the whole reason the backlog clears.

   🐛 Matt, Aug 21 2026, looking at the list AFTER the supersede fix shipped:
   the same three "Ops checklists — tonight's recap" rows, unchanged. Every one
   of them predates the `series` field, so keying on that field put them in
   three groups of one and nothing ever replaced anything.

   ⇒ First pass: learn which series each TITLE belongs to, from the records
   that state one. Second pass: a record with no series adopts the series its
   title maps to, and falls back to the bare title when nothing claims it.

   ⇒ So tonight's "Ops checklists — tonight's recap" — which does carry
   `series: "ops-recap"` — pulls the three older rows of the same name into its
   own group, and the newest of them wins. Nothing is written to do it. */
export function seriesResolver(list) {
  const byTitle = new Map();
  for (const a of announcementList(list)) {
    if (!a || clean(a.byId)) continue;
    const explicit = clean(a.series);
    const title = TITLE_KEY(a.title);
    if (explicit && title && !byTitle.has(title)) byTitle.set(title, explicit);
  }
  return (a) => {
    if (!a || clean(a.byId)) return "";
    const explicit = clean(a.series);
    if (explicit) return explicit;
    const title = TITLE_KEY(a.title);
    return byTitle.get(title) || title;
  };
}

export const sameSeries = (a, b, resolve) => {
  const f = typeof resolve === "function" ? resolve : seriesOf;
  const sa = f(a);
  return !!sa && sa === f(b);
};

/* Mark every earlier announcement in `ev`'s series as replaced by it.

   ⚠️ RETURNS A NEW LIST AND MUTATES NOTHING, so a caller that fails to save
   has changed nothing. The whole list is rewritten on every write anyway.
   ⚠️ NO SERIES MEANS NO SUPERSEDING. A blank series must never match another
   blank series, or every hand-written announcement would replace the last one.
   ⚠️ ALREADY-SUPERSEDED RECORDS ARE LEFT ALONE, so the stamp keeps naming the
   announcement that first replaced it rather than the newest one. Who replaced
   it is a fact about that day, not about today. */
export function supersedeSeries(list, ev, at) {
  const all = announcementList(list);
  /* Learned from the whole list, so a legacy row is measured against the same
     mapping the read path uses. */
  const resolve = seriesResolver([ev, ...all]);
  if (!resolve(ev)) return all;
  const stamp = { at: clean(at) || clean(ev && ev.createdAt), byId: clean(ev && ev.id) };
  if (!stamp.at || !stamp.byId) return all;
  return all.map((a) => {
    if (!a || a.id === ev.id) return a;
    if (!sameSeries(a, ev, resolve)) return a;
    if (isSuperseded(a)) return a;
    return { ...a, supersededBy: stamp };
  });
}

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

/* ⚠️ SUPERSEDED ONES ARE FILTERED HERE, at the one place both halves of the
   app already ask who may see what. Filtering in the screen instead would have
   meant doing it in every screen, and missing one is how the clutter comes
   back on a list nobody is watching. */
export const forPerson = (list, personId, isLeader) => {
  const all = announcementList(list);
  /* ⚠️⚠️ THE NEWEST OF EACH SERIES WINS ON READ, NOT ONLY ON WRITE.

     🐛 Matt, Aug 21 2026, looking at the list AFTER the supersede fix shipped:
     the same three "Ops checklists — tonight's recap" rows, unchanged. The
     stamp is only applied when a NEW announcement is written, so the backlog
     would have sat there until every one of twenty jobs happened to run again.

     ⇒ The stamp stays, because it is the record of what replaced what and when.
     This is the BEHAVIOUR, and it is right immediately. A record and a view,
     not two mechanisms competing. */
  const resolve = seriesResolver(all);
  const newest = new Map();
  for (const a of all) {
    const s = resolve(a);
    if (!s) continue;
    const at = String((a && a.createdAt) || "");
    if (!at) continue;
    const cur = newest.get(s);
    if (!cur || at > cur) newest.set(s, at);
  }
  return all.filter((a) => {
    if (!visibleTo(a, personId, isLeader)) return false;
    if (isSuperseded(a)) return false;
    const s = resolve(a);
    /* ⚠️ STRICTLY OLDER, so two runs stamped the same instant both stand rather
       than both vanishing. */
    return !s || String(a.createdAt || "") >= (newest.get(s) || "");
  });
};

/* The unfiltered view, for anything that has to see the whole record: the
   retention purge, an export, a leader asking what the team was ever told. */
export const forPersonIncludingSuperseded = (list, personId, isLeader) =>
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

/* ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ WHAT THE NOTIFICATION ACTUALLY SAYS, AND WHERE TAPPING IT GOES.

   Matt, Aug 20 2026, off a lock-screen photo showing only "Change fund order":
   "When viewing an announcement you should see the whole thing here. Then maybe
   after clicking on it that will trigger the acknowledgement?"

   ⛔⛔ THE BUG WAS ONE LINE AND IT MADE THE WHOLE FEATURE POINTLESS.
   `pushAnnouncement` sent `body: ev.title`, so the notification's body WAS the
   title and the announcement text never left the Hub. A person got the name of
   a message and no message. That is the "Opened 1 of 29" on the change fund
   order: nobody opened it because nothing told them there was anything to open.

   ⚠️⚠️ THE ACKNOWLEDGEMENT IS NOT AND MUST NOT BE A TAP, AND THAT IS THE HALF
   OF MATT'S QUESTION THE ANSWER IS NO TO. Confirming stores a TYPED SIGNATURE
   against `ACK_STATEMENT` above — "I confirm I have read this announcement and
   understand what it asks of me" — and the comment there says why: the words
   agreed to are stored beside the signature so a receipt can be read years
   later. A lock-screen tap is "I dismissed a banner". Recording that as a
   signature would empty the one field on the record that means anything.

   ⇒ WHAT THE TAP DOES INSTEAD: it opens the Hub ON THIS ANNOUNCEMENT, already
   expanded, which marks it OPENED and puts the Confirm box on screen with
   nothing to hunt for. Reading is one tap; signing stays deliberate.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠️ A LIMIT, BECAUSE A PUSH PAYLOAD IS NOT A DOCUMENT. Web push is capped
   around 4KB after encryption and a phone shows roughly four lines expanded.
   The number is the point at which a lock screen stops being the place to read
   it, not a technical maximum. */
export const PUSH_BODY_MAX = 350;

export function pushBodyFor(a) {
  const raw = String((a && a.body) || "").replace(/\r/g, "").trim();
  if (!raw) return "";
  /* ⚠️ COLLAPSE BLANK LINES, KEEP SINGLE ONES. A notification with three empty
     lines in it wastes the four the phone gives you. */
  const tidy = raw.replace(/\n{2,}/g, "\n").trim();
  if (tidy.length <= PUSH_BODY_MAX) return tidy;
  /* Cut on a word, never mid-word, and say plainly that there is more. */
  const cut = tidy.slice(0, PUSH_BODY_MAX);
  const at = cut.lastIndexOf(" ");
  return `${(at > PUSH_BODY_MAX - 60 ? cut.slice(0, at) : cut).trimEnd()}…\n\nOpen the Hub to read the rest.`;
}

/* ⚠️ THE TITLE IS THE ANNOUNCEMENT'S OWN, NOT THE WORD "ANNOUNCEMENT". The OS
   already draws the app name above it from the web manifest, so a title of
   "Announcement" under a heading of "Gate City Hub" spent the one bold line on
   saying nothing. When a signature is required the title says so, because that
   is the thing a person needs to see before they decide to open it. */
export function pushTitleFor(a) {
  const t = String((a && a.title) || "").trim() || "Announcement";
  return a && a.requiresAck ? `${t} — please confirm` : t;
}

/* Where the tap lands. `?to=` already opens a tool on load; `?open=` is the
   row inside it. Both are stripped from the address bar immediately, so a
   later refresh does not re-open anything. */
export const pushUrlFor = (a) =>
  `/?to=announce${a && a.id ? `&open=${encodeURIComponent(String(a.id))}` : ""}`;
