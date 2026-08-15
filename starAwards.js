/* ══════════════════════════════════════════════════════════════════════════
   starAwards.js — WHAT THE HUB AWARDS ON ITS OWN, AND WHO IT REFUSES TO.

   ★ STRICT LEAF. Imports nothing. Evidence in, a list of awards out. It reads
   no key, writes no key and knows nothing about Supabase — the job hands it
   what it found and stores what comes back.

   Matt, Aug 14 2026: "i want stars to be autoassigned by the hub", and when
   asked automatic or leader-approved: "dont award someone who got wrote up but
   keep it auto."

   ═══ THE BLOCKER IS THE WHOLE DESIGN ══════════════════════════════════════
   ⚠️⚠️ AWARDING SOMEBODY IN THE SAME MONTH THEY WERE WRITTEN UP ENDS THE
   CURRENCY. Not because the maths is wrong — because a team member who was
   disciplined on Tuesday and handed stars by the Hub on Friday learns that the
   stars mean nothing, and so does everybody they tell. There is no undo for
   that. So the blocker is checked FIRST, before any rule is even considered.

   ⚠️ A WRITE-UP IS NOT "ANY HR ENTRY". `gcfcr-hr-files` holds write-ups,
   counselings AND documentation — including the Tell a Leader records that file
   themselves, and Recovery Points, which are a +1 somebody EARNED. Blocking on
   "has a file entry" would punish somebody for telling a leader they were
   running late, which is the exact behaviour the Hub asks for.
   ⇒ `isWriteUp` mirrors HRConsole's FILE_GROUPS test exactly, and
   starAwards.test.mjs grades it against that file's own source rather than
   against this comment.

   ═══ WHAT IT AWARDS FOR ═══════════════════════════════════════════════════
   ⚠️ NOT THE INVERSE OF A DEMERIT. "30 days without being late" is already
   covered by the points system from the other direction, and paying somebody
   for the absence of a fault turns the whole ladder into a wage. The rules here
   are things the demerit list does not touch: finishing something.

   ⚠️ THE RULES ARE DATA, NOT CODE (design rule 18). `DEFAULT_RULES` is a
   starting point a store can change on a screen. Another operator rewards
   different things, and "I will edit the JavaScript" is not a path.
   ══════════════════════════════════════════════════════════════════════════ */

const clean = (v) => String(v == null ? "" : v).trim();

/* ── WHO IS BLOCKED ──────────────────────────────────────────────────────── */

/* ⚠️ THE SAME FOUR TESTS HRConsole's `writeups` GROUP USES, IN THE SAME ORDER.
   Its test is a CATCH-ALL — anything that is not a counseling, an Adjustment, a
   General, a Recovery, teamdocs, orientation or a general/recovery source
   counts as a write-up. Copying the shape rather than inventing a narrower one
   is deliberate: if a new entry type appears and nobody updates this, it counts
   as a write-up and somebody misses an award. That is the safe direction to be
   wrong in. */
export function isWriteUp(entry) {
  const x = entry || {};
  if (x.counseling) return true;                 // the formal ladder always counts
  if (x.area === "Adjustment" || x.area === "General" || x.area === "Recovery") return false;
  const src = clean(x.source);
  if (src === "teamdocs" || src === "orientation" || src === "general" || src === "recovery") return false;
  return true;
}

/* ⚠️ A MISSING OR UNREADABLE DATE COUNTS AS INSIDE THE WINDOW. A write-up whose
   date cannot be parsed must not slip a person past the blocker — the whole
   point is to fail toward not awarding. */
function inWindow(entry, sinceIso) {
  const d = clean((entry || {}).date) || clean((entry || {}).at);
  if (!d) return true;
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return true;
  return t >= Date.parse(sinceIso);
}

/** Every entry on one person's HR file, plus the window. True = do not award. */
export function blockedByWriteUp(fileRows, sinceIso) {
  if (!Array.isArray(fileRows)) return false;
  return fileRows.some((e) => isWriteUp(e) && inWindow(e, sinceIso));
}

/* ── WHAT EARNS WHAT ─────────────────────────────────────────────────────── */

/* ⚠️ ONE AWARD PER `id` PER PERSON, FOREVER. `id` is what the ledger is checked
   against, so a job that runs twice on the same day, or a week later, finds the
   award already there and does nothing. Without this the cron pays somebody
   again every single morning for the same finished deck. */
export const DEFAULT_RULES = Object.freeze([
  {
    id: "training-deck",
    amount: 2,
    /* Reason text is REQUIRED by makeEntry and is read by the person on their
       own balance, so it says what they did rather than naming a rule. */
    reason: (ev) => `Finished ${ev.deckName || "a training path"}`,
    label: "Finishing a training path",
  },
]);

/* ── THE AWARDS FOR ONE PERSON ───────────────────────────────────────────── */

/**
 * @param {object} person       { id, name }
 * @param {object} evidence     { decksDone: [{ key, name }] }
 * @param {object} opts         { fileRows, sinceIso, alreadyAwarded:Set, rules }
 * @returns {Array} [{ awardId, personId, amount, reason }]
 *
 * ⚠️ RETURNS WHAT TO AWARD. It does not write, and it does not build a ledger
 * entry — `makeEntry` in tokens.js is the only thing that may, because it is
 * the only thing that refuses a blank reason or a fractional amount.
 */
export function awardsFor(person, evidence, opts) {
  const o = opts || {};
  const pid = clean(person && person.id);
  if (!pid) return [];

  /* ⚠️⚠️ THE BLOCKER RUNS BEFORE ANY RULE. Not as a filter afterwards: a filter
     is one refactor away from being reordered, and the consequence of getting
     that wrong is paying somebody the week they were disciplined. */
  if (blockedByWriteUp(o.fileRows, o.sinceIso || new Date(0).toISOString())) return [];

  const rules = Array.isArray(o.rules) && o.rules.length ? o.rules : DEFAULT_RULES;
  const already = o.alreadyAwarded instanceof Set ? o.alreadyAwarded : new Set();
  const out = [];

  for (const rule of rules) {
    if (clean(rule && rule.id) !== "training-deck") continue;
    for (const deck of (evidence && evidence.decksDone) || []) {
      const key = clean(deck && deck.key);
      if (!key) continue;
      const awardId = `auto:${rule.id}:${pid}:${key}`;
      if (already.has(awardId)) continue;
      const amount = Number(rule.amount);
      if (!Number.isFinite(amount) || amount <= 0 || Math.trunc(amount) !== amount) continue;
      const reason = typeof rule.reason === "function"
        ? clean(rule.reason({ deckName: deck.name }))
        : clean(rule.reason);
      /* ⚠️ NO REASON, NO AWARD. tokens.js refuses a blank one and returns null;
         catching it here means the job never even tries, rather than silently
         dropping an entry it thought it had made. */
      if (!reason) continue;
      out.push({ awardId, personId: pid, amount, reason });
    }
  }
  return out;
}

/* Every awardId already in the ledger, so a rerun is a no-op. The job hands us
   the raw entries; we do not know or care how they were stored. */
export function awardedIds(entries) {
  const s = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const a = clean(e && e.awardId);
    if (a) s.add(a);
  }
  return s;
}
