/* ============================================================================
   signInNoTool.test.mjs — you can sign in without opening a tool.

       node signInNoTool.test.mjs

   Matt, twice on Aug 21 2026: "I still want to log in without going into a
   tool."

   ⛔ `openTool` WAS THE ONLY DOOR TO THE PIN CARD, and it takes a tool. So
   signing in meant tapping something you may not want, being refused, typing
   your PIN, landing INSIDE that tool, and backing out to reach the dashboard.
   The signed-out header carried no control at all, because every control on it
   sits behind `signedIn`.

   ⚠️⚠️ THE ASSERTION THAT MATTERS MOST IS THE onlyFor ONE. `canUseTool`
   short-circuits on `onlyFor(person)` and answers `only.has(tool.id)` — so for
   anybody with a narrowed Hub an unregistered id answers FALSE, and the person
   most likely to be confused by the old flow could not sign in at all. Signing
   in is not a tool grant; it is what happens BEFORE one. Routing the sentinel
   through that gate is the one change here that would look like a tidy-up and
   would lock somebody out.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};
const group = (n) => console.log(`\n── ${n}`);

const SRC = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

group("0. controls");
t("★ App.jsx was read", SRC.length > 100000);
t("★ the sentinel exists", /const SIGN_IN_TOOL = \{/.test(SRC));
t("★ and a predicate names it, rather than the id being typed out", /const isSignIn = /.test(SRC));

group("1. ★★ there is a way in from the signed-out header");
{
  t("★★ a control renders when NOT signed in", /\{!signedIn && \(/.test(SRC));
  const btn = SRC.slice(SRC.indexOf("{!signedIn && ("), SRC.indexOf("{signedIn && (", SRC.indexOf("{!signedIn && (")));
  t("★★ and it opens the PIN card with the sentinel", /setPinTool\(SIGN_IN_TOOL\)/.test(btn), btn.slice(0, 80));
  t("★ it says Sign in", />\s*Sign in\s*</.test(btn));
  /* ⚠️ EVERY OPEN OF THE CARD STARTS CLEAN. `openTool` clears six pieces of
     state for a reason its own comment gives: a name picked for one tile must
     never be sitting there when somebody else picks up the iPad. A second door
     that skips that is the same bug through a new entrance. */
  for (const k of ["setPin(\"\")", "setPinErr(\"\")", "setNeedName(false)", "setPinNameId(\"\")", "setNameChoices([])", "setNameQuery(\"\")"]) {
    t(`★★ it clears ${k} like openTool does`, btn.includes(k));
  }
}

group("2. ★★ it is not a tool, and never becomes one");
{
  t("★★ grant drops the sentinel rather than opening it",
    /setActiveTool\(isSignIn\(pinTool\) \? null : pinTool\)/.test(SRC));
  t("★★ the submit check goes ABOVE canUseTool, never through it",
    /isSignIn\(pinTool\) \|\| canUseTool\(/.test(SRC),
    "canUseTool short-circuits on onlyFor and would answer false for a narrowed Hub");
  /* ⚠️ IT MUST NOT BE A REGISTERED TILE. A sentinel in SECTIONS would draw a
     tile, appear in search, be pinnable and land in the usage log. */
  /* ⚠️⚠️ SLICED TO A REAL BOUNDARY, NEVER A CHARACTER COUNT. The first draft
     took `indexOf("const SECTIONS") + 40000`, which in two of the four repos
     ran straight past the end of the array and swallowed the sentinel's own
     declaration — so it reported the sentinel as a registered tile in exactly
     the repos where it is not. A fixed-distance slice has now accused correct
     code four times in one day in this project. */
  const secStart = SRC.indexOf("const SECTIONS");
  t("control: the SECTIONS array was found", secStart > 0);
  let depth = 0, secEnd = secStart;
  for (let i = SRC.indexOf("[", secStart); i < SRC.length; i += 1) {
    if (SRC[i] === "[") depth += 1;
    else if (SRC[i] === "]") { depth -= 1; if (!depth) { secEnd = i; break; } }
  }
  const secs = SRC.slice(secStart, secEnd);
  t(`control: it was sliced, not the whole file — ${secs.length} chars`,
    secs.length > 2000 && secEnd > secStart && secEnd < SRC.length - 1000, secs.length);
  t("★★ the sentinel is not registered as a tile", !secs.includes('"__signin"'));
  t("★ no Icon is drawn for it — an unmapped id renders an empty square",
    /\{!isSignIn\(pinTool\) && \(/.test(SRC));
}

group("3. ★ the card says the right thing");
{
  t("★★ it does not claim a tier it does not need",
    /isSignIn\(pinTool\)\s*\n?\s*\? "Type your PIN/.test(SRC) || /isSignIn\(pinTool\)[\s\S]{0,80}Type your PIN/.test(SRC),
    "'Requires Director access' on a plain sign-in is a lie, and a discouraging one");
  t("★ and it is headed Sign in rather than a tool name",
    /isSignIn\(pinTool\) \? "Sign in" : pinTool\.name/.test(SRC));
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
