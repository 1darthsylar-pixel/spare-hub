/* ============================================================================
   cardEdge.test.mjs — the whole card treatment lives in the shared object.

       node cardEdge.test.mjs

   ⛔⛔ WHY THIS EXISTS. Matt, Aug 22 2026: "there are still 3 or 4 boxes in
   each sales and labor without a colored layer." Measured: FOUR of Sales
   Allocation's six cards and THREE of the Labor Planner's seven had no
   coloured edge.

   ★★ AND NOTHING HAD BEEN UNDONE, WHICH IS THE SAME FINDING flatCards RECORDS
   FROM THE OTHER SIDE. A card here is three things: the surface, the shadow,
   and the coloured edge. The surface and the shadow lived in one shared
   `S.card`; the EDGE was typed by hand at each caller. So two thirds of the
   treatment was impossible to forget and one third was forgotten constantly.

   ⇒ THE FIX WAS NOT SEVEN CARDS. It was moving the edge into the object, so a
   caller has nothing left to remember. This file is what stops it coming back
   out.

   ══════════════════════════════════════════════════════════════════════════
   ⭐⭐ THE RULE IS SELF-CONSISTENCY, NEVER A LIST OF SCREENS — the design
   flatCards.test.mjs arrived at after its first version named four files and
   graded nothing anywhere else.

   Here it is: **a shared style object that paints the card surface and raises
   it must also carry the accent edge.** Measured the day it was written, 8 of
   the 11 already complied, so this is the house style being held rather than a
   preference being introduced.

   ⚠️ IT KEYS ON `cardSurface(`, AND THAT IS WHAT KEEPS IT OFF THINGS THAT ARE
   NOT CARDS. HRConsole's `modal` and `toast` both carry a shadow, padding and a
   radius, and neither is a card — they paint a flat colour, so they fall out on
   their own rather than by being named here. A rule that needed an exceptions
   list would rot the first time somebody added a twelfth object.

   ⚠️⚠️ AND IT CANNOT SEE A CARD WRITTEN INLINE, ON PURPOSE. flatCards reads the
   `<div` line; this one reads the shared object, which is the exact blind spot
   no line scanner can reach — `<div style={S.card}>` carries no style at all on
   its own line. The two files grade different halves and neither covers the
   other. Do not merge them.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};

/* ⚠️ ONE READING OF THE QUESTION, used by the sweep AND by every control, so a
   control cannot drift away from the thing it is proving. */
const OBJ = /^\s{2,}(\w+):\s*\{([^{}]|\{[^{}]*\})*\},?$/gm;

function scan(src) {
  const out = [];
  for (const m of src.matchAll(OBJ)) {
    const body = m[0];
    if (!/cardSurface\(/.test(body)) continue;                 // it is a card SURFACE, not a flat panel
    if (!/boxShadow|CARD_3D/.test(body)) continue;             // and it is RAISED
    if (!/padding\s*:/.test(body) || !/borderRadius\s*:/.test(body)) continue;
    const edgeAt = body.search(/\.\.\.accentEdge\(|borderLeft\s*:/);
    const borderAt = body.search(/[,{]\s*border\s*:/);
    out.push({
      name: m[1],
      line: src.slice(0, m.index).split("\n").length,
      hasEdge: edgeAt !== -1,
      /* ⛔ THE ORDER IS LOAD-BEARING AND A DIFF CANNOT SHOW IT. `border` is the
         shorthand and React applies these in insertion order, so an edge spread
         moved ABOVE it is overwritten and every card on the screen goes flat
         again with all six checks still green. Only graded where a `border`
         shorthand is actually present. */
      orderOk: edgeAt === -1 || borderAt === -1 || borderAt < edgeAt,
    });
  }
  return out;
}

console.log("\n── 0. controls — the scan reads, fires, and knows what is not a card");
{
  const surf = 'backgroundImage: cardSurface(NAVY, 0.5), border: `1px solid ${LINE}`';
  const tail = 'borderRadius: 12, padding: 14, boxShadow: CARD_3D';
  t("★ a shared card with no edge is flagged",
    scan(`  card: { ${surf}, ${tail} },`).filter((c) => !c.hasEdge).length === 1);
  t("★ one carrying the edge is not",
    scan(`  card: { ${surf}, ...accentEdge(NAVY, 3), ${tail} },`).every((c) => c.hasEdge));
  t("★ a hand-written borderLeft counts as an edge",
    scan(`  card: { ${surf}, borderLeft: "3px solid #123", ${tail} },`).every((c) => c.hasEdge));
  t("★★ the edge ABOVE the border shorthand is caught as out of order",
    scan(`  card: { backgroundImage: cardSurface(), ...accentEdge(NAVY, 3), border: \`1px solid x\`, ${tail} },`)
      .every((c) => c.hasEdge && !c.orderOk));
  t("★ a flat-coloured modal is not a card (no cardSurface)",
    scan('  modal: { background: "#FFFFFF", borderRadius: 14, padding: 20, boxShadow: "0 16px 40px rgba(15,23,42,0.3)" },').length === 0);
  t("★ an unraised panel is not graded (no shadow)",
    scan(`  panel: { ${surf}, borderRadius: 12, padding: 14 },`).length === 0);
  t("★ a bare style bag is not a card (no padding, no radius)",
    scan('  row: { backgroundImage: cardSurface(), boxShadow: CARD_3D },').length === 0);
}

console.log("\n── 1. ★★ every shared card object carries the whole treatment");
{
  const files = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".jsx")).sort();
  /* ⚠️ A FLOOR, NEVER `> 0`. Losing most of the screens to a rename or a moved
     directory is the same silent failure as losing all of them, and this repo
     has paid for exactly that once — channelRecap went 18 call sites to 0 and
     stayed green, with nothing in the output saying it had stopped grading. */
  t(`★ the sweep really read the screens (control) — ${files.length} found`, files.length >= 40, files.length);

  let graded = 0;
  for (const f of files) {
    for (const c of scan(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"))) {
      graded += 1;
      if (!c.hasEdge) t(`★★ ${f}:${c.line} \`${c.name}\` paints a raised card surface with no accent edge`, false);
      else if (!c.orderOk) t(`★★ ${f}:${c.line} \`${c.name}\` spreads its edge ABOVE \`border\`, so the shorthand wins`, false);
    }
  }
  /* ⚠️ THE COUNT CONTROL. Eleven the day this was written. A floor rather than
     an exact number, because adding a twelfth card is ordinary work and a count
     that has to be hand-edited is a count that will accuse working code. */
  t(`★ and it really found card objects to grade (control) — ${graded}`, graded >= 9, graded);
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
