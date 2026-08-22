/* ============================================================================
   starReasons.js — WHAT EARNS A STAR, AND WHAT A STAR BUYS.

   ★ LEAF MODULE. Imports nothing.

   Matt, Aug 20 2026: "We still need the stars system to be complete. Refer to
   the LDD and the HR Director slack but break food is the reward."

   ⛔⛔ WHAT WAS ACTUALLY MISSING WAS NOT CODE. The ledger, the balances, the
   reversals, the shop and the spend path were all built and all worked. What
   was missing is that **the answers existed only in Slack**. A leader opening
   the tile got a person picker, an empty number box and an empty sentence box,
   and had to invent both the reason and the amount from nothing, every time.

   ⭐ THE ANSWERS, LIFTED FROM THE THREAD RATHER THAN INVENTED HERE:

   The LDD, Aug 3 2026, in the group DM with the HR Director and Matt, under "REWARDS
   — Never cancel demerits, a system its own. Up to the discretion of LDD and HR
   Director with input from Area Directors." Six LDD rewards, all **+1**.

   Matt, Aug 11 2026, still open: "Still waiting on you and the LDD: what a token is
   worth. Her six leadership rewards are all +1. Your side was 'subject to gift
   card prizes', which becomes the things people spend on." ⇒ Aug 20: **break
   food**, which is the answer to the spend half.

   ⚠️⚠️ THESE ARE SUGGESTIONS, NOT THE STORE'S DATA, AND THE DISTINCTION IS
   RULE 18. What a star buys is typed into the shop by a leader and lives in the
   store's own record. This file offers a starting list to tap, which is the LDD's
   own ruling applied to a different question: "Give them the bones with info,
   they can change later if they want." Nothing here is written anywhere until
   somebody taps it.

   ⚠️ THE PRICES ARE A LADDER, NOT A POLICY. Nobody has set them. One star is a
   drink, four is a full meal, and Matt can change every number before or after
   he adds them. They are laid out so the shape is obvious rather than so the
   figures are right.
   ============================================================================ */

/* ── WHAT EARNS ONE ──────────────────────────────────────────────────────────
   ⚠️ EVERY ONE IS +1 BECAUSE THE LDD SET THEM ALL AT +1. Do not "tier" these
   without her: she killed the money attached to the scoreboard for exactly the
   reason a tiered reward invites — "if we go overboard with incentives then we
   are just training our leaders to meet us with their responsibilities because
   they're getting rewarded rather than because it's their job."
   ⚠️ THE `reason` IS WHAT THE PERSON READS ON THEIR OWN BALANCE, so it is
   written to them, not about a rule. */
export const LDD_REWARDS = Object.freeze([
  { id: "peak-reachers", amount: 1, reason: "Above and beyond with Peak Reachers" },
  { id: "three-months-goals", amount: 1, reason: "Three months of goals in a row" },
  { id: "no-demerits", amount: 1, reason: "No demerits for two months running" },
  { id: "l201", amount: 1, reason: "Above and beyond in L201" },
  { id: "coached-up", amount: 1, reason: "Clear improvement after coaching" },
  { id: "checklists-clean", amount: 1, reason: "A full month with no missed checklist" },
]);

/* ⚠️ THE HR SIDE IS DELIBERATELY EMPTY AND SAYS SO. Her entry in the same
   thread reads "HR CAN ADD WHAT THEY WOULD LIKE HERE FOR THEIR AREA" and they
   has not filled it in. An invented HR list would put words in her mouth on a
   screen leaders act from. ⇒ It stays empty until she answers, and the picker
   below still has "Something else" for anything not on a list. */
export const HR_REWARDS = Object.freeze([]);

export const REWARD_REASONS = Object.freeze([...LDD_REWARDS, ...HR_REWARDS]);

/* ── WHAT A STAR BUYS ────────────────────────────────────────────────────────
   Matt, Aug 20 2026: "break food is the reward." */
export const BREAK_FOOD_SUGGESTIONS = Object.freeze([
  { name: "Any drink on break", cost: 1 },
  { name: "A side on break", cost: 2 },
  { name: "An entrée on break", cost: 3 },
  { name: "A full meal on break", cost: 4 },
]);

/* ── THE PICKER ──────────────────────────────────────────────────────────────
   ⚠️ "SOMETHING ELSE" IS ALWAYS LAST AND ALWAYS PRESENT. The list is a
   shortcut, never a gate: a leader who watched somebody do something nobody
   listed must still be able to say so, and `makeEntry` already refuses a blank
   reason so the free-text path stays safe. */
export const OTHER_REASON_ID = "__other";

export function reasonOptions(rules = REWARD_REASONS) {
  const list = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && r.id && r.reason && Number.isInteger(Number(r.amount)) && Number(r.amount) > 0)
    .map((r) => ({ id: String(r.id), reason: String(r.reason), amount: Number(r.amount) }));
  return [...list, { id: OTHER_REASON_ID, reason: "Something else", amount: null }];
}

/* What the two boxes should hold once a reason is picked. Returns null for the
   free-text choice, which means "leave what the leader typed alone". */
export function fillFor(id, rules = REWARD_REASONS) {
  if (!id || id === OTHER_REASON_ID) return null;
  const hit = (Array.isArray(rules) ? rules : []).find((r) => r && String(r.id) === String(id));
  if (!hit) return null;
  const amount = Number(hit.amount);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return { reason: String(hit.reason), amount: String(amount) };
}

/* Shop suggestions the store has not already added, matched on the NAME as
   typed, case and spacing ignored — so tapping twice cannot create a duplicate
   and a store that renamed one keeps its own wording. */
export function unaddedSuggestions(catalog, suggestions = BREAK_FOOD_SUGGESTIONS) {
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
  const have = new Set((Array.isArray(catalog) ? catalog : []).map((c) => norm(c && c.name)));
  return (Array.isArray(suggestions) ? suggestions : []).filter((s) => s && s.name && !have.has(norm(s.name)));
}
