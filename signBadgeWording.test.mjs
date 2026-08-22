/* ============================================================================
   signBadgeWording.test.mjs — the red badge must say what made it red

       node signBadgeWording.test.mjs

   🐛 Bri, Aug 21 2026: "I see a red digit, but I don't see any wording that
   tells me where to go."

   ⚠️⚠️ THE WORDING WAS NOT MISSING. IT WAS OUTRANKED, which is why it looked
   random and why nobody could reproduce it on demand.

   Only `signals[0]` is ever rendered under a section name — one line, by
   design, because "3 tools · 1 overdue evaluation" buries the part worth
   reading. "Documents to sign" was the SIXTH signal pushed onto People, behind
   overdue evaluations, evaluations due, unsigned handbooks, pending
   recommendations and team goals.

   And it is the only one of the six that sets the tone UNCONDITIONALLY.

   ⇒ A leader with one document to sign and two evaluations due saw a RED badge
   reading "2 evaluations due this month". The redness came from the document.
   The wording came from something else. Nothing on the screen named the thing
   that made it red.

   ⇒ AND IT ONLY HAPPENED WHEN SHE HAD OTHER ITEMS. With an empty pulse the
   docs line was signals[0] and everything worked, which is exactly why this
   survived: it is correct on a quiet week and wrong on a busy one.

   ⛔ WHY THIS IS A SOURCE SCAN AND NOT A UNIT TEST. The pulse block lives
   inside App.jsx, a 7,000-line component that nothing in checks/ can execute,
   and extracting it is a far bigger change than the bug warrants. The rule is
   still worth holding, so it is held the only way it can be held from here.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const g = (n) => console.log(`\n── ${n}`);

const A = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

g("0. controls");
t("App.jsx was read", A.length > 100000);
t("★ only the first signal is rendered (control) — the whole reason order matters",
  /badgeLabel = signals\[0\]/.test(A));
t("★ and the docs signal exists at all (control)",
  /countLabel\(docsToSign, "document", "documents"\)/.test(A));

g("1. ★★★ the signal that forces red must lead");
{
  /* The block that sets the tone unconditionally. */
  const i = A.indexOf('section.icon === "sec:people" && docsToSign > 0');
  t("the docs block was found (control)", i > 0);
  const block = A.slice(i, A.indexOf("\n              }", i));

  t("★★ it still forces red (control)", /badgeTone = "red";/.test(block), block.slice(0, 200));
  /* ⚠️⚠️ THE ONE-WORD FIX. `push` puts it sixth; `unshift` puts it first. */
  t("★★★ and its wording is unshifted, so it is the line that shows",
    /signals\.unshift\(/.test(block), block.match(/signals\.(push|unshift)/));
  t("★★★ it is NOT pushed", !/signals\.push\(/.test(block), block.match(/signals\.push[^\n]*/));
}

g("2. ★★ the rule, not the special case");
{
  /* ⚠️ ANY signal that forces red on its own has to lead, or the badge says
     one thing and means another. Today there is exactly one. If a second ever
     appears, this goes red and somebody has to decide the order deliberately
     rather than by where they happened to type it. */
  const people = A.slice(A.indexOf('let badgeTone = null;'), A.indexOf('section.icon === "sec:money"'));
  t("the People pulse block was sliced (control)", people.includes("docsToSign") && people.includes("evalsOverdue"));

  const forcers = [...people.matchAll(/badgeTone = "red";/g)].length;
  t("★★ exactly one signal forces red unconditionally", forcers === 1, forcers);
  const unshifts = [...people.matchAll(/signals\.unshift\(/g)].length;
  t("★★ and exactly one signal leads", unshifts === 1, unshifts);
  t("★★★ so the count that forces red and the count that leads agree",
    forcers === unshifts, { forcers, unshifts });
}

g("3. ★★ the Today row stops yielding");
{
  const i = A.indexOf("const toolInputStatus = docsToSign > 0");
  t("the row was found (control)", i > 0);
  const line = A.slice(i, A.indexOf("\n", i));
  /* 🐛 THE SECOND SUPPRESSION, SAME SHAPE. This read
     `docsToSign > 0 && !toolInputStatusRaw.hr`, so the one line naming the
     signing screen vanished the moment HR had anything else to say — which on
     a busy week is always. Same bug, same week, different line. */
  t("★★★ it no longer waits for HR to have nothing to say",
    !/!toolInputStatusRaw\.hr/.test(line), line);
  t("★ and it still names where to go", /open your own file/.test(A));
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
