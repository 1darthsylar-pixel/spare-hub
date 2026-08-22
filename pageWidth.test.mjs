#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   pageWidth.test.mjs — DO THE HEADER AND THE PAGE STILL AGREE HOW WIDE THEY ARE?

   ⭐ Matt, Aug 19 2026, off a laptop screenshot: "I would like the side by side
   if possible for the more compact look."

   The page was capped at 860. The tile grids are `auto-fill minmax(240px, 1fr)`
   with a 12px gap, so 860 fits exactly THREE columns and the rest of a laptop
   screen was white.

   ⚠️⚠️ THE FAILURE THIS GUARDS IS NOT THE NUMBER, IT IS THE PAIR. The header and
   the page body are two separate `maxWidth` declarations wrapping two separate
   blocks. If they drift, the store name stops lining up with the content under
   it — a misalignment that looks like a rendering bug and shows in no diff.
   That is why it is one named constant rather than a number typed twice, and
   why this file exists.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
const fails = [];
const ok = (what, cond, extra) => { if (cond) pass++; else fails.push(what + (extra ? `  — ${extra}` : "")); };

const SRC = readFileSync(path.join(DIR, "App.jsx"), "utf8");
ok("App.jsx was read (control)", SRC.length > 200000, String(SRC.length));

/* ── 1. one constant, used everywhere the page is capped ─────────────────── */
const m = SRC.match(/^const PAGE_MAX = (\d+);$/m);
ok("★★ THE PAGE WIDTH IS A NAMED CONSTANT", !!m, m ? m[1] : "not found");

const hard = (SRC.match(/maxWidth: 860\b/g) || []).length;
ok("★★★ NO BLOCK STILL HARDCODES THE OLD 860. Two numbers that must match are two numbers that can drift.",
  hard === 0, `found ${hard}`);

const uses = (SRC.match(/maxWidth: PAGE_MAX\b/g) || []).length;
ok(`★★★ BOTH THE HEADER AND THE PAGE BODY USE IT — found ${uses}`, uses === 2, String(uses));

/* ── 2. the width actually buys a column ─────────────────────────────────── */
if (m) {
  const cap = Number(m[1]);
  /* The tile grid's own numbers, read from the file rather than assumed. */
  const grid = SRC.match(/repeat\(auto-fill, minmax\((\d+)px, 1fr\)\)", gap: (\d+)/);
  ok("★ the tile grid's own minmax and gap were found (control)", !!grid, grid ? grid.slice(1).join("/") : "no match");
  if (grid) {
    const min = Number(grid[1]), gap = Number(grid[2]);
    const cols = (w) => Math.max(1, Math.floor(((w - 28) + gap) / (min + gap)));
    ok(`★★★ THE CAP FITS AT LEAST FOUR TILES ACROSS — ${cap}px gives ${cols(cap)}`,
      cols(cap) >= 4, `${cols(cap)} columns`);
    ok(`★★ AND THE OLD 860 ONLY GAVE ${cols(860)} (control on the arithmetic)`, cols(860) === 3);
  }

  /* ⚠️ A CAP, NOT A WIDTH. Too wide and running text stops being readable, and
     this wrapper holds prose as well as tiles. */
  ok("★★ IT IS STILL CAPPED, not stretched to the window", cap > 0 && cap <= 1400, String(cap));
}

/* ── 3. the grid itself is untouched ─────────────────────────────────────── */
ok("★★★ THE TILE GRID STILL AUTO-FILLS, so a narrow window collapses exactly as before. Only the room it is given changed.",
  /gridTemplateColumns: "repeat\(auto-fill, minmax\(240px, 1fr\)\)"/.test(SRC));

/* ⛔ THE SUMMARY GOES LAST. Anything below it runs, passes, and can never fail
   the build. Four files in this repo have already been caught doing that. */
if (fails.length) {
  console.log(`pageWidth: ${pass} passed, ${fails.length} FAILED`);
  fails.forEach((f) => console.log("  FAIL  " + f));
  process.exit(1);
}
console.log(`pageWidth: ${pass} passed`);
