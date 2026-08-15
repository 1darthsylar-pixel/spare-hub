/* ═══════════════════════════════════════════════════════════════════
   claimCode.js — the one-time code that lets a new person set their
   own PIN for the first time.

   ★ WHY THIS EXISTS.
   Matt, Aug 10 2026, on standing up a second store: "automatically set
   the person's PIN to the last 4 of the phone number... it's best for
   the long term and less work." The work is real — a director would
   otherwise hand-type ~100 PINs.

   ⚠️ BUT THE LAST 4 IS A CLAIM CODE, NEVER THE PIN. Everyone on a team
   has everyone else's number. If the last 4 *is* the PIN then on day one
   every person can sign in as every other person, and it stays that way
   until each of them changes it. A PIN is what puts somebody's name on
   their work, so a PIN a second person knows is a signature a second
   person can forge. As a claim code it is spent the moment it is used,
   and the director still types nothing.

   ⚠️ THE HUB NEVER STORES A PHONE NUMBER. The import reduces it to four
   digits, salts and hashes those, and throws the number away. So a leak
   of the claim table does not leak anybody's phone.

   ⚠️ HONEST ABOUT THE STRENGTH: four digits is 10,000 possibilities and
   SHA-256 is fast, so a salted hash does NOT make an offline guess hard.
   The salt forces an attacker to redo the work per person instead of
   once for everyone — the same bar `pinHashHex` in worker.js already
   sets, and the same wording its comment uses. What actually protects
   this is that the code is SINGLE USE and dies at first claim. Do not
   read this file as "the codes are safely encrypted". They are not
   secrets worth much; they are one-time tickets.

   ★ LEAF. Imports nothing. Read by the browser (the import box, which
   computes the codes) and by worker.js (the claim route, which checks
   them). `crypto.subtle` exists in both, which is the whole reason this
   can be one file instead of two that drift.
   ═══════════════════════════════════════════════════════════════════ */

/** Last four digits of a phone number, or "" when there aren't four.
    ⚠️ RETURNS "" RATHER THAN GUESSING. Real rows in the CFA Home export
    have a blank Mobile Phone (the Operator's own row is one of them), and
    some carry only a Home Phone. A person with no number gets NO claim
    code and must have their PIN set by hand — that is a real case, not an
    edge case, and the caller has to handle it. */
export function last4(phone) {
  const d = String(phone || "").replace(/\D+/g, "");
  return d.length >= 4 ? d.slice(-4) : "";
}

const hex = (buf) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

/** A fresh per-person salt. */
export function newSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return hex(a.buffer);
}

/** Salted SHA-256 of a claim code, hex. Same construction as the PIN hash. */
export async function claimHashHex(code, saltHex) {
  const data = new TextEncoder().encode(`${saltHex}:${String(code)}`);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/** Build the stored record for a phone number, or null when there is no
    usable number. Shape mirrors a PIN entry: { h, s }. */
export async function claimRecord(phone) {
  const c = last4(phone);
  if (!c) return null;
  const s = newSalt();
  return { h: await claimHashHex(c, s), s, v: 1 };
}

/** Does this code match the stored record?
    ⚠️ GUARDS THE SHAPE INSTEAD OF TRUSTING IT (rule 1). A record written
    by a later version, a half-written one, or a plain string all have to
    read as "no", never as a crash and never as a match. */
export async function claimMatches(code, rec) {
  if (!rec || typeof rec !== "object") return false;
  if (typeof rec.h !== "string" || typeof rec.s !== "string") return false;
  const c = last4(code) || String(code || "").replace(/\D+/g, "");
  if (c.length !== 4) return false;
  const got = await claimHashHex(c, rec.s);
  /* Length-safe compare. Not timing-hardened, and it does not need to be:
     the code is four digits and rate limiting is what stops guessing, the
     same as /api/pin-verify. */
  return got.length === rec.h.length && got === rec.h;
}
