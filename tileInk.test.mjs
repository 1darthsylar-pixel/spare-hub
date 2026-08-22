/* ═══════════════════════════════════════════════════════════════════════════
   A TILE WHOSE COLOUR IS THE TEXT COLOUR HAS NO COLOUR

   Matt, Aug 22 2026, off a Village screenshot where the Business Scorecard sat
   between a red Financials and a teal Food Safety with a black ring:
   *"Make sure business scorecard is the correct color."*

   ⭐ MEASURED, NOT EYEBALLED. `INK` is `#13293F`, the app's body-text colour,
   and the three clones registered the `scorecard` tile with **exactly that
   hex**. The spare registers `foodquality` with it too. So those tiles are not
   "a dark blue somebody chose" — they are the text colour, and a tile painted
   in the text colour reads as black beside every neighbour.

   ⚠️ AND IT IS NOT ONE RING. A tile's registered colour is its identity: the
   ring, the hero band the tile opens onto, the icon wash, and since Aug 22 the
   line of wording on the right that says what the tool needs today. All four go
   black together.

   ⛔⛔ IT GRADES AN EXACT MATCH AND NOTHING ELSE, AND THAT IS A CORRECTION.
   My first version also carried a luminance floor for "too close to the ink",
   and it immediately accused `spare-hub`'s `foodquality` tile — `#2B2720`, a
   deliberate warm near-black **39 apart from the ink in RGB**, flagged only
   because contrast ratio reads LIGHTNESS and two different hues can share it.
   ⇒ The assertion's name said "distinguishable" and the maths said "the same
   brightness", which are not the same claim. A warning that is usually wrong is
   the one that gets tapped through, and this file guards the tile ring, the
   hero band and the wording line all at once — it must never cry wolf.
   ⇒ The measured fault is an EXACT match, it needs no invented threshold, and
   it cannot fire on a colour somebody chose.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  FAILED: ${label}${extra ? "  (" + extra + ")" : ""}`); }
};

const APP = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

/* How far apart two colours are in plain RGB. Reported, never graded — it is
   here so a failure can say HOW wrong rather than only that it is wrong. */
const rgbApart = (a, b) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const x = p(a), y = p(b);
  return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]));
};

const ink = (APP.match(/const INK = "(#[0-9A-Fa-f]{6})"/) || [])[1];
const tiles = [];
const re = /\{ id: "([a-z0-9]+)", color: "(#[0-9A-Fa-f]{6})"/g;
let m;
while ((m = re.exec(APP))) tiles.push({ id: m[1], color: m[2] });

// ── controls ────────────────────────────────────────────────────────────────
ok("★ control — App.jsx was read", APP.length > 100000);
ok("★ control — the ink colour was found", /^#[0-9A-Fa-f]{6}$/.test(ink || ""), String(ink));
/* ⚠️ A FLOOR, NOT `> 0`. A regex that stops matching finds zero tiles and this
   whole file then reports a clean run over a scan that read nothing — the
   `channelRecap` failure, which printed `ok` after losing all 21 call sites. */
ok("★ control — the tile list really was read", tiles.length >= 10, `${tiles.length} tiles`);
ok("★ control — the maths agrees with itself", rgbApart(ink, ink) === 0);
ok("★ control — and it can tell two real colours apart", rgbApart("#FFFFFF", ink) > 100);

// ── the rule ────────────────────────────────────────────────────────────────
const onInk = tiles.filter((t) => t.color.toUpperCase() === String(ink).toUpperCase());
ok("★★ no tile is registered with the app's INK colour",
  onInk.length === 0,
  onInk.length ? onInk.map((t) => `${t.id} = ${t.color}, ${rgbApart(t.color, ink)} apart`).join("; ") : "");

/* ⚠️ TWO TILES SHARING A COLOUR IS NOT GRADED HERE AND THAT IS DELIBERATE.
   Sections repeat hues on purpose, and a rule against it would fire forever on
   something working as designed. The question this file asks is narrower: does
   this tile have a colour AT ALL, or is it painting itself in the text. */
ok("★ every tile carries a colour", tiles.every((t) => /^#[0-9A-Fa-f]{6}$/.test(t.color)));

console.log(`tileInk: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
