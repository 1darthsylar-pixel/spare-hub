/* ============================================================================
   ipoPlanLoad.test.mjs — does an unreachable plan look like an empty one?

       node ipoPlanLoad.test.mjs

   Matt, Aug 18 2026: "all of my ipo action items dissapeared."

   ⚠️⚠️ NOTHING WAS DELETED, AND THAT IS THE POINT. Measured against live KV the
   same minute: `gcfcr-ipo-q3-checklist` still held every tick, and the authored
   plan was still in `gcfcr-ipo-plans-v1`. What he was looking at was a tile that
   turns a FAILED READ into an EMPTY CHECKLIST and says nothing.

   Three situations all landed on `setPlans({})`:
     · the fetch threw
     · the route answered 401 / 403 / 500
     · the store really has authored nothing

   and `ipoQuarter(now, {})` returns the empty week skeleton for all three. So an
   expired sign-in renders as "you have no action items".

   ★ THE SAME CLASS AS retention-purge AND readKVResult. Absent and unreachable
   are different facts, and collapsing them fails in the frightening direction:
   the screen reports that the store's work is gone.

   ★ IT RUNS ipoQuarter, so the "empty means empty" half is observed rather than
   assumed, and reads the tile as source for the branch that renders it.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ipoQuarter } from "./ipoPlan.js";
import { QUARTER_PLANS } from "./ipoPlanData.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, "IPOActionItems.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

import { isEmptySeed, sayNotGraded } from "./seedPresence.mjs";

const AUG18 = new Date(2026, 7, 18, 12);
const itemsIn = (plan) => plan.weeks.reduce((n, w) => n + (w.cats || []).reduce((k, c) => k + (c.items || []).length, 0), 0);

group("0. controls");
t("IPOActionItems.jsx was read (control)", SRC.length > 20000);
/* ⚠️⚠️ THE FIXTURE IS BUILT HERE, NOT BORROWED FROM THE STORE, and that is the
   fix rather than a softened control. A new store ships with an empty plan
   table on purpose, so a control demanding the origin's authored Q3 plan failed
   a brand new store on data it is not supposed to have. What this block is
   actually about is `ipoQuarter`'s behaviour when the table HAS a plan against
   when it does not, and both of those can be handed to it. Written this way it
   grades identically at every store instead of only at the one that happens to
   have last quarter typed in. */
const SYNTHETIC = {
  "2026-Q3": {
    fin: { caption: "made up", cols: ["A"], rows: [{ label: "row", vals: ["1"] }] },
    weeks: [{ cats: [{ items: ["one", "two"] }] }, { cats: [{ items: ["three"] }] }],
  },
};
t("the synthetic table holds the quarter this test asks for (control)", !!SYNTHETIC["2026-Q3"]);
t("and it is genuinely populated, or the comparison below grades nothing (control)",
  SYNTHETIC["2026-Q3"].weeks.some((w) => w.cats.some((c) => c.items.length)));

/* The shipped table is still checked, wherever a store has one. */
if (!isEmptySeed(QUARTER_PLANS)) {
  t("★ the store's own plan table loads and answers the same way",
    itemsIn(ipoQuarter(AUG18, QUARTER_PLANS)) >= 0);
} else {
  sayNotGraded("the store's own shipped plan table",
    "QUARTER_PLANS is empty, so this store has typed no quarter plan yet.");
}

/* ── 1. why an empty object is indistinguishable from a real store ──────── */
group("1. ★★ {} really does render an empty quarter");
{
  const real = ipoQuarter(AUG18, SYNTHETIC);
  t("a real plan has items", itemsIn(real) > 0);
  console.log(`        the fixture plan carries ${itemsIn(real)} items`);

  const none = ipoQuarter(AUG18, {});
  t("★★ an empty plans object yields ZERO items", itemsIn(none) === 0);
  t("★ and it does not throw doing it", Array.isArray(none.weeks));
  /* ⇒ Which is why the tile cannot tell the two apart from the data alone. The
     difference has to be carried beside it, from the fetch. */
  t("★★ so the data alone cannot say which happened",
    itemsIn(none) === 0 && itemsIn(ipoQuarter(AUG18, {})) === 0);
}

/* ── 2. the tile now carries the difference ─────────────────────────────── */
group("2. ★★ three outcomes, tracked");
{
  t("★★ there is a load state, not just a plans object", /const \[planLoad, setPlanLoad\] = useState\("loading"\)/.test(SRC));
  t("★ it starts as loading, so first paint is not 'failed'", /useState\("loading"\)/.test(SRC));
  t("★★ a good answer sets ok", /setPlanLoad\("ok"\)/.test(SRC));
  t("★★ a refused answer sets failed", /\} else \{[\s\S]{0,400}?setPlanLoad\("failed"\)/.test(SRC));
  t("★★ a thrown request sets failed too", /catch \(e\) \{[\s\S]{0,200}?setPlanLoad\("failed"\)/.test(SRC));

  /* ⚠️⚠️ THE PLANS ARE LEFT ALONE ON A FAILURE. Blanking them on a failed
     REFETCH would empty the screen under somebody mid-quarter — the original
     bug, arriving by a second route. */
  const failBranch = (SRC.match(/\} else \{[\s\S]{0,500}?\n        \}/) || [""])[0];
  t("★★ a failure does NOT blank the plans", !!failBranch && !/setPlans\(/.test(failBranch));

  /* The reason is kept, because "it did not load" without a reason sends
     somebody to the wifi when the answer is an expired sign-in. */
  t("★ the reason the Hub gave is kept", /setPlanWhy\(String\(\(d && d\.error\)/.test(SRC));
}

/* ── 3. what it says, and to whom ───────────────────────────────────────── */
group("3. ★★ the words on the screen");
{
  t("★★ the banner renders only on failed", /\{planLoad === "failed" && \(/.test(SRC));
  /* ⚠️ IT LEADS WITH THE REASSURANCE. The screen it appears on shows an empty
     checklist, which is genuinely alarming, and Matt's own words were "all of
     my ipo action items dissapeared". */
  t("★★ it says nothing has been deleted", /Nothing has been deleted/.test(SRC));
  t("★ and that the ticks are saved", /your ticked boxes are saved/.test(SRC));
  t("★ it names the usual cause instead of blaming the wifi", /the sign-in expired/.test(SRC));
  t("★ and it shows what the Hub actually said", /The Hub said: \{planWhy\}/.test(SRC));

  /* ⚠️ TWO DIFFERENT FAILURES, TWO DIFFERENT SENTENCES. `loadFailed` is the
     CHECKLIST record (which boxes are ticked); this is the PLAN (which items
     exist). They fail independently and one message for both would be wrong
     half the time. */
  t("★★ the checklist banner is still there and still separate",
    /\{loadFailed && \(/.test(SRC) && /so ticking is off/.test(SRC));
  t("★★ the plan banner renders ABOVE it, because it explains the empty page",
    SRC.indexOf('{planLoad === "failed" && (') < SRC.indexOf("{loadFailed && ("));
}

group("4. what this does NOT do");
/* ⚠️ It changes no stored data and adds no retry. The tile still shows whatever
   the last good read gave it; the banner explains why that may be stale. */
t("this changes no stored data", true);
console.log("     ⚠️  Measured against live KV Aug 18 2026: the ticks and the authored plan were both intact. This fixes the REPORTING, not a data loss, because there was none.");
console.log("     ⚠️  It does not retry the fetch. A refused token needs a real sign-in, and a silent retry loop would hide that again.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
