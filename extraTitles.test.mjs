/* ============================================================================
   extraTitles.test.mjs — can a store name its own leadership roles without
   being able to hand itself access?

       node extraTitles.test.mjs

   ★ WHY. Matt, Aug 16 2026: "please fix and update the store config where it
   can." The Village's roster import stopped on six people whose titles the Hub
   had never heard of — Kitchen Director, Talent Director, Hospitality Director,
   Restaurant Marketing Director, Manager/Training Director. An unknown title
   scores 0, which is Limited, so the only way through was to file all six as
   "Assistant Director": a title nobody at that store uses. Design rule 18.

   ⚠️⚠️ THE DANGEROUS DIRECTION IS THE ONE THIS FILE IS MOSTLY ABOUT. A store
   supplying titles is a store supplying words. If it could also supply RANKS
   freely, "Team Member: 8" typed into a settings screen would hand every team
   member Owner access to ~128 personnel files. Sections 2 and 3 are that.
   ============================================================================ */
import assert from "node:assert";
import { extraTitleRanks, HR_EXTRA_TITLE_MAX_RANK, applyStoreOverrides, STORE_CONFIG } from "./storeConfig.js";
import { hrRankOfTitle, HR_RANK_BY_TITLE, HR_FULL_READ_MIN } from "./hrRoster.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};
/* Each case sets the store's saved settings, then puts them back. */
const withTitles = (titles, fn) => {
  try { applyStoreOverrides({ hr: { extraTitles: titles } }); fn(); }
  finally { applyStoreOverrides({ hr: { extraTitles: {} } }); }
};

console.log("\n── 1. a store can name its own roles");
t("an unknown title scores 0 until the store adds it", () => {
  assert.equal(hrRankOfTitle("Kitchen Director"), 0);
});
t("once added, it carries the rank the store chose", () => {
  withTitles({ "Kitchen Director": 4, "Hospitality Director": 5 }, () => {
    assert.equal(hrRankOfTitle("Kitchen Director"), 4);
    assert.equal(hrRankOfTitle("Hospitality Director"), 5);
  });
});
t("and it goes away again when the store removes it", () => {
  assert.equal(hrRankOfTitle("Kitchen Director"), 0);
});
t("the default is empty, so a clone inherits nobody's vocabulary", () => {
  assert.deepEqual(STORE_CONFIG.hr.extraTitles, {});
  assert.deepEqual(extraTitleRanks(), {});
});

console.log("\n── 2. ⚠️ A STORE CANNOT REDEFINE A TITLE THE HUB ALREADY OWNS");
t("Team Member stays rank 1 even if the store says 8", () => {
  withTitles({ "Team Member": 8 }, () => {
    assert.equal(hrRankOfTitle("Team Member"), 1, "a settings screen just granted Owner access");
  });
});
t("Owner cannot be demoted either", () => {
  withTitles({ Owner: 1 }, () => assert.equal(hrRankOfTitle("Owner"), 8));
});
t("every built-in title is immune", () => {
  const sabotage = {};
  Object.keys(HR_RANK_BY_TITLE).forEach((k) => { sabotage[k] = 5; });
  withTitles(sabotage, () => {
    Object.entries(HR_RANK_BY_TITLE).forEach(([title, rank]) => {
      assert.equal(hrRankOfTitle(title), rank, `${title} was overridden`);
    });
  });
});

console.log("\n── 3. ⚠️ AND IT CANNOT MINT A RANK ABOVE Director");
t(`anything over ${HR_EXTRA_TITLE_MAX_RANK} is dropped, not clamped`, () => {
  /* Dropped rather than clamped on purpose: clamping a typed 9 down to 5 would
     hand somebody full personnel access because a finger slipped. */
  withTitles({ "Fake Exec": 7, "Fake Owner": 8, "Real Lead": 4 }, () => {
    assert.equal(hrRankOfTitle("Fake Exec"), 0);
    assert.equal(hrRankOfTitle("Fake Owner"), 0);
    assert.equal(hrRankOfTitle("Real Lead"), 4);
  });
});
t("the cap sits below the ranks the Hub's own gates are written around", () => {
  assert.ok(HR_EXTRA_TITLE_MAX_RANK < HR_RANK_BY_TITLE["Leadership Development Director"]);
  assert.ok(HR_EXTRA_TITLE_MAX_RANK < HR_RANK_BY_TITLE["Executive Director"]);
  assert.ok(HR_EXTRA_TITLE_MAX_RANK < HR_RANK_BY_TITLE.Owner);
});
t("rank 5 still means full personnel read, so the screen must say so", () => {
  /* Not a behaviour test — a reminder in executable form. If HR_FULL_READ_MIN
     ever moves above 5, the warning wording in StoreSettings is wrong. */
  assert.equal(HR_FULL_READ_MIN, 5);
});
t("junk rows are ignored rather than crashing or half-applying", () => {
  withTitles({ "": 4, "  ": 5, Good: 4, Bad: 0, Worse: -3, NotANumber: "five", Floaty: 4.5 }, () => {
    assert.deepEqual(extraTitleRanks(), { Good: 4 });
  });
});
t("a non-object never throws", () => {
  for (const bad of [null, [], "x", 7]) {
    withTitles(bad, () => assert.deepEqual(extraTitleRanks(), {}));
  }
});

console.log(`\n${fail ? "FAILED" : "PASSED"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
