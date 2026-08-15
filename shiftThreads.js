/* ============================================================================
   shiftThreads.js — THE CONVERSATION THAT BELONGS TO ONE REQUEST

   Matt, Aug 13 2026, part 2 of three: "A swap request or a request off carries
   its own conversation. Anyone involved in that specific request can post to
   it. Nobody else can see it. The thread lives with the request, not in a feed.
   When the request is resolved, the thread closes and stays attached to it as
   the record of what was agreed. This is the one that stops 'who said I could
   have Friday off' from ever being a conversation again."

   ⚠️⚠️ SWAPS DO NOT EXIST IN THIS HUB AND THIS FILE DOES NOT PRETEND THEY DO.
   Checked before a line was written: there is no swap request, no key and no
   screen — every `swap` in the repo is a comment about auto-assign. So `kind`
   is here and is `"timeoff"` today, because a swap thread will want the same
   shape, and inventing a swap FEATURE inside a messaging task would have been
   a scheduling build (who may accept, does a leader still approve, does it
   rewrite the board) smuggled in under a different heading.

   ★ STRICT LEAF. Imports NOTHING. The Worker decides who may post and the
   screen decides what to draw, and both ask here — a permission written twice
   is the bug this repo lost a day to.

   ⚠️⚠️ OPEN IS DERIVED FROM THE REQUEST, NEVER STORED ON THE THREAD. A thread
   is open exactly while its request is pending. Storing a `closed` flag would
   give the request and the thread two opinions about the same fact, and the
   first time somebody re-opened a request the flag would be wrong with nothing
   to notice it. Same reasoning as the calendar's stamp being the meeting TIME
   rather than a boolean: derive the second fact from the first.

   ⚠️ THIS IS NOT A CHAT AND HAS NO `to`. A post belongs to a REQUEST. There is
   no recipient, no reply-to, no mention. Matt's boundary: "There is no
   free-form chat between team members… free-form employee messages in a system
   I host make me the custodian of records that get subpoenaed."
   ============================================================================ */

export const THREADS_KEY = "gcfcr-shift-threads-v1";

/* Only the statuses timeOff.js actually writes. `pending` is the one that
   matters here and is spelled out rather than imported, because this file
   imports nothing on purpose — see the header. If timeOff.js ever renames it,
   the assert in the test suite fails, which is the point of asserting it. */
export const OPEN_STATUS = "pending";

const clean = (v) => String(v == null ? "" : v).trim();

/* Ids compared as bare strings. `tm27` and `27` are one person everywhere else
   in this repo; a thread that disagreed would hide somebody's own request from
   them. Written out rather than importing nameMatch so this stays a leaf with
   no imports at all — the same bargain boardOwner.js declined and timeOff.js
   took, and this file is closer to timeOff.js. */
export const bareish = (v) => clean(v).replace(/^tm/i, "");
export const samePerson = (a, b) => !!bareish(a) && bareish(a) === bareish(b);

/* ── The record ──────────────────────────────────────────────────────────
   A map keyed by request id, NOT an array. The Worker appends one post to one
   row; a flat array would make every post a rewrite of every other thread in
   the store. Same shape as the HR own-row keys, for the same reason. */
export function readThreads(raw) {
  return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
}

export function makePost(f) {
  const x = f || {};
  return {
    id: clean(x.id),
    byId: clean(x.byId),
    byName: clean(x.byName),
    at: clean(x.at),
    text: clean(x.text),
    /* ⚠️ RETRACTED, NOT DELETED (Matt: "No deleting a sent message. Retract it,
       visibly."). The text stays so the record stays readable; the screen
       strikes it through and says who withdrew it. */
    retracted: x.retracted && typeof x.retracted === "object" ? x.retracted : null,
  };
}

export const postsOf = (thread) =>
  (thread && Array.isArray(thread.posts)) ? thread.posts.filter(Boolean) : [];

/* ── WHEN THIS CONVERSATION LAST MOVED ───────────────────────────────────
   Added Aug 13 2026 for the retention purge, and it lives here because it is
   a question about this file's SHAPE — a thread carries no date of its own,
   only one per post.

   ⚠️⚠️ THE NEWEST POST, NOT THE OLDEST, AND THE DIFFERENCE IS A DELETED
   CONVERSATION. Measuring a thread's age from its first message would delete a
   request people are still talking about, because somebody opened it a year
   ago. A record's life starts when it stops being live.

   ⚠️ RETURNS "" WHEN THERE IS NOTHING TO GO ON, and `purgeableOn` answers false
   for an empty date — so a thread with no readable timestamps is KEPT. Every
   uncertain case keeps the record. */
export function lastPostAt(thread) {
  let best = "", bestMs = -Infinity;
  for (const p of postsOf(thread)) {
    const t = new Date(clean(p && p.at)).getTime();
    if (!isNaN(t) && t > bestMs) { bestMs = t; best = clean(p.at); }
  }
  return best;
}

export const threadFor = (threads, requestId) =>
  readThreads(threads)[clean(requestId)] || null;

/* ── Who may see it ──────────────────────────────────────────────────────
   ⚠️⚠️ MATT'S ASSERT, AND IT IS THE WHOLE FEATURE: "Anyone involved in that
   specific request can post to it. Nobody else can see it."

   For a request off, "involved" is the person who asked plus any leader —
   settled with Matt on Aug 13. Unlike a swap there is no second team member in
   the record to include, and leaders are the ones approving it. When swaps
   arrive, the second member goes in `req.withId` and this function grows one
   clause; nothing else changes, which is why the rule is here and not in a
   route. */
export function canSeeThread(req, personId, isLeader) {
  if (!req) return false;
  if (isLeader) return true;
  const me = clean(personId);
  if (!me) return false;
  if (samePerson(req.memberId, me)) return true;
  /* Reserved for swaps. Absent on every record today, so this is a no-op that
     documents the shape rather than a branch that fires. */
  if (req.withId && samePerson(req.withId, me)) return true;
  return false;
}

/* Posting needs the same involvement AND an open request. A leader may not post
   to a closed thread either: once a request is decided, the thread is the
   record of what was agreed, and a record you can still add to is a record. */
export const isOpen = (req) => !!req && clean(req.status) === OPEN_STATUS;

export function canPost(req, personId, isLeader) {
  return canSeeThread(req, personId, isLeader) && isOpen(req);
}

/* Why a post was refused, in words a screen can show. One place, so the button
   and the route cannot give different reasons for the same refusal. */
export function refusalFor(req, personId, isLeader) {
  if (!req) return "that request is no longer on file";
  if (!canSeeThread(req, personId, isLeader)) return "that request is not yours";
  if (!isOpen(req)) return "that request has been decided, so the thread is closed";
  return "";
}

/* A retracted post keeps its place in the order. Callers render it struck
   through rather than filtering it out — a gap in a conversation is a thing
   somebody can argue about later, which is what this feature exists to stop. */
export const isRetracted = (p) => !!(p && p.retracted && p.retracted.at);

/* How many posts a person has not seen is deliberately NOT here. Read receipts
   are explicitly out of scope for everything except announcements — Matt's
   "NOT IN THIS BUILD" list names them. */
