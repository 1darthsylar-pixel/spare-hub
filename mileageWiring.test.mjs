/* ═══════════════════════════════════════════════════════════════════════════
   THE SCREEN ACTUALLY USES THE STORED RATE

   `mileagePay.test.js` grades the maths. Nothing graded whether `CashAudit.jsx`
   CALLS it, and the bug was never in the arithmetic — it was that three money
   sites reached for `mileageRate()` at render time.

   ⛔⛔ THE FAULT THIS PREVENTS COMING BACK: one site left on `miles *
   mileageRate()` re-prices every past claim through that one screen, and the
   other two look right. Matt, Aug 22 2026: *"changing the rate silently
   re-prices every past claim, including months already paid and printed."*
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  FAILED: ${label}${extra ? "  (" + extra + ")" : ""}`); }
};
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "))
                      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ");

const RAW = readFileSync(new URL("./CashAudit.jsx", import.meta.url), "utf8");
const SRC = strip(RAW);
const CFG = readFileSync(new URL("./storeConfig.js", import.meta.url), "utf8");
const SET = strip(readFileSync(new URL("./StoreSettings.jsx", import.meta.url), "utf8"));

// ── controls ────────────────────────────────────────────────────────────────
ok("★ control — CashAudit was read and comments stripped",
  RAW.length > 50000 && /re-prices every past claim/.test(RAW) && !/re-prices every past claim/.test(SRC));
ok("★ control — the other two files were read", CFG.length > 10000 && SET.length > 10000);

// ── 1 · the rate is stamped when the trip is created ────────────────────────
/* ⚠️ THE FUNCTION IS SLICED TO ITS OWN CLOSING BRACE, NOT A FIXED WINDOW. The
   first version looked 400 characters past the opener, and stripping this
   function's comment leaves over 500 characters of whitespace, so the window
   ran out before it reached a line of actual code and accused correct work.
   **A character budget is a guess about how much somebody wrote.** */
/* ⚠️⚠️ A REGEX, NOT `indexOf("function emptyMileage()")`, AND THE CONTROL IS
   WHAT FOUND OUT. The Village takes an argument — `emptyMileage(car = "1")`,
   because that store has more than one car — so an exact-string search matched
   NOTHING there, sliced an empty body, and the assertion under it would have
   been vacuous. It failed loudly instead, because the control demands the slice
   really contain something. **A guard that reads nothing must never be able to
   report clean**, and one repo's spelling of a function is not a fact the other
   three share. */
const emAt = (SRC.match(/function emptyMileage\s*\(/) || { index: -1 }).index;
const emEnd = SRC.indexOf("\n}", emAt);
const emptyMileageBody = emAt >= 0 && emEnd > emAt ? SRC.slice(emAt, emEnd) : "";
ok("★ control — emptyMileage really was sliced",
  /return \{/.test(emptyMileageBody) && emptyMileageBody.length > 60,
  `${emptyMileageBody.length} chars`);
ok("★★ emptyMileage stamps the rate at create time",
  /rate: mileageRate\(\)/.test(emptyMileageBody),
  "a trip is logged with no rate, so it re-prices forever");

// ── 2 · no money site multiplies by the live setting ────────────────────────
/* ⚠️ THE SHAPE IS THE BUG, not the function name. `mileageRate()` is still
   read — it is the FALLBACK for trips logged before we stamped one, and it is
   what a NEW trip is stamped with. What may never come back is multiplying
   miles by it. */
const live = (SRC.match(/miles\s*\*\s*mileageRate\(\)/g) || []);
ok("★★ nothing multiplies miles by the current setting any more",
  live.length === 0, `${live.length} site(s) left`);
ok("★★ the month totals row by row through the leaf",
  /monthPay\(mileageForMonth, mileageRate\(\)\)/.test(SRC));
ok("★★ the odometer prices through the leaf",
  /odometerPay\(miles, mileageForMonth, mileageRate\(\)\)/.test(SRC));
ok("★★ the entry preview prices through the leaf",
  /entryPay\(mileageForm, mileageRate\(\)\)/.test(SRC));
ok("★★ it imports the leaf rather than keeping its own copy",
  /^import \{[^}]*\bmonthPay\b[^}]*\} from "\.\/mileagePay\.js"/m.test(SRC));
ok("★★ and there is no second mileageMiles left in the screen",
  !/function mileageMiles\s*\(/.test(SRC),
  "two definitions of what a trip is worth");

// ── 3 · nothing backfills an old row ────────────────────────────────────────
ok("★★ no code writes a rate onto an entry that already exists",
  !/\.rate\s*=\s*mileageRate\(\)/.test(SRC) && !/rate:\s*mileageRate\(\)[\s\S]{0,80}?editing/i.test(SRC),
  "backfilling invents what somebody was paid");

// ── 4 · every printed rate is the one actually applied ──────────────────────
const printedLive = (SRC.match(/\$\{mileageRate\(\)\.toFixed\(2\)\}/g) || []);
ok("★★ no header prints the current setting as if it priced the month",
  printedLive.length === 0,
  `${printedLive.length} place(s) still print the settings box`);
ok("★★ the printed sheet says when a month holds two rates",
  /totals\.mixed/.test(SRC) && /Two rates this month/.test(SRC),
  "a blended figure printed as the rate is a number nobody set");
ok("★★ the odometer line names the rate it used",
  /payable\.rate \?\? mileageRate\(\)/.test(SRC));
ok("★★ and says when that rate came from the settings box rather than a trip",
  /payable\.rateFrom === "setting"/.test(SRC));

// ── 5 · the default, and the note that was not true ─────────────────────────
ok("★★ the shipped default is the 2026 IRS rate",
  /mileageRate:\s*0\.76\b/.test(CFG),
  "0.70 is the 2025 figure");
ok("★★ the settings note no longer claims it only prices new claims",
  !/Only prices new claims/.test(SET),
  "that sentence was false for as long as it was there");
ok("★★ and it says what the number MEANS to whoever types it",
  /IRS/.test(SET) && /taxable wages/.test(SET),
  "at or below the IRS rate it is tax free, above it is payroll");

console.log(`mileageWiring: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
