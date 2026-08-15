/* ============================================================================
   escalations.js — TELLING WHOEVER IS RUNNING THE SHIFT

   Matt, Aug 13 2026, part 3 of three: "One-way. Team member to whoever is
   running the shift. Preset reasons plus a short note… It routes automatically
   to whoever the board says owns that shift right now. The team member does not
   choose a recipient and does not need to know who is on… No reply thread on
   this one. If it needs discussion, the leader calls them."

   ⚠️⚠️ ONE-WAY IS A PROPERTY OF THE RECORD, NOT A MISSING FEATURE. There is no
   `posts` array here and there must never be one. A leader marks it seen and
   adds ONE line of outcome; that is not a reply, it is the disposition of a
   record. The moment this grows a second message from the team member it is a
   DM channel to the leader on duty, which is the thing Matt drew the line
   against: "free-form employee messages in a system I host make me the
   custodian of records that get subpoenaed."

   ⚠️⚠️ AND THERE IS NO RECIPIENT FIELD. The team member cannot address anybody.
   Who it reaches is resolved from the BOARD at the moment it is sent, and the
   names it reached are stamped onto the record so the routing is auditable
   afterwards — "who was on when I said I could not make it" is exactly the
   question this has to answer months later.

   ★ STRICT LEAF. Imports NOTHING.
   ============================================================================ */

export const ESCALATIONS_KEY = "gcfcr-escalations-v1";

/* Matt's four, in his words. A preset list rather than free text because the
   point is that a leader can triage twelve of these at a glance during a rush.
   `note` is the short free part and is capped by the route. */
export const REASONS = Object.freeze([
  { id: "late", label: "Running late" },
  { id: "cantmake", label: "Cannot make it" },
  { id: "leaveearly", label: "Need to leave early" },
  { id: "broken", label: "Something is broken" },
]);

export const reasonLabel = (id) => {
  const hit = REASONS.find((r) => r.id === String(id));
  return hit ? hit.label : "";
};
export const isReason = (id) => REASONS.some((r) => r.id === String(id));

const clean = (v) => String(v == null ? "" : v).trim();
export const bareish = (v) => clean(v).replace(/^tm/i, "");
export const samePerson = (a, b) => !!bareish(a) && bareish(a) === bareish(b);

export function makeEscalation(f) {
  const x = f || {};
  return {
    id: clean(x.id),
    byId: clean(x.byId),
    byName: clean(x.byName),
    at: clean(x.at),
    reason: isReason(x.reason) ? String(x.reason) : "",
    note: clean(x.note),
    /* ⚠️ THE SHIFT IT WAS LOGGED AGAINST, stamped at send time. Matt: "Logged
       against the shift." A date and a daypart, so a leader reading it later
       knows which shift it belonged to even if they open it days afterwards. */
    dayIso: clean(x.dayIso),
    daypart: clean(x.daypart),
    /* ⚠️⚠️ WHO IT ROUTED TO, RESOLVED FROM THE BOARD AND FROZEN HERE. Never
       recomputed on read: the board for last Tuesday may be rewritten, and the
       question this answers is "who was on when I sent it", not "who would be
       on if I sent it now". Empty is a real answer and is left empty. */
    routedTo: Array.isArray(x.routedTo) ? x.routedTo.map(clean).filter(Boolean) : [],
    /* The leader's disposition. One line, not a thread. */
    seen: x.seen && typeof x.seen === "object" ? x.seen : null,
  };
}

export const escalationList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

export const isSeen = (e) => !!(e && e.seen && e.seen.at);

/* ── Who may see one ─────────────────────────────────────────────────────
   The person who sent it, and any leader. Deliberately NOT "only the leaders
   it routed to": a shift changes hands, somebody goes home, and an escalation
   that only its original recipients can read is one nobody answers. It is a
   record of the shift, and leaders see the store's records — Matt's guardrail.
   ⚠️ A TEAM MEMBER SEES ONLY THEIR OWN, never a colleague's. "Cannot make it,
   childcare" is not something the rest of the floor gets to read. */
export function visibleTo(e, personId, isLeader) {
  if (!e) return false;
  if (isLeader) return true;
  return samePerson(e.byId, personId);
}

export const forPerson = (list, personId, isLeader) =>
  escalationList(list).filter((e) => visibleTo(e, personId, isLeader));

/* Still needing a leader's eyes. Sorted newest first by the caller; this only
   answers the question. */
export const unseen = (list) => escalationList(list).filter((e) => !isSeen(e));

/* ⚠️ RETENTION IS 12 MONTHS BY DEFAULT (Matt), overridable per store through
   Store Settings, and THE NUMBER IS NOT HERE. It lives with the other two in
   `RETENTION_DEFAULT_DAYS` in announcements.js, so a purge reads all three from
   one place and none of the three is a constant a second store inherits
   without choosing it.
   ⚠️ I WROTE A SECOND COPY OF IT IN THIS FILE — `export const
   RETENTION_DEFAULT_DAYS = 365` — under a comment that said it lived over
   there. Nothing imported it, so it would have sat here drifting silently
   until somebody changed one of the two. Design rule 8, and it is exactly the
   `normName`-in-three-places shape. Do not add it back. */

/* What the leader's phone says. Short, because it arrives mid-rush, and it
   never carries the note — the note can say "my father is in hospital" and a
   lock screen on a shared iPad is not where that belongs. */
export function alertText(e) {
  const who = clean(e && e.byName) || "Someone";
  const why = reasonLabel(e && e.reason) || "Needs you";
  return { title: why, body: `${who} — open the Hub` };
}
