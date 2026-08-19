/* finShared.js — the one value the dashboard needs from the Financial Suite
   before it opens: the tab-handoff key. A leaf so App.jsx stops importing
   FinancialSuite.jsx (and every tool it drags in) at first paint. */
export const LAST_TAB_KEY = "gcfcr-financials-last-tab";

/* ── WHO MAY SEE PROFIT SHARE — ONE DEFINITION (Aug 10 2026, sweep 17) ──────
   Matt, Jul 22 2026: "view only to executive tier and up plus payroll".

   🐛 THIS RULE EXISTED TWICE AND THE TWO COPIES DISAGREED. The tab matched
   these five NAMES; the API matched `rank >= 6 || Payroll`. Those are not the
   same test, and FinancialSuite's own comment said so in advance — it explained
   that it matched on name precisely BECAUSE a rank test "would also admit
   Leadership Development Director, which is below the line Matt drew" — and the
   route used exactly that rank test anyway.

   Measured against the live roster, the gap admitted two real people the screen
   deliberately hides:
     · Bri — Leadership Development Director, rank 6
     · Cindy — Accounts Payable, rank 7 (the tab wants "Payroll")
   Both could fetch the pay groups and multipliers from the API that their own
   Profit Share tab refuses to render.

   ⚠️ A LEAF WITH NO IMPORTS, so BOTH HALVES CAN USE IT. That is the whole
   point: a gate written twice is a gate that drifts, and this one already had.
   worker.js can import this file; it must never gain a React or store import.
   ⚠️ NAMES, NOT RANK, AND THAT IS DELIBERATE. roleTier collapses everything at
   rank 6+ into tier 3, so any rank test admits more than Matt asked for. */
export const PROFIT_ROLES = Object.freeze([
  "Executive Director", "Executive", "Human Resources", "Owner", "Payroll",
]);
export const canSeeProfitShare = (role) =>
  PROFIT_ROLES.includes(String(role || "").trim());

/* ── DIRECTORS (Matt, Aug 10 2026) ─────────────────────────────────────────
   Looking at Brandon's phone: "Director should see these things but
   just not the profit share or PTO. The other things in financial though."

   ★ WHY A DIRECTOR COULD NOT SEE THEM. Director is rank 5 and roleTier only
   reaches tier 3 at rank 6, so a Director sits on tier 2 while Financials, the
   Business Scorecard and IPO Action Items are all tier 3. The same arithmetic
   is why his own header reads "Leader" — that is tier 2's name.

   ★ THE TITLE, NOT THE RANK. Raising Director to tier 3 would hand them every
   tier-3 tile in the Hub, HR Console included. `allow: ["Director"]` opens the
   three tiles Matt named and nothing else. Assistant Director is deliberately
   NOT here: two people hold Director today (Brandon, tm16, and Daisy, tm20,
   both by override in gcfcr-hr-roles), and nine hold Assistant Director.

   ⚠️ THIS FILE IS THE ONE DEFINITION BECAUSE THE GATE LIVES IN TWO HALVES, and
   this repo has been bitten by exactly that twice — Facilities on Aug 8, where
   a Director cleared a tile's role arm and then took a 403 from its rank-6
   route, and canSeeProfitShare above, which existed twice and disagreed. A
   tile that opens onto a screen the Worker will not feed is worse than a locked
   tile, because it looks like it works. App.jsx and worker.js both import this. */
export const DIRECTOR_ROLES = Object.freeze(["Director"]);
export const isDirector = (role) =>
  DIRECTOR_ROLES.includes(String(role || "").trim());

/* Financials tabs a Director does not get.
   ⚠️ "profitshare" IS DELIBERATELY NOT IN THIS LIST. PROFIT_ROLES above already
   excludes Director, so that tab is hidden by the rule that has always decided
   it. Naming it here as well would be the same decision written twice, which is
   how canSeeProfitShare drifted from the route in the first place.
   ⚠️ HIDING THE PTO TAB IS NOT A LOCK. The PTO ledger is read with a plain
   kvGet and has no read gate on it — for anybody, today. This keeps it out of a
   Director's way, which is what was asked; it does not secure it. */
export const DIRECTOR_HIDDEN_FIN_TABS = Object.freeze(["pto"]);
export const finTabHiddenFor = (role, tabId) =>
  isDirector(role) && DIRECTOR_HIDDEN_FIN_TABS.includes(tabId);
