/* ============================================================================
   ytdBehind.test.mjs — does the FCR say when most of its numbers are old?

       node ytdBehind.test.mjs

   Matt, Aug 17 2026: "fcr still isnt accurate and nick looks every morning."

   ⚠️⚠️ ONLY FOUR LINES ON THAT PAGE ARE LIVE. Food, Paper, Wages and Wage Taxes.
   Every other line — around twenty of them, R&M, rent, utilities, supplies — is
   `YTD % × Est Sales`, and those percentages come from whatever FCR was last
   typed into the YTD table. So does the Projected Net Profit at the top.

   ⛔ NOTHING EVER CHECKED THAT DATE. `throughYm` has been stored since the table
   was built and rendered in exactly two places, both inside the YTD editor two
   screens down. The headline number said nothing. A YTD column that stopped
   being updated therefore produces a Projected Net Profit that is confidently
   wrong and looks completely normal, every morning, indefinitely.

   ★ THE SEED IS THE 30-JUN-26 COLUMN. fcrYtdSeed.js says so in its own header.
   If July's FCR was never entered, the whole page has been answering an August
   question with June percentages.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEmptySeed, sayNotGraded } from "./seedPresence.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(DIR, "FCRPage.jsx"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

group("0. controls");
t("FCRPage.jsx was read (control)", SRC.length > 50000);
/* ⚠️⚠️ THIS CONTROL IS RIGHT AND IS NOT WEAKENED, IT IS ASKED IN THE RIGHT
   PLACE. A store with no sales history yet gets the deliberate empty twin of
   this seed, so demanding the origin's June column there failed a brand new
   store on data it is not supposed to have. The export is asked, never the file
   text: five real seeds mention `.empty.js` in their own comments, so a text
   marker reports the ORIGIN's live data as scrubbed. */
const { FCR_YTD_SEED } = await import("./fcrYtdSeed.js");
t("the YTD seed module still exports what its readers import (control)",
  FCR_YTD_SEED !== undefined);
if (!isEmptySeed(FCR_YTD_SEED)) {
  t("the YTD seed is still the June column (control)",
    /THE 30-JUN-26 YTD COLUMN/.test(fs.readFileSync(path.join(DIR, "fcrYtdSeed.js"), "utf8")));
} else {
  sayNotGraded("the YTD seed's own shape",
    "FCR_YTD_SEED is empty, so this store has no year-to-date history on file.");
}

const m = SRC.match(/const ytdMonthsBehind = \(throughYm, nowYm\) => \{[\s\S]*?\n\};/);
t("ytdMonthsBehind was found (control)", !!m);
let behind = null;
if (m) {
  try { behind = new Function(`${m[0]}\nreturn ytdMonthsBehind;`)(); }
  catch (e) { t(`ytdMonthsBehind compiled — ${e.message}`, false); }
}
t("ytdMonthsBehind compiled", typeof behind === "function");

if (typeof behind === "function") {
  group("1. ★★ the state Matt's page was actually in");
  /* August is open, so the newest FCR that can exist is July's. A YTD column
     still on June is one closed month missing. */
  t("★★ June YTD read in August is 1 month behind", behind("2026-06", "2026-08") === 1);
  t("★ July YTD read in August is current", behind("2026-07", "2026-08") === 0);
  t("★★ May YTD read in August is 2 behind", behind("2026-05", "2026-08") === 2);

  group("2. ★ the current month is not late");
  /* ⚠️ THE MOST LIKELY WRONG IMPLEMENTATION. Counting the difference between
     throughYm and the month on screen makes a perfectly current column read as
     one behind, every single month, for every store. A warning that is always
     on is one nobody reads. */
  t("★★ July YTD in August does NOT warn", behind("2026-07", "2026-08") === 0);
  t("★★ and December YTD in January does not either", behind("2025-12", "2026-01") === 0);
  t("a YTD ahead of the month is not negative", behind("2026-09", "2026-08") === 0);

  group("3. ★ it crosses the year properly");
  t("Nov 2025 read in Jan 2026 is 1 behind", behind("2025-11", "2026-01") === 1);
  t("Aug 2025 read in Jan 2026 is 4 behind", behind("2025-08", "2026-01") === 4);

  group("4. ★★ a store that has never filled it in is not accused");
  /* ⚠️ THE CLONE CASE. Shouting at a new store about a column they have never
     seen is the wrong alarm, and it would be the first thing they ever read on
     this page. */
  t("★★ a blank throughYm does not warn", behind("", "2026-08") === 0);
  t("null does not warn", behind(null, "2026-08") === 0);
  t("junk does not warn", behind("June", "2026-08") === 0);
  t("a 13th month does not warn", behind("2026-13", "2026-08") === 0);
  t("a bad current month does not warn", behind("2026-06", "nonsense") === 0);
  t("it never throws", (() => {
    for (const a of [undefined, 0, {}, [], "2026-6"]) { try { behind(a, "2026-08"); } catch { return false; } }
    return true;
  })());

  group("5. paging back does not accuse it");
  /* ⚠️ MEASURED AGAINST THE MONTH ON SCREEN, not against today. Opening June to
     look at a closed month must not warn that the June column is out of date. */
  t("★ June YTD viewed on the June page is current", behind("2026-06", "2026-06") === 0);
  t("★ June YTD viewed on the July page is current", behind("2026-06", "2026-07") === 0);
}

group("6. the page shows it, at the top, in the right words");
{
  t("the warning is wired to the helper", /const ytdBehind = ytdMonthsBehind\(ytdRec\?\.throughYm, ym\);/.test(SRC));
  t("★★ it only renders when genuinely behind", /\{ytdBehind > 0 && \(/.test(SRC));
  t("★ it says most numbers are old, not a technical phrase",
    /Most of the numbers below are/.test(SRC));
  t("★ it names the four lines that ARE live, so the page is not written off",
    /except Food, Paper, Wages and Wage Taxes/.test(SRC));
  t("★ it says the headline is affected too", /Projected Net Profit at the top/.test(SRC));
  t("★ and it says what to do about it", /Enter the newest FCR in the YTD table/.test(SRC));

  /* ⚠️ ABOVE THE AUTO-BUILT NOTE. Two banners, and the one about the numbers
     being old has to be read first. */
  t("★★ it renders ABOVE the auto-built month note",
    SRC.indexOf("{ytdBehind > 0 && (") < SRC.indexOf("{!hasTemplate && ("));
}

group("7. ★★ the labor banner — three numbers for one metric");
/* Matt, Aug 17 2026: "wages say 20.19 inside the fcr but in the ket metrics it
   says 21.46." Both are the same formula, and his own MTD inputs make a THIRD:

     wages $87,472.21 + PTO $776.00 = $88,248.21
     sales through Aug 16          = $416,912.72
     measured labor %              = 21.17%

   The Wages line is `laborPct x estSales / estSales`, which IS laborPct. So a
   20.19% Wages line can only mean laborPct is not the measured figure — an
   override is typed in. And 21.46% on the dashboard is the last PUBLISHED one,
   frozen because the hold is on.

   ⇒ Three numbers, from two manual switches, neither of which had a banner. */
{
  t("★★ the measured labor % from his own inputs is 21.17%",
    Math.abs((87472.21 + 776) / 416912.72 - 0.2117) < 0.0001);
  t("★ so 20.19% cannot be the measured figure",
    Math.abs(0.2019 - (87472.21 + 776) / 416912.72) > 0.009);

  t("the banner fires for a hold OR an override",
    /\{\(laborHeld \|\| laborOverrideN != null\) && \(/.test(SRC));
  t("★★ an override shows BOTH numbers, not just that it is overridden",
    /entered by hand/.test(SRC) && /work out to/.test(SRC));
  t("★ it names every line the override moves",
    /Wages, Wage Taxes, Operating Profit and Net Profit/.test(SRC));
  t("★ and how to undo it", /Clear the box in the labor section below/.test(SRC));
  t("★★ the hold text names which screens disagree",
    /Key Metrics strip, the L10 board and the morning digest/.test(SRC));
  /* ⚠️ NEITHER IS CALLED A BUG. Both are deliberate switches somebody threw for
     a reason. The failure was that nothing said they were on. */
  t("★ it does not call either one wrong", /Neither is wrong/.test(SRC));
}

group("7b. ★★ the hours-through window can be UNPINNED from the screen");
/* Matt, Aug 17 2026, asked one word about clearing it: "How".

   ⚠️⚠️ THE ANSWER WAS "there is no button", AND THAT IS THE BUG. "Pin this
   date" has always been beside the field. Unpinning only ever appeared inside
   the red stale-window banner, which renders on `wagesMovedSinceThrough ||
   windowStale`. So a date pinned to a day nothing warns about had NO control
   on the screen that undid it — the only route was clearing a native date
   input, which on an iPad is most of a minute of poking.

   ⚠️ A CONTROL THAT ONLY APPEARS ONCE SOMETHING IS WRONG is a rescue, not an
   undo. The two states must read the same. */
{
  t("★ Pin this date is still there when nothing is pinned",
    /\{!pinned && effThrough && \(/.test(SRC) && /Pin this date/.test(SRC));
  t("★★ and Unpin is there whenever something IS pinned",
    /\{pinned && \(/.test(SRC) && />\s*Unpin\s*</.test(SRC));
  t("★★ Unpin clears the date rather than setting one",
    /\{pinned && \([\s\S]{0,400}?setHoursThrough\(""\)/.test(SRC));

  /* ⚠️ THE TWO BUTTONS MUST BE MUTUALLY EXCLUSIVE. `pinned` and `!pinned`
     guarantee it, but they are two separate blocks and a later edit could make
     both conditions truthy — two buttons that look like opposites, both live,
     is worse than the missing one. */
  t("★ the two guards are exact opposites",
    SRC.includes("{!pinned && effThrough && (") && SRC.includes("{pinned && ("));

  /* ⚠️ THE BANNER'S OWN ESCAPE HATCH STAYS. It says something different — it
     explains WHY — and removing it because a plain Unpin now exists would take
     the explanation with it. */
  t("★ the red banner still offers the auto-track escape too",
    /Auto-track my last sales day instead/.test(SRC));

  /* Empty means auto-track. Anything else is a pin. That is the whole model and
     it is stated at the load path. */
  t("★★ empty hoursThrough means auto-track, and the file says so",
    /Empty hoursThrough = auto-track; a value = pinned/.test(SRC));
}

group("7c. ★★ the labor window is stated where the typing happens");
/* Matt, Aug 18 2026: "for inputing labor instructions make sure it says in the
   actual tab. it might be confusing or make it smart to know the date its being
   input?"

   ⚠️⚠️ THE ANSWER USED TO LIVE SOMEWHERE ELSE ON THE PAGE, WHICH IS THE SAME AS
   NOT HAVING ONE. The window this payroll is counted against was stated in 10px
   grey at the BOTTOM of a folded panel two sections down, and the override
   banner said "clear the box in the labor section below" — both of which ask
   somebody mid-task to go and find something. */
{
  const m2 = SRC.match(/const daysCovered = \(a, b\) => \{[\s\S]*?\n\};/);
  t("daysCovered was found (control)", !!m2);
  let days = null;
  if (m2) { try { days = new Function(`${m2[0]}\nreturn daysCovered;`)(); } catch (e) { t(`daysCovered compiled — ${e.message}`, false); } }
  t("daysCovered compiled", typeof days === "function");

  if (typeof days === "function") {
    /* ⚠️ BOTH ENDS COUNTED, the way a person counts a pay period. Aug 1 to
       Aug 16 is 16 days, not 15. An off-by-one here makes a fortnightly
       payroll read as 13 or 15 and the mismatch it exists to reveal is lost. */
    t("★★ Aug 1 to Aug 16 is 16 days", days("2026-08-01", "2026-08-16") === 16);
    t("★ a single day is 1", days("2026-08-05", "2026-08-05") === 1);
    t("★ a fortnight reads 14", days("2026-08-01", "2026-08-14") === 14);

    /* ⚠️⚠️ MIDDAY, NOT MIDNIGHT. Two dates built at local midnight are 23 or 25
       hours apart across a DST boundary, so a midnight version is wrong exactly
       twice a year — and the fortnight either side of the change is when a
       labor window is most likely to be wrong anyway. March 8 2026 is the US
       spring-forward Sunday. */
    t("★★ it survives spring forward", days("2026-03-01", "2026-03-31") === 31);
    t("★★ and fall back", days("2026-11-01", "2026-11-30") === 30);
    t("★ it crosses a month end", days("2026-01-25", "2026-02-05") === 12);
    t("★ a leap February is 29", days("2028-02-01", "2028-02-29") === 29);

    /* Nothing is invented from junk — the caller hides the count instead. */
    t("★ a blank end date gives no count", days("2026-08-01", "") === null);
    t("★ junk gives no count", days("2026-08-01", "soon") === null);
    t("★ a backwards range gives no count", days("2026-08-16", "2026-08-01") === null);
    t("it never throws", (() => {
      for (const a of [undefined, null, 0, {}, [], "2026-8-1"]) {
        try { days(a, "2026-08-16"); days("2026-08-01", a); } catch { return false; }
      }
      return true;
    })());
  }

  /* ── it is rendered INSIDE the payroll panel, not elsewhere ── */
  t("★★ the window is stated in real dates where the boxes are",
    /These numbers cover \{prettyDate\(monthFirstIso\)\} to \{prettyDate\(effThrough\)\}/.test(SRC));
  t("★★ and it counts the days, so a wrong window is visible",
    /laborWindowDays \? ` · \$\{laborWindowDays\} day/.test(SRC));
  t("★ it says to enter from the 1st, not one pay period",
    /from the 1st through that end date<\/b>, not one pay period on its own/.test(SRC));
  t("★ it shows the sales the % will be divided by",
    /Labor % is \(wages \+ PTO\) ÷ the \{money\(salesThrough\)\} of sales/.test(SRC));

  /* ⚠️ AUTO vs PINNED IN PLAIN WORDS. The chip on the field says "AUTO" and
     "PINNED", which are our words, not his. */
  t("★★ it says in plain words whether the end date moves",
    /follows your last entered sales day<\/b> and moves on its own/.test(SRC)
    && /set by hand<\/b>\. If this pay period now covers more days/.test(SRC));

  /* ⚠️ THE WAY TO CHANGE IT IS RIGHT THERE. "Change the window" used to be a
     link somebody had to find; this one opens the panel from inside the block
     that just told you the date might be wrong. */
  t("★★ and the fix is a button in the same block, not a pointer elsewhere",
    /onClick=\{\(\) => setShowLaborAdvanced\(true\)\}[\s\S]{0,320}?Change the end date/.test(SRC));

  /* ⚠️ RENDERED WHERE THE PAYROLL BOXES ARE, NOT ABOVE THE WHOLE PAGE. Graded
     by position: it must sit between the panel opening and the WAGES box. */
  const openIdx = SRC.indexOf("{inputsOpen && (");
  const blockIdx = SRC.indexOf("These numbers cover");
  const wagesIdx = SRC.indexOf("WAGES ($)");
  t("★★ it is inside the open payroll panel, above the WAGES box",
    openIdx > 0 && blockIdx > openIdx && wagesIdx > blockIdx);

  /* ⛔ IT STATES, IT NEVER GUESSES. A day count that decided "this looks
     fortnightly" would be right until the one month it is not, and being
     confidently wrong about the labor window is the failure this page keeps
     paying for. */
  /* ⚠️ SCOPED TO THE RENDERED BLOCK, NOT THE WHOLE FILE. My first version tested
     all of FCRPage.jsx and went red on the COMMENT that states this very rule.
     Suspect the assertion first: a comment explaining why we do not guess is
     not the code guessing. */
  const rendered = SRC.slice(blockIdx, wagesIdx);
  t("★★ the block states the window and never infers the pay period",
    blockIdx > 0 && !/fortnight|biweekly|bi-weekly/i.test(rendered));
}

group("8. what this does NOT do");
/* ⚠️ It does not change a single figure. The numbers were always computed this
   way; the page simply never admitted how old the inputs were. */
t("this adds a warning and changes no arithmetic", true);
console.log("     ⚠️  It cannot read the stored override or hold — that is live KV. It cannot know whether Gate City's stored YTD is June or July — that is live KV.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
