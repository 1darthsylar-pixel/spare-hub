/* ============================================================================
   tileGrid.test.mjs — every row of tiles is the same row of tiles.

       node tileGrid.test.mjs

   Matt, Aug 20 2026, off a laptop screenshot: "On the home pages the pinned
   tools are too long and don't match."

   ⚠️⚠️ THE BUG WAS `auto-fit`, AND NOTHING WAS WRONG WITH ANY ROW ON ITS OWN.
   `auto-fit` collapses the empty tracks, so a row's tile width depends on how
   many tiles that row happens to hold. Measured that day, three rows stacked on
   one screen:

     Start here   2 tools   -> 2 tracks  -> half-width tiles
     Pinned       3 tools   -> 3 tracks  -> third-width tiles
     Sections     6 tiles   -> 4 tracks  -> quarter-width tiles

   They were wrong TOGETHER. That is why it reads as "don't match" rather than
   as a bug in one place, and why a fix to one row would have moved the problem
   rather than ended it.

   ⚠️ AND THERE WERE TWO RHYTHMS TEN PIXELS APART. The section drill-down, the
   locked list and the search results were already `auto-fill, minmax(240px,
   1fr), gap 12`. The three home rows carried `auto-fit, minmax(230px, 1fr),
   gap 14` — close enough that nobody spotted it, far enough that tiles changed
   size when you drilled into a section.

   ⚠️⚠️ THIS GRADES SOURCE, NOT PIXELS, AND SAYS SO. `App.jsx` is a component
   file and nothing in `checks/` can render it. What this can prove is that
   every tile row spells the same grid, which is the whole ruling. Real widths
   are the browser harness's job (`harness/`).
   ============================================================================ */
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. controls");
t("App.jsx was read (control)", SRC.length > 200000);
/* ⚠️ A CONTROL THAT MUST BE FOUND. A scan run against the wrong file reports
   every rule satisfied, and that has happened in this repo. */
t("the pinned row is still in this file (control)", /Pinned<\/div>/.test(SRC));
t("the section landing grid is still here (control)", /marginBottom: 18 \}\}>/.test(SRC));

group("1. ★★ one rhythm, declared once");
t("★ TILE_GRID exists", /const TILE_GRID = \{/.test(SRC));
t("★★ and it is auto-FILL, never auto-fit",
  /const TILE_GRID = \{[^}]*repeat\(auto-fill, minmax\(240px, 1fr\)\)/.test(SRC));
{
  const uses = (SRC.match(/TILE_GRID/g) || []).length - 1;   // minus the declaration
  console.log(`        ${uses} tile rows use it`);
  /* ⚠️ A FLOOR, NOT `> 0`. Six rows stand today. Losing four of them to a
     hand-spelled grid is the same silent failure as losing all six, and it
     would leave this file green. */
  t(`★★ every tile row uses it — ${uses}`, uses >= 6);
}

group("2. ★★ nothing spells its own tile grid any more");
{
  /* The two rhythms that were here. Either one reappearing means somebody
     retyped a grid instead of using the constant. */
  const strays = SRC.split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /gridTemplateColumns: "repeat\(auto-(fit|fill), minmax\((230|240)px/.test(l))
    .filter(([, l]) => !/const TILE_GRID/.test(l));
  if (strays.length) console.log(`        hand-spelled: ${strays.map(([n]) => n).join(", ")}`);
  t("★★ no tile row spells its own columns", strays.length === 0);
}

group("3. ★ what this does NOT claim");
console.log("     ⚠️  It reads source, never pixels. Widths are harness/ work.");
{
  /* ⚠️ NAMED, NOT SWEPT IN. The Focus Today card row is a different component
     (`Card`, not `Tile`) and it is deliberately outside this rule — a two-card
     hero row stretching is the look, not the bug. If it is ever meant to line
     up with the tiles, that is a decision and this line is where to record it. */
  const focus = /gridTemplateColumns: "repeat\(auto-fit, minmax\(250px, 1fr\)\)/.test(SRC);
  t("the Focus Today card row is still its own thing (control)", focus);
  console.log("     ⚠️  Focus Today cards are auto-fit 250 on purpose. Not a tile row.");
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
