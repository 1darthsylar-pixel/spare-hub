/* ============================================================================
   heroColor.js — the colour maths behind ToolHero. A LEAF: it imports nothing.

   ⚠️ IT LIVES OUT HERE SO A TEST CAN RUN IT. Inside ToolHero.jsx it would be
   inside a `.jsx` file, and this repo has been caught before by checks that read
   a file as TEXT and pronounced it working while it was broken. The rule written
   in CLAUDE.md after `newstore.mjs` shipped dead is "if a tool matters, write a
   test that RUNS it", and the two questions here — does the second gradient stop
   hold the hue, and is the text readable on the band — are exactly the kind a
   grep answers confidently and wrongly.

   ⚠️ AND IT IS A LEAF ON PURPOSE. `cardStyle.js` is already the dependency-free
   style leaf; adding an import here would put a cycle one step away from a file
   that App.jsx and every tool pulls in, and that failure shows up as "Cannot
   access 'X' before initialization" and a blank page.
   ============================================================================ */

export const rgb = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const hex6 = (arr) => "#" + arr
  .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
  .join("");

/* sRGB RELATIVE LUMINANCE, the real one, gamma-corrected.

   ⚠️⚠️ THE FIRST VERSION WEIGHTED THE RAW 0–255 CHANNELS AND CUT AT 150, AND IT
   WAS WRONG BY A WHOLE TILE. #8A93A0 scored 146 on that scale, so it was called
   dark and got white text — 3.11:1, under the 4.5:1 readable bar. Its true
   relative luminance is 0.288, comfortably light, and dark ink on it measures
   5.72:1. A raw-channel average is not luminance; sRGB is gamma-encoded, so the
   midtones sit nowhere near where the byte value suggests. Caught by
   `heroColor.test.mjs` before it reached a screen. */
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

export const relLum = (hex) => {
  const c = rgb(hex);
  if (!c) return 0;
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
};

/* ⚠️ 0.1991 IS COMPUTED, NOT PICKED. It is the exact luminance where white text
   and the Hub's #141821 ink give the SAME contrast ratio — solve
   1.05/(L+0.05) = (L+0.05)/(L_ink+0.05) and that is what falls out. Above it,
   dark ink reads better; below it, white does. So "is this light" is not a taste
   call with a round number in it, it is the crossover.
   ⇒ If the ink ever changes, recompute this. The test prints the crossover. */
const INK_CROSSOVER = 0.1991;

export const isLight = (hex) => rgb(hex) !== null && relLum(hex) > INK_CROSSOVER;

/* ⚠️ THE STEP IS +14 PER CHANNEL AND THAT NUMBER WAS MEASURED, NOT CHOSEN.
   The Tokens hero Matt pointed at runs #1A2238 → #26304A, which is +12 red,
   +14 green, +18 blue. A flat +14 reproduces it to within four points on one
   channel, so adopting the shared component leaves the one screen he said he
   likes looking the same.

   ⚠️⚠️ THE FIRST VERSION SCALED 22% TOWARD WHITE AND THAT WAS WRONG. Scaling
   toward white DESATURATES: it turned the Tokens navy into #484B52, a grey, and
   the gold #8A6A1F into #A48B50, a mud. Deriving the second stop is only safe if
   it holds the hue, because the entire point is that a tool's hero and its tile
   on the dashboard are recognisably the same colour. A flat additive step moves
   every channel the same distance, so the hue survives by construction. */
export const HERO_STEP = 14;

export const lift = (hex) => {
  const c = rgb(hex);
  if (!c) return "#26304A";                    // the Tokens hero's own second stop
  const dir = isLight(hex) ? -HERO_STEP : HERO_STEP;
  return hex6(c.map((v) => v + dir));
};

/* ★★ THE SAME GRADIENT, FOR A WHOLE PAGE RATHER THAN A BAND. Matt, Aug 19
   2026, on the Report Card's dark sheet: "I like the dark but we need it a
   little lighter. Add the gradient look as well."

   ⚠️⚠️ IT LIVES HERE, NEXT TO `lift`, FOR TWO REASONS. One is rule 8: the hero
   builds its band from exactly this pair and a second copy would drift, so a
   page that wants to continue the hero must ask the same function. The other is
   that `heroColor.test.mjs` ratchets JSX files containing a literal
   `linear-gradient(1NNdeg` — the guard against tiles hand-rolling their own
   hero instead of using ToolHero. A page background is not a hero, but a grep
   cannot tell, and dodging that check by picking an angle it does not match
   would be gaming it. Calling a shared helper is the honest way past it.

   ⚠️ 120deg IS THE HERO'S OWN ANGLE, so the sheet runs the same direction as
   the band sitting on top of it and the two read as one field rather than two
   panels that happen to be the same colour. */
export const SHEET_ANGLE = 120;

/* ⛔⛔ A SHEET NEEDS A BIGGER STEP THAN A BAND, AND THE FIRST VERSION DID NOT
   HAVE ONE. `HERO_STEP` is 14 because it reproduces a hero Matt already said he
   likes, across a band a couple of hundred pixels tall. Reused unchanged on a
   sheet that runs the whole page, +14 on each channel is about 5% lighter over
   a thousand pixels, which is below what an eye picks up.

   ⇒ Measured against his own words, Aug 19 2026: "I still don't see the
   gradient." He was right — it was rendering, it was just invisible.

   ⚠️ `HERO_STEP` IS DELIBERATELY NOT TOUCHED. Raising it would relight every
   hero in the app to fix one page, and the heroes are the thing he already
   approved. A sheet is a different surface with a different span, so it gets
   its own number rather than borrowing one that was tuned for something else.

   ⚠️ IT IS STILL A FLAT ADDITIVE STEP, for the same reason `lift` is: scaling
   toward white desaturates and turns a navy grey. Moving every channel the same
   distance holds the hue by construction. */
export const SHEET_STEP = 46;

const liftBy = (hex, step) => {
  const c = rgb(hex);
  if (!c) return "#26304A";
  const dir = isLight(hex) ? -step : step;
  return hex6(c.map((v) => v + dir));
};

/* ⛔⛔⛔ THE STEP WAS NEVER THE WHOLE PROBLEM. THE SPAN WAS.
   Matt, twice: "I still don't see the gradient", then "the gradient ... is still
   not enough of a visible difference." The first time the step went 14 -> 34 and
   he still could not see it, which means the number was not the thing.

   ⇒ WHY. The ramp ran `0%` to `100%` OF THE ELEMENT, and the element is the
   whole Report Card sheet, which scrolls for thousands of pixels. A percentage
   ramp spreads the entire colour change across the full height, so any single
   SCREENFUL only ever shows a sliver of it. On a page 3000px tall, one 800px
   screen shows about a quarter of a 34-step change — roughly 8 points per
   channel, which is under the floor at these luminances.

   ⚠️⚠️ AND IT GOT WORSE AS THE PAGE GREW. Every section added to the Report
   Card stretched the same ramp further and made the gradient fainter. A
   percentage ramp on a page-height element is self-defeating by construction.

   ⇒ THE FIX IS ABSOLUTE UNITS. The ramp now finishes at a FIXED distance, so it
   completes inside the first screen on every device and the rest of the page
   holds the base colour. A longer page no longer dilutes it. This is the part
   that actually answers him; the step going 34 -> 46 is the smaller half.

   ⚠️ IT ALSO RUNS THE OTHER WAY NOW: lit at the top, settling into the base.
   Light falls from above, so a sheet that is lighter where it starts reads as
   lit rather than as a colour error. It is the same direction `BusinessScorecard`
   already uses on its header, which is the one gradient in this app nobody has
   ever complained about not seeing.

   ⚠️ DO NOT PUT A PERCENTAGE BACK. `heroColor.test.mjs` fails if either stop is
   expressed as a percentage, because that is the bug, not the number. */
export const SHEET_SPAN = 620;

export const sheetGradient = (hex) =>
  `linear-gradient(${SHEET_ANGLE}deg, ${liftBy(hex, SHEET_STEP)} 0px, ${hex} ${SHEET_SPAN}px)`;

/* Ink and the quiet line, for a band of this colour. Kept here rather than in
   the component so the test can assert the pairing, which is the part that
   actually decides whether a hero is readable. */
export const heroInk = (hex) => (isLight(hex)
  ? { ink: "#141821", quiet: "rgba(20,24,33,.72)" }
  : { ink: "#ffffff", quiet: "rgba(255,255,255,.85)" });
