/* ============================================================================
   tokens.js — the token ledger. Append only.

   Matt, Aug 11 2026: "Build a token reward system. Ledger first, rewards
   second. This is a Hub feature, per store, off by default." Then: "I need this
   for the hub clone."

   ★ LEAF MODULE — IMPORTS NOTHING. Same rule as demerits.js and nameMatch.js:
   anything that decides what somebody has earned must never sit inside an
   import cycle, and every function here is pure and node-testable.

   ⚠️ AND NOW ACTUALLY TESTED: `node tokens.test.mjs` at the repo root, 88
   assertions. "node-testABLE" sat here for two days and got read as
   "node-tested" — including by a comment in TokensTile.jsx that said so
   outright. This is the file that decides what a person has earned; a wrong
   balance is not a blank screen somebody reports, it is a number a team member
   believes. Run the test when you change anything here.

   ═══ NOT "POINTS", AND THAT IS THE FIRST RULE ══════════════════════════════
   ⚠️⚠️ Matt: "Do NOT call these points. Gate City already uses 'points' to mean
   DISCIPLINE points from infractions. A reward currency called points in the
   same app would be actively confusing to a team member who has just been
   written up."

   So: `tokens` everywhere in the code, and the word a person SEES is a store
   setting (`tokens.label`) defaulting to "tokens". A clone calls them whatever
   they like without touching a line of this file.

   ═══ APPEND ONLY. NOTHING IS EVER EDITED OR DELETED ════════════════════════
   ⚠️⚠️ Matt: "A currency people earn is a currency people will dispute. The
   ledger has to be able to answer 'why do I have 40 and she has 60' a year from
   now. An editable table cannot."

   To undo a mistake you write a REVERSAL pointing at the original. The original
   stays exactly as it was written. There is deliberately no edit and no delete
   in this file, and adding one later would destroy the only property that makes
   the ledger worth having.

   ⚠️⚠️ A BALANCE IS NEVER STORED. It is summed from the entries every time —
   `balanceOf`. Matt: "Never store a balance as a number that gets updated. That
   is the classic way these drift." There is no setter here, on purpose.

   ═══ THE STORED SHAPE, AND WHY IT IS A MAP AND NOT ONE FLAT LIST ═══════════
   ⚠️⚠️ `{ [personId]: [entry, …] }`, NOT a single array of every movement.
   A flat array is the truer ledger and was the first instinct, and it is wrong
   HERE for a security reason that is already written down in this repo: the
   Worker's own-row read filter (`hrOwnRow`) narrows a MAP to the reader's own
   key, and "returns it untouched for arrays regardless". A flat array would
   therefore hand every team member the whole store's ledger — every amount and
   every reason — the moment they opened their own balance. Matt's rule
   "Nobody sees anybody else's reasons except leaders" is enforced by this shape.

   Each person's own value is still a plain append-only list, so nothing about
   the ledger's guarantees is lost. Only the top level differs.
   ============================================================================ */

export const TYPES = Object.freeze({ EARN: "earn", REDEEM: "redeem", REVERSAL: "reversal" });
const ALL_TYPES = [TYPES.EARN, TYPES.REDEEM, TYPES.REVERSAL];

/* Tokens are whole. A fractional token is a rounding argument waiting to
   happen in a currency whose entire job is being explainable. */
const isWhole = (n) => Number.isFinite(n) && Math.trunc(n) === n;

/* ═══ ONE MOVEMENT ══════════════════════════════════════════════════════════
   ⚠️ RETURNS null RATHER THAN A HALF-VALID ENTRY. Design rule 1: "when a write
   path is uncertain about the shape it is producing, fail loudly without saving
   rather than save something wrong." Every caller must check.

   ⚠️ A BLANK REASON IS REFUSED, ALWAYS. Matt: "reason, free text, REQUIRED, no
   blank reasons ever." An unexplained movement is the one thing that makes a
   ledger unable to answer the question it exists to answer, and by the time
   anybody notices, the person who made it has forgotten why.

   ⚠️ THE SIGN IS DECIDED BY THE TYPE, not typed by a leader. An earn is
   positive, a redeem is negative, and neither can be written the other way
   round — the same lesson Cash Audit learned when a forgotten minus filed a
   $21.20 shortage as an overage and nothing on screen looked wrong. */
export function makeEntry({ personId, amount, reason, byId, type, reversalOf }) {
  const pid = String(personId == null ? "" : personId).trim();
  const by = String(byId == null ? "" : byId).trim();
  const why = String(reason == null ? "" : reason).trim();
  const n = Number(amount);
  const t = String(type || "");

  if (!pid || !by || !why) return null;
  if (!ALL_TYPES.includes(t)) return null;
  if (!isWhole(n) || n === 0) return null;
  if (t === TYPES.EARN && n <= 0) return null;
  if (t === TYPES.REDEEM && n >= 0) return null;
  /* A reversal exists only in relation to something. Without the pointer it is
     just an unexplained adjustment, which is the thing this design refuses. */
  if (t === TYPES.REVERSAL && !String(reversalOf || "").trim()) return null;

  const e = {
    id: `tk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    personId: pid,
    amount: n,
    reason: why,
    byId: by,
    type: t,
    at: new Date().toISOString(),
  };
  if (t === TYPES.REVERSAL) e.reversalOf = String(reversalOf).trim();
  return e;
}

/* ═══ A REVERSAL ════════════════════════════════════════════════════════════
   The exact opposite of one entry, pointing at it. ⚠️ IT DOES NOT TOUCH THE
   ORIGINAL — it cannot, it only reads it — which is the whole point.
   ⚠️ A REVERSAL OF A REVERSAL IS REFUSED. Once a movement has been cancelled,
   cancelling the cancellation is a second way of saying "earn", and it makes
   the history unreadable in exactly the case somebody is disputing it. Grant
   again instead, with a reason. */
export function makeReversal(entry, byId, reason) {
  if (!entry || entry.type === TYPES.REVERSAL) return null;
  const amt = Number(entry.amount);
  if (!isWhole(amt) || amt === 0) return null;
  if (!String(entry.id || "").trim()) return null;
  return makeEntry({
    personId: entry.personId,
    amount: -amt,
    reason: String(reason || "").trim() || `Reversal of: ${entry.reason}`,
    byId,
    type: TYPES.REVERSAL,
    reversalOf: entry.id,
  });
}

/* ═══ THE BALANCE, ALWAYS SUMMED ════════════════════════════════════════════
   ⚠️ Entries that are not whole numbers are SKIPPED rather than coerced. A
   corrupt row must not silently become part of somebody's balance, and a
   NaN reaching this sum would turn the whole balance into NaN and read on
   screen as no balance at all. */
export function balanceOf(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((s, e) => {
    const n = Number(e && e.amount);
    return isWhole(n) ? s + n : s;
  }, 0);
}

/* Newest first — a person opening their history wants what just happened.
   ⚠️ SORTS A COPY. Mutating the stored array would reorder the ledger itself,
   and an append-only record that reorders is not append-only. */
/* ⚠️ THE TIE-BREAK IS NOT DECORATION. Two entries written in the same
   millisecond carry the same `at`, the comparison returns 0, and a stable sort
   then falls back to INSERTION order — which is oldest-first, the exact
   opposite of what this function promises. Caught by running a person's real
   history and reading it. It cannot happen at a granting speed a human can
   type, and it happens every time in a test, which is how it would have
   survived to be somebody else's confusing screenshot.
   ⇒ Ties fall back to the later position in the stored array, which for an
   append-only ledger IS the later entry. */
export function historyFor(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(Boolean)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => String(b.e.at || "").localeCompare(String(a.e.at || "")) || (b.i - a.i))
    .map((x) => x.e);
}

/* ═══ SPENDING ══════════════════════════════════════════════════════════════
   ⚠️ NO DEBT, EVER. Matt: "Block a redemption that would take a balance below
   zero. Show 'not enough tokens' rather than allowing debt." A negative balance
   turns a reward into something owed, which is the opposite of the feature. */
export const canAfford = (entries, cost) => {
  const c = Number(cost);
  if (!isWhole(c) || c <= 0) return false;
  return balanceOf(entries) >= c;
};

/* Build the redeem entry, or null if they cannot afford it. Kept here so the
   affordability rule and the entry that spends can never disagree — a screen
   that checked one and wrote the other is how debt gets in. */
export function makeRedemption({ entries, personId, item, cost, byId }) {
  const c = Number(cost);
  if (!canAfford(entries, c)) return null;
  const name = String(item || "").trim();
  if (!name) return null;
  return makeEntry({ personId, amount: -c, reason: name, byId, type: TYPES.REDEEM });
}

/* ═══ THE CATALOG ═══════════════════════════════════════════════════════════
   ⚠️ SHIPS EMPTY AND IS NEVER HARD CODED. Matt: "What a token buys is the
   store's decision and their money, not ours." So this file knows the SHAPE of
   a catalog item and nothing about what is in one. */
export function catalogList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && String(i.name || "").trim() && isWhole(Number(i.cost)) && Number(i.cost) > 0)
    .map((i) => ({
      id: String(i.id || "").trim() || `it_${String(i.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: String(i.name).trim(),
      cost: Number(i.cost),
      active: i.active !== false,
    }));
}

/* What is on offer, with what this balance can reach marked. `active: false`
   items are dropped for a team member — an item the store has switched off is
   not a thing to save toward. */
export const shopFor = (catalog, balance) =>
  catalogList(catalog).filter((i) => i.active)
    .map((i) => ({ ...i, affordable: Number(balance) >= i.cost }));

/* ═══ WHOLE-LEDGER HELPERS ══════════════════════════════════════════════════
   The stored value is `{ [personId]: [entry, …] }`. These read it without ever
   writing, so a caller cannot accidentally reshape the map. */
export const entriesFor = (ledger, personId) => {
  const pid = String(personId == null ? "" : personId).trim();
  if (!pid || !ledger || typeof ledger !== "object" || Array.isArray(ledger)) return [];
  const v = ledger[pid];
  return Array.isArray(v) ? v.filter(Boolean) : [];
};

export const balanceIn = (ledger, personId) => balanceOf(entriesFor(ledger, personId));

/* Every person who has ever had a movement, with their balance. Used for the
   leaders' list. ⚠️ Sorted by balance then id so the order is stable between
   renders rather than following object key order. */
export function balances(ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) return [];
  return Object.keys(ledger)
    .map((pid) => ({ personId: pid, balance: balanceOf(ledger[pid]), count: entriesFor(ledger, pid).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.balance - a.balance || String(a.personId).localeCompare(String(b.personId)));
}

/* ⚠️ APPEND, AND ONLY APPEND. The one writer in this file, and it returns a NEW
   map rather than mutating — React state and an append-only record want the
   same thing here. There is no remove, no edit and no reorder, deliberately. */
export function append(ledger, entry) {
  if (!entry || !entry.personId) return ledger;
  const base = (ledger && typeof ledger === "object" && !Array.isArray(ledger)) ? ledger : {};
  const pid = String(entry.personId);
  const prior = Array.isArray(base[pid]) ? base[pid] : [];
  return { ...base, [pid]: [...prior, entry] };
}
