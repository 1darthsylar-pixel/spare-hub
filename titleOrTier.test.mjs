/* ═══════════════════════════════════════════════════════════════════════════
   THE HEADER SAID "Director" TO THE PERSON WHO IS NOT ONE

   Matt, Aug 22 2026, off a screenshot of the Village header reading
   **"Matt · Director · Sign out"**: *"this should say support."*

   ⭐ HE HAD ALREADY DONE HIS HALF. Read from the Village's own database the
   same morning, `gcfcr-hr-roles` holds exactly one entry and it is `"Support"`.
   The retitle worked. **The chip never asked what his title was.**

   ⛔⛔ IT PRINTED `TIER_NAMES[tier]`, WHICH IS THE ACCESS LEVEL, NOT A TITLE.
   Tier 3's label is the word "Director", so **every** person at tier 3 reads
   "Director" in that chip — Owner, Executive Director, Human Resources,
   Accounts Payable, Payroll and Support alike. It is not one person's bug.

   ⚠️ AND IT IS THE HOST TITLE THAT MADE IT VISIBLE. The whole point of Support
   is that Matt is NOT staff at a store he hosts, and the one line on that
   store's screen naming him called him a Director of it.

   ⚠️ THE TIER LABEL IS STILL RIGHT EVERYWHERE ELSE. A tool says what ACCESS it
   needs, and the PIN card says what access you have. Those are tiers and they
   stay. Only the "who am I signed in as" chip is an identity.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { titleOrTier, hrRankOfTitle } from "./hrRoster.js";

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  FAILED: ${label}${extra ? "  (" + extra + ")" : ""}`); }
};
const APP = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const TIERS = { 1: "Team Member", 2: "Leader", 3: "Director" };

// ── 1 · controls ────────────────────────────────────────────────────────────
ok("★ control — the rule is importable", typeof titleOrTier === "function");
ok("★ control — App.jsx was read", APP.length > 100000);
ok("★ control — the tier labels really are what they were",
  /TIER_NAMES\s*=\s*\{\s*1:\s*"Team Member",\s*2:\s*"Leader",\s*3:\s*"Director"\s*\}/.test(APP));

// ── 2 · a real title wins ───────────────────────────────────────────────────
ok("★★ Support reads as Support, not Director", titleOrTier("Support", 3, TIERS) === "Support");
ok("★★ the Owner is not called a Director", titleOrTier("Owner", 3, TIERS) === "Owner");
for (const t of ["Executive Director", "Human Resources", "Accounts Payable", "Payroll",
                 "Director", "Assistant Director", "Team Leader", "Senior Trainer", "Trainer"]) {
  ok(`${t} reads as itself`, titleOrTier(t, 2, TIERS) === t);
}
ok("★★ a title the store named for itself still reads as itself",
  titleOrTier("Kitchen Director", 2, TIERS) === "Kitchen Director");

// ── 3 · no title falls back to the access level, exactly as before ──────────
ok("★★ nobody signed in reads the tier label", titleOrTier(null, 1, TIERS) === "Team Member");
ok("no title reads the tier label", titleOrTier("", 2, TIERS) === "Leader");
ok("whitespace is not a title", titleOrTier("   ", 3, TIERS) === "Director");
ok("a non-string is not a title", titleOrTier(["Owner"], 2, TIERS) === "Leader");
ok("an unknown tier with no title answers something rather than undefined",
  typeof titleOrTier(null, 9, TIERS) === "string" && titleOrTier(null, 9, TIERS).length > 0);
ok("★★ a missing label map never throws", typeof titleOrTier("Owner", 3) === "string");
ok("and with no title and no map it still answers a string",
  typeof titleOrTier(null, 3) === "string");

// ── 4 · it decides nothing about access ─────────────────────────────────────
const LEAF = readFileSync(new URL("./hrRoster.js", import.meta.url), "utf8");
/* ⚠️ EITHER FORM. The first slice looked only for `export function` and the
   rule is an `export const` arrow, so it sliced from -1 and read the WHOLE
   file — which is why its own control is here and why that control fired. */
const at = LEAF.search(/export\s+(const|function)\s+titleOrTier\b/);
const body = at >= 0 ? LEAF.slice(at) : "";
/* ⚠️⚠️ IT STOPS AT THE FUNCTION'S OWN CLOSING BRACE, NOT AT THE NEXT `export`.
   The first version ran to the next export and swallowed the COMMENT sitting
   between them — and at `spare-hub` that comment happens to explain the access
   tiers, so this assertion accused a byte-identical function of grading access.
   The same trap `hubCopies.test.mjs` already records: **a scan that cannot tell
   an explanation from a call will flip an assertion the moment somebody
   documents the thing next door.** It passed at the origin purely because the
   neighbour there is a different paragraph. */
const stop = body.indexOf("\n};");
const fn = stop > 0 ? body.slice(0, stop + 3) : body;
ok("★★ the label rule never computes a rank or a tier",
  !/hrRankOfTitle|roleTier|HR_RANK_BY_TITLE/.test(fn),
  "a label that grades access is two things sharing one function");
ok("★ control — the slice really is the function", /titleOrTier/.test(fn) && fn.length > 80);
ok("★ and the ranks are untouched by any of this",
  hrRankOfTitle("Support") === 8 && hrRankOfTitle("Owner") === 8 && hrRankOfTitle("Nonsense") === 0);

// ── 5 · the header uses it ──────────────────────────────────────────────────
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ");
const APPS = strip(APP);
ok("★★ the sign-out chip asks for the title, not the tier label",
  /titleOrTier\([^)]*\)[^\n]*Sign out|Sign out[^\n]*titleOrTier/.test(APPS) ||
  /titleOrTier\(/.test(APPS.split("Sign out")[0].slice(-400)),
  "the chip still prints TIER_NAMES[tier]");
ok("★★ App.jsx imports it rather than writing its own",
  /^import\s*\{[^}]*\btitleOrTier\b[^}]*\}\s*from\s*"\.\/hrRoster\.js"/m.test(APPS));

/* ⛔ THE TIER LABEL STAYS WHERE IT IS A TIER. A tool's required access and the
   PIN card's refusal are both about ACCESS, and turning those into titles would
   be the same confusion facing the other way. */
const tierUses = (APPS.match(/TIER_NAMES\[/g) || []).length;
ok("★★ the tier label is still used where access is what is meant",
  tierUses >= 3, `${tierUses} use(s) left`);

console.log(`titleOrTier: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
