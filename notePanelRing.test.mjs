/* ============================================================================
   notePanelRing.test.mjs — the inset note panel keeps its edge

       node notePanelRing.test.mjs

   🐛 Matt, Aug 21 2026: "in labor and sales there are 3 boxes without a border."

   He was right, and the count was exact. LaborPlanner wrote the same inset
   panel out by hand five times. Two carried `border: 1px solid LINE` and three
   did not, so on a white card those three had no edge at all and read as a gap
   in the layout rather than as a box.

   ⚠️ THE BUG WAS THE COPYING, NOT THE MISSING LINE. Adding a border to three
   places would have left five hand-written copies and a sixth arriving next
   week. `notePanel()` in cardStyle.js is now the only definition, which is the
   same move that file's own header records for the card shadow after it had
   been written out thirteen times in App.jsx.

   ⛔ THIS IS DELIBERATELY NARROW, AND THAT IS THE POINT. A rule saying every
   raised surface needs a ring is FALSE here — 64 of them across the app have
   none on purpose, because `toolCard` sits on a grey page and `toolRow` sits
   inside a card, and neither wants an edge. A guard that fires on sixty-four
   correct things teaches people to ignore it. This one watches the one panel
   that actually drifted, on the surface where a missing ring is invisible.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};

/* The Financials tabs — where a note panel sits on a white card. */
const TABS = ["FCRPage.jsx", "LaborPlanner.jsx", "SalesAllocation.jsx",
              "FoodCostTracker.jsx", "ExpenseTracker.jsx"];

console.log("\n── 1. one definition, not five copies");
{
  const card = readFileSync(new URL("./cardStyle.js", import.meta.url), "utf8");
  t("cardStyle.js exports notePanel (control)", /export function notePanel\(/.test(card));
  t("★ and it carries the ring, which is the whole reason it exists",
    /export function notePanel\([\s\S]*?border: `1px solid \$\{line\}`/.test(card));
  t("★ and the soft shadow, so it still reads as a panel",
    /export function notePanel\([\s\S]*?boxShadow: CARD_3D_SOFT/.test(card));
}

console.log("\n── 2. ★★ nobody writes it out by hand any more");

/* The signature of this exact panel written out by hand: the tinted surface and
   the shallow shadow on one line. */
const handWritten = (l) => /cardSurface\([A-Z_"#]+, 0\.4\)/.test(l) && /CARD_3D_SOFT/.test(l);

{
  const handmade = [];
  for (const f of TABS) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    src.split("\n").forEach((l, i) => { if (handWritten(l)) handmade.push(`${f}:${i + 1}`); });
  }
  for (const h of handmade) console.log(`        written out by hand: ${h}`);
  t("★★ every inset note panel comes from the shared style", handmade.length === 0, handmade);

  /* ⚠⚠ PROVED AGAINST A SAMPLE, NOT AGAINST THE CODEBASE, AND THAT DISTINCTION
     COST A ROUND HERE. The first control asserted the scan still found panels
     in the real files — which it did, until the fix landed and converted every
     one of them. Then it found zero, and "nobody writes it by hand" passed
     because there was nothing left matching the pattern rather than because
     the code was right. A control that the fix itself switches off is not a
     control. This one hands the scan a line it MUST flag, so it keeps proving
     the scan works long after the last real copy is gone. */
  const SAMPLE = '<div style={{ backgroundColor: BG, backgroundImage: cardSurface(NAVY, 0.4), ...accentEdge(NAVY, 3), boxShadow: CARD_3D_SOFT }}>';
  t("★ the scan flags a hand-written panel when it sees one (control)", handWritten(SAMPLE));
  t("★ and does not flag the shared style (control)",
    !handWritten('<div style={{ ...notePanel(NAVY, LINE, BG), borderRadius: 10, padding: 12 }}>'));
}

console.log("\n── 3. ★ and the shared style is actually used");
{
  let used = 0;
  for (const f of TABS) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    used += (src.match(/\.\.\.notePanel\(/g) || []).length;
  }
  /* ⛔⛔ A FLOOR, NEVER AN EXACT COUNT. This asserted `used === 7` and went red
     on Aug 21 2026 the moment two MORE panels were correctly converted to the
     shared style — accusing the fix of being the bug.

     ★ That is the trap this repo already has written down in its own words: "a
     count that has to be hand-edited is a count that will accuse working code."
     `tileMerge.test.mjs` was bitten by the identical shape.

     ⇒ The direction is what matters. More panels on the shared style is the
     GOAL, so the number may only ever RISE. Losing one still fails, which is the
     whole job of this assertion ("did not just lose the panels"), and the floor
     is raised in the same commit that raises the real count so a later loss
     cannot hide behind an old number. */
  const FLOOR = 9;   // Aug 21 2026: 7 in LaborPlanner, 2 in SalesAllocation, counted
  t(`★ the Financials tabs use it, and did not just lose the panels — ${used} (floor ${FLOOR})`,
    used >= FLOOR, used);
  const lp = readFileSync(new URL("./LaborPlanner.jsx", import.meta.url), "utf8");
  t("★ and LaborPlanner imports it", /import \{[^}]*notePanel[^}]*\} from "\.\/cardStyle\.js"/.test(lp));
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
