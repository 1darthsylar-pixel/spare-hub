/* ══════════════════════════════════════════════════════════════════════════
   test/finShared.test.js — THE ACCESS RULES. Who may see profit share, who is
   a Director, and which Financials tab a Director does not get.

   ⚠️⚠️ THESE ARE GATES, SO THE ASSERTIONS THAT MATTER ARE THE REFUSALS. A gate
   that answers `true` for everything passes every "the right person gets in"
   test ever written. Every rule below is therefore graded from both ends: the
   people it must admit, AND the people it must turn away.

   ⛔⛔ AND THE REFUSALS ARE NOT HYPOTHETICAL. `finShared.js` exists because this
   rule was written TWICE and the two copies disagreed: the tab matched five
   names, the route matched `rank >= 6 || Payroll`. Measured against the live
   roster that admitted two real people the screen deliberately hides. The
   named-role cases below are that bug, frozen as tests.

   ⚠️ NO DIVIDE-BY-ZERO CASE HERE, AND THAT IS STATED RATHER THAN FAKED. Nothing
   in this file divides, or does arithmetic at all. Inventing a case to satisfy
   the shape of a checklist would be a test that grades nothing.
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROFIT_ROLES, canSeeProfitShare,
  DIRECTOR_ROLES, isDirector,
  DIRECTOR_HIDDEN_FIN_TABS, finTabHiddenFor,
  LAST_TAB_KEY,
} from "./finShared.js";

/* ── 0. the control ──────────────────────────────────────────────────────── */
/* ⚠️ A GATE THAT ALWAYS SAYS NO PASSES EVERY REFUSAL TEST BELOW. Prove it can
   say yes before grading anything it says no to. */
test("control - the gates can answer yes at all", () => {
  assert.equal(canSeeProfitShare("Owner"), true);
  assert.equal(isDirector("Director"), true);
  assert.equal(finTabHiddenFor("Director", "pto"), true);
});

/* ── 1. canSeeProfitShare — who gets in ──────────────────────────────────── */
test("canSeeProfitShare - admits exactly the five named roles", () => {
  for (const r of ["Executive Director", "Executive", "Human Resources", "Owner", "Payroll"]) {
    assert.equal(canSeeProfitShare(r), true, `${r} should be admitted`);
  }
  /* ⚠️ THE LIST IS THE RULE, so the count is pinned. A sixth name arriving
     without a decision is the widening this file exists to stop. */
  assert.equal(PROFIT_ROLES.length, 5);
});

/* ── 2. canSeeProfitShare — who is refused ───────────────────────────────── */
test("canSeeProfitShare - refuses a missing role", () => {
  assert.equal(canSeeProfitShare(null), false);
  assert.equal(canSeeProfitShare(undefined), false);
  assert.equal(canSeeProfitShare(""), false);
  /* the "zero" case for a string gate: whitespace only, which trims to "" */
  assert.equal(canSeeProfitShare("   "), false);
});

test("canSeeProfitShare - refuses a role it has never heard of", () => {
  assert.equal(canSeeProfitShare("Team Leader"), false);
  assert.equal(canSeeProfitShare("Trainer"), false);
  assert.equal(canSeeProfitShare("Operator"), false);
});

test("★★ canSeeProfitShare - refuses the two rank-6-and-up roles the old rank test let through", () => {
  /* ⛔ THIS IS THE ORIGINAL BUG, FROZEN. The route used `rank >= 6 || Payroll`,
     which admitted a Leadership Development Director (rank 6) and Accounts
     Payable (rank 7). Both could fetch the pay groups and multipliers from an
     API their own Profit Share tab refuses to render. */
  assert.equal(canSeeProfitShare("Leadership Development Director"), false);
  assert.equal(canSeeProfitShare("Accounts Payable"), false);
});

test("canSeeProfitShare - refuses a near miss rather than guessing", () => {
  /* ⚠️ CASE-SENSITIVE AND EXACT, ON PURPOSE. A gate that accepts "owner" also
     has to decide about "OWNER" and "0wner", and every loosening is a decision
     nobody made. A stored title that does not match exactly fails CLOSED, which
     is the safe direction. */
  assert.equal(canSeeProfitShare("owner"), false);
  assert.equal(canSeeProfitShare("Executive  Director"), false);   // two spaces
  assert.equal(canSeeProfitShare("Exec Director"), false);
});

test("canSeeProfitShare - trims, so a padded stored title still works", () => {
  assert.equal(canSeeProfitShare("  Owner  "), true);
  assert.equal(canSeeProfitShare("\tPayroll\n"), true);
});

test("canSeeProfitShare - a non-string does not throw and does not get in", () => {
  /* ⚠️ It must REFUSE rather than throw: a gate that throws takes the screen to
     its crash boundary, which reads as "the Hub is broken" instead of "you may
     not see this". */
  assert.equal(canSeeProfitShare(0), false);
  assert.equal(canSeeProfitShare(false), false);
  assert.equal(canSeeProfitShare([]), false);
  assert.equal(canSeeProfitShare({}), false);
});

test("★★ canSeeProfitShare - a role that is not a string is refused, whatever it stringifies to", () => {
  /* ⛔⛔ THIS IS A REAL FAIL-OPEN HOLE AND IT IS REACHABLE FROM A STORED RECORD.
     `String(x)` was doing the coercion, and `String(["Owner"])` is `"Owner"`.
     Measured, three shapes got through a gate that guards pay groups:

         ["Owner"]                    -> true
         new String("Owner")          -> true
         { toString: () => "Owner" }  -> true

     ⚠️ THE ARRAY ONE IS THE REACHABLE ONE. The Worker reads this title out of
     `gcfcr-hr-roles`, a stored record, through `hrEffectiveTitleForUid`. JSON
     can hold `{"tm16": ["Owner"]}`, and a plain object stringifies to
     "[object Object]" so it cannot match — but a one-element array is exactly
     the shape a "somebody holds two titles" change would produce, and it would
     hand out the pay groups silently.

     ⇒ A GATE MUST FAIL CLOSED. `typeof role === "string"` is the whole fix, and
     for every real string title the answer is byte-identical to before. */
  assert.equal(canSeeProfitShare(["Owner"]), false);
  assert.equal(canSeeProfitShare(["Owner", "x"]), false);
  assert.equal(canSeeProfitShare(new String("Owner")), false);
  assert.equal(canSeeProfitShare({ toString: () => "Owner" }), false);
  /* the same hole, on the other two gates */
  assert.equal(isDirector(["Director"]), false);
  assert.equal(finTabHiddenFor(["Director"], "pto"), false);
});

/* ── 3. isDirector ───────────────────────────────────────────────────────── */
test("isDirector - admits Director and nothing else", () => {
  assert.equal(isDirector("Director"), true);
  assert.equal(DIRECTOR_ROLES.length, 1);
});

test("★★ isDirector - refuses Assistant Director, which is a decision not an oversight", () => {
  /* ⛔ Two people hold Director; NINE hold Assistant Director. Widening this
     opens three tier-3 tiles to nine more people, and that is Matt's call. */
  assert.equal(isDirector("Assistant Director"), false);
});

test("isDirector - refuses a missing role", () => {
  assert.equal(isDirector(null), false);
  assert.equal(isDirector(undefined), false);
  assert.equal(isDirector(""), false);
  assert.equal(isDirector("   "), false);
});

test("isDirector - refuses a near miss and does not throw on a non-string", () => {
  assert.equal(isDirector("director"), false);
  assert.equal(isDirector("Kitchen Director"), false);
  assert.equal(isDirector(0), false);
  assert.equal(isDirector({}), false);
});

/* ── 4. finTabHiddenFor ──────────────────────────────────────────────────── */
test("finTabHiddenFor - hides PTO from a Director", () => {
  assert.equal(finTabHiddenFor("Director", "pto"), true);
});

test("★★ finTabHiddenFor - does NOT name profitshare, because one rule already decides it", () => {
  /* ⛔ `canSeeProfitShare` already excludes Director, so that tab is hidden by
     the rule that has always decided it. Naming it here too would be the same
     decision written twice, which is exactly how canSeeProfitShare drifted from
     the route in the first place. This asserts the absence. */
  assert.equal(DIRECTOR_HIDDEN_FIN_TABS.includes("profitshare"), false);
  assert.equal(finTabHiddenFor("Director", "profitshare"), false);
  /* and the rule that really hides it still does */
  assert.equal(canSeeProfitShare("Director"), false);
});

test("finTabHiddenFor - hides nothing from anybody who is not a Director", () => {
  for (const r of ["Owner", "Executive Director", "Team Leader", "Payroll"]) {
    assert.equal(finTabHiddenFor(r, "pto"), false, `${r} should keep the PTO tab`);
  }
});

test("finTabHiddenFor - a missing role hides nothing", () => {
  /* ⚠️ THE SAFE DIRECTION HERE IS THE OPPOSITE OF THE GATES ABOVE, and that is
     deliberate. This is not a lock — the file says so: the PTO ledger has no
     read gate on it for anybody. It keeps a tab out of a Director's way. So an
     unknown role gets the ordinary screen rather than a mystery missing tab. */
  assert.equal(finTabHiddenFor(null, "pto"), false);
  assert.equal(finTabHiddenFor(undefined, "pto"), false);
  assert.equal(finTabHiddenFor("", "pto"), false);
});

test("finTabHiddenFor - a missing tab id hides nothing and does not throw", () => {
  assert.equal(finTabHiddenFor("Director", null), false);
  assert.equal(finTabHiddenFor("Director", undefined), false);
  assert.equal(finTabHiddenFor("Director", ""), false);
  assert.equal(finTabHiddenFor("Director", 0), false);
});

/* ── 5. the lists cannot be widened at runtime ───────────────────────────── */
test("★★ the role lists are frozen, so nothing can widen a gate at runtime", () => {
  /* ⚠️ NOT TIDINESS. Without `Object.freeze`, one `PROFIT_ROLES.push("Director")`
     anywhere in the bundle silently opens the pay groups to every Director in
     the store, for the rest of that session, with nothing on screen saying so. */
  assert.equal(Object.isFrozen(PROFIT_ROLES), true);
  assert.equal(Object.isFrozen(DIRECTOR_ROLES), true);
  assert.equal(Object.isFrozen(DIRECTOR_HIDDEN_FIN_TABS), true);

  assert.throws(() => { PROFIT_ROLES.push("Director"); });
  assert.equal(canSeeProfitShare("Director"), false, "still refused after the attempt");
});

/* ── 6. the handoff key ──────────────────────────────────────────────────── */
test("LAST_TAB_KEY is a stable string", () => {
  /* ⚠️ IT IS A STORED KEY. Renaming it does not migrate anything: it silently
     loses every leader's last tab and reads as the Hub forgetting where they
     were. Pinned so the rename has to be deliberate. */
  assert.equal(LAST_TAB_KEY, "gcfcr-financials-last-tab");
});
