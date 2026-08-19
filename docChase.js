/**
 * docChase.js — who still owes a signature, and when to ask them again.
 *
 * Bri, Aug 14 2026: "Please alert from SOP when docs are sent to sign and send
 * a second notification after 2 days for any sent that are not signed."
 *
 * ★ LEAF MODULE. Imports nothing. The job itself lives in worker.js, which no
 * Node test can drive without booting a Worker — so the two decisions that can
 * actually be WRONG live out here where they can be proven:
 *   1. which sends are due a chase
 *   2. what each person is chased about
 * Everything left in the Worker is reading, sending and stamping.
 */

export const DOC_CHASE_AFTER_DAYS = 2;

const asArray = (v) => (Array.isArray(v) ? v : []);
const acksOf = (r) => (r && r.acks && typeof r.acks === "object" && !Array.isArray(r.acks) ? r.acks : {});

/* Has this person signed this send? Ids are compared as STRINGS, because a
   target list can hold "26" and an acks map can be keyed "26" — and one of them
   arriving as a number would silently mean "not signed" and chase somebody who
   already had. */
export const hasSigned = (rec, id) => !!acksOf(rec)[String(id)];

/* Everyone on this send who has not signed it. */
export const unsignedOf = (rec) =>
  asArray(rec && rec.targetIds).map(String).filter((id) => !hasSigned(rec, id));

/* ⚠️⚠️ FOUR THINGS MAKE A SEND DUE, AND EVERY ONE OF THEM IS A REFUSAL:
     · it asked for a signature at all — a document shared for reference is not
       a debt and must never be chased
     · it is at least two days old
     · it has not been chased already — ONE reminder per send, not one a day.
       A daily nag is how a reminder becomes noise people mute, and a muted
       reminder is worse than none because everyone believes it works
     · somebody on it still has not signed
   ⚠️ AN UNPARSEABLE DATE IS NOT DUE. A record with a broken `createdAt` would
   otherwise read as infinitely old and chase everybody on it immediately. */
export function chaseDue(sends, nowMs, afterDays = DOC_CHASE_AFTER_DAYS) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return [];
  const days = Number.isFinite(Number(afterDays)) && Number(afterDays) >= 0 ? Number(afterDays) : DOC_CHASE_AFTER_DAYS;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return asArray(sends).filter((r) => {
    if (!r || !r.signRequired || r.chasedAt) return false;
    const at = Date.parse(r.createdAt || "");
    if (!Number.isFinite(at) || at > cutoff) return false;
    return unsignedOf(r).length > 0;
  });
}

/* ⚠️ ONE MESSAGE PER PERSON LISTING EVERYTHING THEY OWE, never one per
   document. The same rule the evaluation reminder states: five pings for five
   things is the noise, not the reminder.
   ⚠️ ORDER IS THE ORDER THEY WERE SENT, so the oldest debt reads first.
   Returns a Map of person id -> [title, …]. */
export function owedByPerson(due) {
  const out = new Map();
  asArray(due).forEach((r) => {
    const title = String((r && r.docTitle) || "Untitled document");
    unsignedOf(r).forEach((id) => {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(title);
    });
  });
  return out;
}

/* The words. Kept here so the push and the Slack message can never describe the
   same debt differently, which is the drift that makes somebody open the Hub
   looking for two documents and find one. */
export const chaseTitle = (n) =>
  n === 1 ? "A document needs your signature" : `${n} documents need your signature`;
export const chaseBody = (titles) => {
  const list = asArray(titles);
  return list.length === 1
    ? `"${list[0]}" is still waiting for your signature.`
    : `${list.length} documents are still waiting for your signature.`;
};
