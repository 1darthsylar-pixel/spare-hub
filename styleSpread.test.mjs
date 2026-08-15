/* ============================================================================
   styleSpread.test.mjs — is a STRING being spread into a style object?

       node styleSpread.test.mjs

   ⚠️⚠️ THIS SHIPPED AND WAS LIVE, AT A REAL STORE, ON Aug 14 2026. Matt
   screenshotted two dead tiles at the Village: Scheduling and Tell a Leader.
   Both said "Cannot set indexed properties on this object" and both went to
   their crash boundary. Every one of the six checks passed on that code, and so
   did `vite build`.

   THE MECHANISM, BECAUSE IT IS NOT OBVIOUS:

     const CARD_3D = "-7px -7px 10px …"          // a box-shadow STRING
     style={{ ...CARD_3D, ...accentEdge(NAVY) }}  // spreading a STRING

   Spreading a string spreads its CHARACTERS. The style object becomes
   { 0:"-", 1:"7", 2:"p", … }, React tries to set a CSS property called "0", and
   the render throws. It is silent to a parser, silent to a type-free codebase,
   and invisible until somebody opens that exact tile.

   ⇒ `boxShadow: CARD_3D`. Never `...CARD_3D`.

   ═══ WHY A TEST AND NOT A COMMENT ═════════════════════════════════════════
   ⚠️ THE ORIGIN ALREADY KNEW. gate-city-hub carries this warning in THREE
   files — TrainingPriorities, Escalate, Announcements — written the last time
   it bit. The Village and Guilford still had the bug, because a comment cannot
   travel into a clone's NEW code. Knowledge in prose protects the file it sits
   in; a check protects the repo.

   ⚠️ AND IT IS THE SAME SHAPE AS `cardSurface`, which returns a gradient
   string and once took StoreSettings down the same way. Any helper that
   returns a string belongs on the left of a colon, never after three dots.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* ── which helpers return a string, measured rather than assumed ──────────── */
const style = await import(`file://${path.join(DIR, "cardStyle.js")}`);
const STRINGY = Object.keys(style).filter((k) => typeof style[k] === "string");
const FUNCY = Object.keys(style).filter((k) => typeof style[k] === "function");

group("0. the helpers were read, and they are of both kinds");
{
  /* ⚠️ CONTROLS FIRST. If the import failed both lists are empty, every scan
     below finds nothing, and the run reads as a clean bill of health. */
  t(`cardStyle exports string helpers (${STRINGY.length}: ${STRINGY.join(", ") || "NONE"})`, STRINGY.length > 0);
  /* ⚠️ THE FIRST VERSION LOOKED FOR PLAIN OBJECT EXPORTS AND FOUND NONE, so it
     failed a module that is correctly built. `cardStyle` exports strings and
     FUNCTIONS — `accentEdge` is a function that RETURNS an object, which is why
     `...accentEdge(NAVY)` is the safe form sitting right next to the unsafe
     one on the same line. That contrast is the whole trap. */
  t(`and function helpers (${FUNCY.length}: ${FUNCY.join(", ") || "NONE"})`, FUNCY.length > 0);
  t("accentEdge returns an OBJECT, so spreading it is correct",
    typeof style.accentEdge === "function" && typeof style.accentEdge("#000", 3) === "object");
  /* The two that have actually caused an outage, named so a rename cannot
     quietly drop them out of the scan. */
  t("CARD_3D is a string (the Aug 14 crash)", typeof style.CARD_3D === "string");
  t("cardSurface returns a string (the StoreSettings crash)",
    typeof style.cardSurface === "function" && typeof style.cardSurface("#000", 1) === "string");
}

/* ── every component file, comments stripped ─────────────────────────────── */
const files = fs.readdirSync(DIR)
  .filter((f) => /\.jsx$/.test(f))
  .map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")]);

/* ⚠️ COMMENTS ARE STRIPPED, and this file is proof of why: three files in this
   repo DOCUMENT the bug by writing `...CARD_3D` inside a warning. Grading the
   raw text would fail the very files that got it right. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/[ \t]*\/\/.*$/gm, " ");

group("1. no string helper is spread into a style object");
{
  t(`component files were read (${files.length})`, files.length > 20);

  const hits = [];
  for (const [name, raw] of files) {
    const src = strip(raw);
    for (const helper of STRINGY) {
      /* `...CARD_3D` — three dots then the name, word-boundaried so CARD_3D_X
         is not swept up. */
      const re = new RegExp("\\.\\.\\.\\s*" + helper + "\\b", "g");
      for (const m of src.matchAll(re)) {
        hits.push(`${name}: ...${helper}`);
      }
    }
    /* A call whose RESULT is a string, spread. `...cardSurface(NAVY, 1.1)` is
       the shape that took StoreSettings down. */
    for (const m of src.matchAll(/\.\.\.\s*cardSurface\s*\(/g)) {
      hits.push(`${name}: ...cardSurface(…)`);
    }
    /* ⚠️⚠️ AND THE BARE FUNCTION, WHICH IS THE QUIET ONE. Found live in
       Escalate.jsx and Announcements.jsx on Aug 14 2026, both reading
       `const box = { ...cardSurface, boxShadow: CARD_3D, … }`.

       Spreading a FUNCTION does not throw and does not warn. Functions carry no
       own enumerable keys, so `{ ...cardSurface }` is simply `{}` — the card
       renders, looks like a card, and silently never gets the gradient face the
       line was written to add. Both files had been that way since they were
       written, under a comment warning about the OTHER spelling of this bug.

       ⇒ A string spread is an outage and gets found in an hour. A function
       spread is a feature that was never on, and nothing finds it at all.
       ⚠️ `(?!\s*\()` IS THE WHOLE TEST: `...accentEdge(NAVY)` and
       `...toolCard(TONE)` are the CORRECT form and must not be flagged. Only a
       bare reference with no call after it is wrong. */
    for (const helper of FUNCY) {
      const re = new RegExp("\\.\\.\\.\\s*" + helper + "\\b(?!\\s*\\()", "g");
      for (const m of src.matchAll(re)) {
        hits.push(`${name}: ...${helper} (a bare function — spreads to nothing)`);
      }
    }
  }
  for (const h of hits) console.log(`        ${h}`);
  t(`nothing string-valued is spread${hits.length ? ` — ${hits.length} found` : ""}`, hits.length === 0);
}

group("1b. the bare-function scan really fires, and really spares the safe form");
{
  /* ⚠️ WITHOUT THESE TWO THE SCAN ABOVE COULD BE MATCHING NOTHING AT ALL and
     section 1 would still be green. One string that MUST be caught, one that
     MUST NOT. */
  const fires = (text) => FUNCY.some((h) =>
    new RegExp("\\.\\.\\.\\s*" + h + "\\b(?!\\s*\\()", "g").test(text));
  t("★ a bare `...cardSurface` is caught", fires("const box = { ...cardSurface, padding: 4 };"));
  t("★ a called `...cardSurface(NAVY, 1)` is NOT caught by this scan",
    !fires("const box = { ...cardSurface(NAVY, 1) };"));
  t("★ `...accentEdge(NAVY)` stays safe", !fires("style={{ ...accentEdge(NAVY) }}"));
  t("★ `...toolCard(TONE)` stays safe", !fires("style={{ ...toolCard(TONE) }}"));
  t("a bare `...accentEdge` is caught too", fires("style={{ ...accentEdge }}"));
}

group("2. and the safe form is actually in use, so this is not vacuous");
{
  /* ⚠️ WITHOUT THIS, A REPO THAT STOPPED USING CARD_3D ENTIRELY WOULD PASS
     SECTION 1 PERFECTLY. "Nobody spreads it" and "nobody uses it" look the
     same to a grep, and only one of them is a working card. */
  const usedProperly = files.filter(([, raw]) => /boxShadow:\s*CARD_3D/.test(strip(raw))).length;
  t(`CARD_3D is used the correct way somewhere (${usedProperly} file(s))`, usedProperly > 0);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
