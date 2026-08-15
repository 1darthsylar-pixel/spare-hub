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

/* Ink and the quiet line, for a band of this colour. Kept here rather than in
   the component so the test can assert the pairing, which is the part that
   actually decides whether a hero is readable. */
export const heroInk = (hex) => (isLight(hex)
  ? { ink: "#141821", quiet: "rgba(20,24,33,.72)" }
  : { ink: "#ffffff", quiet: "rgba(255,255,255,.85)" });
