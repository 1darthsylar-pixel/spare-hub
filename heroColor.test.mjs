/* ============================================================================
   heroColor.test.mjs — does a tool's hero hold its colour, and can it be read?

       node heroColor.test.mjs

   ⚠️ IT IMPORTS AND EXECUTES `heroColor.js`. That is the point. This repo has
   shipped a script that was DEAD while every text-based test of it passed
   (`newstore.mjs`, Aug 13 2026), and the rule written down afterwards is "if a
   tool matters, write a test that RUNS it". Both questions below are ones a grep
   answers confidently and wrongly:

     1. does the derived second gradient stop hold the HUE, or grey it out?
     2. is the text on the band actually readable at that colour?

   ⚠️ QUESTION 2 IS NOT COSMETIC. Five of the tile colours in App.jsx are light
   greys. White-on-#B6BCC6 is roughly 1.6:1 contrast, which is not "a bit faint",
   it is a band a person cannot read at arm's length on a shared iPad.

   ═══ AND A RATCHET ════════════════════════════════════════════════════════
   The last section counts hand-rolled hero gradients. It is allowed to FALL and
   never to rise. Without it the thirty-six drift back one tool at a time, which
   is exactly how they got to thirty-six in the first place — nobody typed them
   all at once, each one looked like a reasonable local choice.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rgb, hex6, isLight, lift, heroInk, HERO_STEP, relLum } from "./heroColor.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. the module was imported and it really runs (controls)");
{
  /* ⚠️ CONTROLS THAT MUST BE FOUND. If the import silently produced undefined
     helpers, every assertion below would compare undefined to undefined and the
     run would read as a clean bill of health. */
  t("lift is a function", typeof lift === "function");
  t("isLight is a function", typeof isLight === "function");
  t("heroInk is a function", typeof heroInk === "function");
  t(`HERO_STEP is a number (${HERO_STEP})`, typeof HERO_STEP === "number" && HERO_STEP > 0);
  t("rgb parses a known colour", JSON.stringify(rgb("#1A2238")) === JSON.stringify([26, 34, 56]));
  t("hex6 round-trips it", hex6([26, 34, 56]).toLowerCase() === "#1a2238");
}

group("1. the Tokens hero Matt named still looks like itself");
{
  /* The band he pointed at was typed as #1A2238 → #26304A. The shared component
     derives its second stop, so the derived one has to land on the same colour
     or adopting it changed the one screen he said he liked. */
  const got = lift("#1A2238");
  const want = [0x26, 0x30, 0x4a];
  const c = rgb(got);
  const drift = c ? c.map((v, i) => Math.abs(v - want[i])) : null;
  console.log(`        typed #26304A, derived ${got.toUpperCase()}, per-channel drift ${drift?.join("/")}`);
  t("the derived second stop parses", c !== null);
  t(`every channel is within 5 of the typed colour (${drift?.join("/")})`,
    !!drift && drift.every((d) => d <= 5));
}

group("2. the second stop HOLDS THE HUE — the bug the first version had");
{
  /* ⚠️ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT IT. The first `lift` scaled
     22% toward white, which turned navy #1A2238 into the grey #484B52 and gold
     #8A6A1F into the mud #A48B50. Both are "a lighter version" by any naive
     test and both destroy the thing the hero is for: a tool's band matching its
     tile on the dashboard.
     Saturation here is max-channel minus min-channel — crude, and enough. A
     wash toward white collapses that spread; an additive step preserves it. */
  const spread = (hex) => { const c = rgb(hex); return Math.max(...c) - Math.min(...c); };
  for (const base of ["#1A2238", "#8A6A1F", "#0F766E", "#B45309", "#7E22CE", "#8C2F39"]) {
    const out = lift(base);
    t(`${base} → ${out.toUpperCase()} keeps its colour spread (${spread(base)} → ${spread(out)})`,
      spread(out) === spread(base));
  }
  /* And the channel that was highest must still be the highest. A hue flip would
     pass the spread test and still ship a teal tile with a purple band. */
  const rank = (hex) => rgb(hex).map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]).join("");
  for (const base of ["#0F766E", "#B45309", "#7E22CE"]) {
    t(`${base} keeps its channel order`, rank(lift(base)) === rank(base));
  }
}

group("3. a light band gets DARK text, and the contrast is real");
{
  /* ⚠️ MEASURED WITH THE WCAG RATIO, NOT EYEBALLED. "It looks fine on my screen"
     is how the five grey tiles would have shipped with white text on them. */
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = (hex) => { const c = rgb(hex); return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); };
  const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const DARK = ["#1A2238", "#8A6A1F", "#0F766E", "#B45309", "#7E22CE", "#8C2F39", "#2F5D50", "#0E7490", "#13293F"];
  /* ⚠️ #8A93A0 IS IN THIS LIST BECAUSE IT IS WHY THE THRESHOLD WAS REWRITTEN.
     The first `isLight` weighted raw 0–255 channels and scored it 146 against a
     cut of 150, so it got white text at 3.11:1. Its true relative luminance is
     0.288 and dark ink gives 5.72:1. Leave it here: it is the case that proves
     a raw-channel average is not luminance. */
  const LIGHT = ["#B6BCC6", "#A3ABB6", "#9CA3AF", "#9AA3AE", "#8A93A0"];

  for (const c of DARK) t(`${c} is treated as a dark band`, isLight(c) === false);
  for (const c of LIGHT) t(`${c} is treated as a light band`, isLight(c) === true);

  /* ⚠️ TWO BARS, BECAUSE THE BAND IS A GRADIENT AND THE TEXT DOES NOT SIT ON ALL
     OF IT. The gradient runs 120deg, so 0% — the base colour — is the top-left
     corner, and the label, the figure and the note are all left-aligned in that
     corner. That is the colour the small text actually sits on, so it carries
     the 4.5:1 body bar.
     The LIFTED end is the far corner. Only the 40px/800 figure can reach it, and
     WCAG's bar for large text is 3:1. Asserting 4.5 there would be inventing a
     requirement; asserting nothing would be how an unreadable band ships. */
  let worstBase = { hex: null, r: 99 }, worstLift = { hex: null, r: 99 };
  for (const c of [...DARK, ...LIGHT]) {
    const ink = heroInk(c).ink;
    const b = ratio(c, ink);
    const l = ratio(lift(c), ink);
    if (b < worstBase.r) worstBase = { hex: c, r: b };
    if (l < worstLift.r) worstLift = { hex: lift(c), r: l };
  }
  console.log(`        worst at the base colour  : ${worstBase.hex} at ${worstBase.r.toFixed(2)}:1  (bar 4.5)`);
  console.log(`        worst at the lifted end   : ${worstLift.hex} at ${worstLift.r.toFixed(2)}:1  (bar 3.0)`);
  t(`every base colour clears 4.5:1 against its own ink (worst ${worstBase.r.toFixed(2)}:1)`, worstBase.r >= 4.5);
  t(`every lifted end clears 3:1 for the big figure (worst ${worstLift.r.toFixed(2)}:1)`, worstLift.r >= 3);

  /* ⚠️ AND THE CROSSOVER IS PRINTED, because `isLight` hard-codes it. If the ink
     ever changes, this line is how the next person notices the constant is now
     wrong instead of trusting it. */
  const inkL = L("#141821");
  console.log(`        white and #141821 tie at relLum ${(Math.sqrt(1.05 * (inkL + 0.05)) - 0.05).toFixed(4)}`);
  t("the tie point is what isLight actually switches on",
    isLight(hex6([128, 128, 128])) === (relLum("#808080") > (Math.sqrt(1.05 * (inkL + 0.05)) - 0.05)));

  /* ⚠️ AND THE NAIVE VERSION MUST FAIL, or the test above proves nothing. If
     white were used everywhere, the pale greys would be unreadable — this asserts
     that is genuinely true rather than a worry nobody checked. */
  const whiteOnPalest = ratio("#B6BCC6", "#ffffff");
  t(`white-on-#B6BCC6 really would have been unreadable (${whiteOnPalest.toFixed(2)}:1)`,
    whiteOnPalest < 2);
}

group("4. junk in does not put junk on a screen");
{
  t("undefined falls back to the Tokens second stop", lift(undefined) === "#26304A");
  t("a non-colour falls back too", lift("rebeccapurple") === "#26304A");
  t("and it is never treated as light", isLight(undefined) === false);
  /* Clamping: a colour already near white must not wrap around to black. */
  t("#FFFFFF darkens rather than overflowing", lift("#FFFFFF") === "#f1f1f1");
  t("#000000 lifts rather than underflowing", lift("#000000") === "#0e0e0e");
}

group("5. RATCHET — hand-rolled hero gradients may fall, never rise");
{
  /* ⚠️ THE NUMBER BELOW IS A HIGH-WATER MARK, NOT A TARGET. Lower it when tools
     move onto ToolHero. Never raise it: raising it is the drift itself, one
     reasonable-looking local choice at a time, which is how thirty-six of these
     appeared without anybody deciding to write thirty-six. */
  /* Measured Aug 14 2026, after Tokens moved onto the shared component: 35.
     It was 36 before that. Lower this every time a tool converts. */
  const CEILING = 35;

  const files = fs.readdirSync(DIR).filter((f) => /\.jsx$/.test(f) && f !== "ToolHero.jsx");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/[ \t]*\/\/.*$/gm, " ");
  const rolled = files.filter((f) =>
    /linear-gradient\(\s*1[0-9]{2}deg/.test(strip(fs.readFileSync(path.join(DIR, f), "utf8"))));

  t(`component files were read (${files.length}) (control)`, files.length > 20);
  console.log(`        ${rolled.length} file(s) still hand-roll a hero gradient, ceiling ${CEILING}`);
  t(`hand-rolled heroes ${rolled.length} <= ceiling ${CEILING}`, rolled.length <= CEILING);
  if (rolled.length < CEILING) {
    console.log(`        ⇒ it has fallen below the ceiling. Lower CEILING to ${rolled.length} in this file.`);
  }

  /* ⚠️ AND THE SHARED ONE MUST ACTUALLY BE IN USE. "Nobody hand-rolls a hero"
     and "nobody has a hero" look identical to a count, and only one of them is
     the thing that was asked for. */
  const adopters = files.filter((f) =>
    /^import ToolHero from "\.\/ToolHero\.jsx";$/m.test(fs.readFileSync(path.join(DIR, f), "utf8")));
  console.log(`        adopted by: ${adopters.join(", ") || "NOBODY"}`);
  t(`ToolHero is imported by statement somewhere (${adopters.length})`, adopters.length > 0);
}


/* ── the SHEET gradient, which is not the hero's ─────────────────────────────
   ⛔⛔ IT SHIPPED INVISIBLE. `sheetGradient` reused `HERO_STEP`, which is 14
   because it reproduces a hero Matt already approved across a band a couple of
   hundred pixels tall. On a sheet that runs the whole page, +14 per channel is
   about 5% lighter over a thousand pixels — below what an eye picks up.

   ⇒ Measured by the owner, Aug 19 2026: "I still don't see the gradient." It
   was rendering the entire time. It was just imperceptible, which is the same
   as absent and harder to notice because nothing is broken.

   ⚠️ THE HERO'S OWN STEP IS ASSERTED UNCHANGED. Fixing one page by relighting
   every hero in the app is the trade that must not be made quietly. */
{
  group("the sheet gradient is a sheet, not a band");
  const { SHEET_STEP, SHEET_SPAN, HERO_STEP, sheetGradient, lift } = await import("./heroColor.js");

  t("★★ THE HERO STEP IS STILL 14, so every approved hero is untouched", HERO_STEP === 14);
  t("★★ AND THE SHEET STEP IS BIGGER, because it covers a page rather than a band",
    typeof SHEET_STEP === "number" && SHEET_STEP > HERO_STEP);

  /* ⚠️ A THRESHOLD, NOT AN EXACT VALUE. The number can be tuned; what must not
     come back is a step so small the gradient reads as a flat fill. 24 is the
     floor below which it stopped being visible on a real screen. */
  t(`★★★ THE SHEET STEP CLEARS THE VISIBILITY FLOOR — ${SHEET_STEP}`, SHEET_STEP >= 24);

  const g = sheetGradient("#1D3557");
  const stops = g.match(/#[0-9a-f]{6}/gi) || [];
  t("★ it still produces two stops (control)", stops.length === 2, stops.join(" "));
  t("★★ AND THE TWO STOPS ARE NOT THE SAME COLOUR", stops[0] !== stops[1]);

  /* ⛔⛔⛔ THE ASSERTION THAT ANSWERS HIM THE SECOND TIME.
     The step went 14 -> 34 and he STILL could not see it, because the ramp ran
     `0%` to `100%` OF THE ELEMENT and the element is a page that scrolls for
     thousands of pixels. A percentage ramp spreads the whole colour change over
     the full height, so one screenful shows a sliver of it — and every section
     added to the Report Card stretched it further and made it fainter.

     ⇒ A PERCENTAGE STOP ON A PAGE-HEIGHT ELEMENT IS THE BUG, NOT THE NUMBER.
     Absolute units finish the ramp at a fixed distance, so it completes inside
     the first screen on every device and a longer page cannot dilute it. */
  t("★★★ THE RAMP IS IN ABSOLUTE UNITS, NEVER PERCENTAGES. A page-height element stretches a percentage ramp until it disappears.",
    !/\d+%/.test(g), g);
  t(`★★★ AND IT FINISHES INSIDE ONE SCREEN — ${SHEET_SPAN}px`,
    typeof SHEET_SPAN === "number" && SHEET_SPAN > 0 && SHEET_SPAN <= 900, String(SHEET_SPAN));
  t("★★ the span is actually in the gradient it builds (control)",
    g.includes(`${SHEET_SPAN}px`), g);

  const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = chan(stops[0]), b = chan(stops[1]);

  /* ⚠️ LIT FIRST, SETTLING INTO THE BASE. Light falls from above, so the sheet
     is lighter where it starts. Same direction BusinessScorecard's header
     already uses — the one gradient in this app nobody has said they cannot
     see. */
  t(`★★★ THE LIT STOP COMES FIRST, so the sheet reads as lit from above — ${stops[0]} then ${stops[1]}`,
    a.every((v, i) => v > b[i]));
  t(`★★ AND THE TWO ARE GENUINELY FAR APART — ${a[0] - b[0]} per channel`,
    a.every((v, i) => v - b[i] >= 24));

  /* ⚠️ THE HUE HAS TO SURVIVE. A flat additive step moves every channel the
     same distance by construction; scaling toward white would desaturate and
     turn this navy grey, which is the mistake `lift`'s own header records. */
  t("★★ EVERY CHANNEL MOVES THE SAME DISTANCE, so the hue holds",
    new Set(a.map((v, i) => v - b[i])).size === 1);

  t("★ and the hero's own lift is byte-for-byte what it always was",
    lift("#1D3557") === "#2b4365", lift("#1D3557"));
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
