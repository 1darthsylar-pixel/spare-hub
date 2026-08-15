/* ============================================================================
   tokenLabel.test.mjs — does a store's own word for its rewards actually reach
   every place a person reads it?

       node tokenLabel.test.mjs

   ⚠️⚠️ THE BUG THIS EXISTS FOR SHIPPED AND NOBODY SAW IT FOR THREE DAYS.
   `tokens.label` and `tokens.labelOne` were in storeConfig from the day the
   ledger was built, read correctly at render by TokensTile, and `tokens.js`
   stated in its own header that "a clone calls them whatever they like without
   touching a line of this file".

   Two things made that false:

     · THERE WAS NO BOX TO TYPE IT IN. The setting had no Store Settings row, so
       renaming meant editing JavaScript. A setting with no screen is a constant
       with extra steps — design rule 18, and the reason the BOH board and the
       FY26 scorecard both went out wrong.
     · THE DASHBOARD TILE WAS A HARDCODED STRING, `name: "Tokens"`. So a store
       that DID rename them got its own word on every screen inside the tile and
       "Tokens" on the tile itself. One currency, two names, on the same page.

   ⚠️ AND THE FIX HAS ITS OWN TRAP, WHICH IS WHY ASSERTION 3 IS HERE. `SECTIONS`
   in App.jsx is a module-level const built at import, BEFORE a store's saved
   settings merge. So `name: tokenLabel()` looks correct, passes every check,
   and freezes the deployed default forever. It has to be `get name()`. The team
   site tile learned this first and its comment says so.

   ⇒ So the greps below grade STRUCTURE (is it a getter, is there a row, is it
   defined once), and the block at the bottom RUNS the real helpers against a
   fake saved config. A source grep cannot tell you a function returns the right
   word.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const app = read("App.jsx");
const cfgSrc = read("storeConfig.js");
const tile = read("TokensTile.jsx");
const settings = read("StoreSettings.jsx");

let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${label}`); } };
const group = (n) => console.log(`\n── ${n}`);

/* ── controls first ───────────────────────────────────────────────────────── */
/* ⚠️ A SCAN RUN FROM THE WRONG DIRECTORY REPORTS EVERYTHING CLEAN, and that has
   happened in these repos. Every file below must prove it was actually read
   before a single absence is believed. */
group("the files were actually read");
{
  t("App.jsx is the real one (control)", /const SECTIONS = \[/.test(app));
  t("storeConfig.js is the real one (control)", /export function programLabel\(\)/.test(cfgSrc));
  t("TokensTile.jsx is the real one (control)", /CATALOG_KEY/.test(tile));
  t("StoreSettings.jsx is the real one (control)", /const IDENTITY_FIELDS = \[/.test(settings));
}

/* ── 1. the setting has a screen ──────────────────────────────────────────── */
group("a store can type its own word");
{
  t("there is a row for the plural", /path:\s*"tokens\.label"/.test(settings));
  t("there is a row for the singular", /path:\s*"tokens\.labelOne"/.test(settings));
  /* ⚠️ THE NOTE IS PART OF THE FIX, NOT DECORATION. Whoever types in this box
     is an operator, and "points" is the word they will reach for first. */
  t("the screen warns against \"points\"", /tokens\.label"[\s\S]{0,400}?points/i.test(settings));
}

/* ── 2. defined once ──────────────────────────────────────────────────────── */
group("one definition, not two (design rule 8)");
{
  t("storeConfig exports tokenLabel", /export function tokenLabel\(\)/.test(cfgSrc));
  t("storeConfig exports tokenLabelOne", /export function tokenLabelOne\(\)/.test(cfgSrc));
  /* ⚠️ THE OLD LOCAL COPIES READ `storeCfg("tokens.label", ...)` DIRECTLY. If
     that call comes back in this file there are two definitions again, and the
     one that drifts is the one deciding what a currency is CALLED. */
  t("TokensTile no longer reads the key itself",
    !/storeCfg\(\s*"tokens\.label(One)?"/.test(tile));
  t("TokensTile imports the shared pair",
    /import \{[^}]*\btokenLabel\b[^}]*\btokenLabelOne\b[^}]*\} from "\.\/storeConfig\.js"/.test(tile));
  /* Still CALLED at every site. An alias that got called once and cached would
     be the module-level freeze all over again, one layer down. */
  t("the singular/plural picker still calls both", /\?\s*one\(\)\s*:\s*many\(\)/.test(tile));
}

/* ── 3. the tile name is a getter, not a frozen string ────────────────────── */
group("the dashboard tile reads it fresh");
{
  const row = app.match(/\{\s*id: "tokens",[^\n]*\}/);
  t("found the tokens tile in SECTIONS", !!row);
  /* ⚠️ THIS IS THE ASSERTION THAT CATCHES THE REGRESSION. `name: "Tokens"` and
     `name: tokenLabel()` both look fine and both freeze. Only a getter re-reads
     after a store's settings merge. */
  t("its name is a getter", !!row && /get name\(\)/.test(row[0]));
  t("and NOT a plain string", !!row && !/name:\s*"/.test(row[0]));
  t("the getter calls tokenLabel", !!row && /tokenLabel\(\)/.test(row[0]));
  t("App.jsx imports tokenLabel", /import \{[^}]*\btokenLabel\b[^}]*\} from "\.\/storeConfig\.js"/.test(app));
  /* The stored word is lowercase for sentences, so a tile title has to raise
     it. Without this the dashboard reads "stars" next to "Team Training". */
  t("the getter capitalises for the tile", !!row && /toUpperCase\(\)/.test(row[0]));
}

/* ── 4. RUN the real helpers ──────────────────────────────────────────────── */
/* ⚠️⚠️ EVERYTHING ABOVE IS A SOURCE GREP, AND A SOURCE GREP CANNOT TELL YOU A
   FUNCTION RETURNS THE RIGHT WORD. `newstore.mjs` shipped dead with twelve
   green text-based assertions beside it. So the helpers are imported and run. */
group("what the helpers actually return");
{
  const { tokenLabel, tokenLabelOne, applyStoreOverrides, STORE_CONFIG } =
    await import(`file://${path.join(DIR, "storeConfig.js")}`);

  const deployedMany = STORE_CONFIG.tokens.label;
  const deployedOne = STORE_CONFIG.tokens.labelOne;
  t(`the deployed default is readable (control: "${deployedMany}")`, !!deployedMany);
  t("with nothing saved, it returns the deployed default", tokenLabel() === deployedMany);
  t("and the singular likewise", tokenLabelOne() === deployedOne);

  /* A store saves its own words. This is the whole point of the change. */
  applyStoreOverrides({ tokens: { label: "stars", labelOne: "star" } });
  t("a saved plural wins", tokenLabel() === "stars");
  t("a saved singular wins", tokenLabelOne() === "star");

  /* ⚠️ BLANK IS NOT A WORKING STATE INSIDE A SENTENCE. "Not enough ." is worse
     than a generic word, so an emptied box falls back rather than through. */
  applyStoreOverrides({ tokens: { label: "", labelOne: "" } });
  t("an emptied plural falls back, never to empty", tokenLabel().length > 0);
  t("an emptied singular falls back, never to empty", tokenLabelOne().length > 0);

  /* Whitespace is what a person actually types when they mean blank. */
  applyStoreOverrides({ tokens: { label: "   ", labelOne: "   " } });
  t("whitespace is treated as blank, not as a word", tokenLabel().trim().length > 0);

  /* ⚠️ THE TILE READS IT ON EVERY ACCESS. If the getter were captured, this
     last flip would not show up — which is exactly the shipped bug. */
  applyStoreOverrides({ tokens: { label: "wins", labelOne: "win" } });
  t("a second change is picked up too, so nothing is cached", tokenLabel() === "wins");
  applyStoreOverrides({ tokens: { label: deployedMany, labelOne: deployedOne } });
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
