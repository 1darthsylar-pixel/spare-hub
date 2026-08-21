/* ============================================================================
   varianceWords.test.mjs — a variance printed without its sign is a wrong
   instruction, not a rounding problem.

       node varianceWords.test.mjs

   ⛔⛔ WHY THIS EXISTS. Matt, Aug 21 2026, off his own Financials screen.

   The daypart block read:

       "These are the day's 17.24 h spread across the dayparts by where the
        hours actually sit — they add up to the day total above."

   on a Thursday whose calendar cell three inches above it says 393.00h.

   ★ 17.24 IS A VARIANCE. `dayVar = boardSched − budget`. So the sentence took
   a number meaning "how far this day sits from budget" and printed it in the
   vocabulary of "how many hours this day has". Both are plausible hour counts,
   both are on the same screen, and nothing errors.

   ⚠️⚠️ AND `Math.abs` DROPPED THE SIGN. LaborPlanner states one convention for
   itself, in its own comment: OVER budget is + and RED, UNDER is − and GREEN.
   The rows honour it. That sentence printed the identical words for a day 17
   hours over budget and a day 17 hours under it — opposite instructions to the
   person reading it, from the same words.

   ══════════════════════════════════════════════════════════════════════════
   ⭐ THE RULE, AND IT IS DELIBERATELY NARROW.

   `Math.abs()` around a variance is how the sign gets thrown away, and it is
   fine — the sign belongs in the WORDS, which is what the chips already do.
   So: **wherever a *Var value is rendered through Math.abs, the same JSX
   expression must carry a sign word.**

   ⚠️ IT IS NOT "every number needs a word". That fires on every total, rate
   and count in the planner, dozens of them, all correct — the noise lesson
   flatCards.test.mjs and notePanelRing.test.mjs both already record.
   ⚠️ AND IT IS NOT A GREP FOR THE SENTENCE. Rewording it would then pass while
   meaning the same wrong thing. It grades the pairing, not the prose.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};

/* A sign word, in any of the spellings this codebase actually uses. */
const SIGN = /\b(over|under|above|below|to cut|to add|short|left)\b/i;

/* ⚠️ ONE READING, used by the sweep AND by every control, so a control cannot
   drift away from the thing it is proving. */
function scan(src) {
  const hits = [];
  const lines = src.split("\n");
  lines.forEach((l, i) => {
    if (!/Math\.abs\s*\(\s*[A-Za-z_$][\w$.]*Var\b/.test(l)) return;
    /* The sign word may sit a line or two either side — a long sentence wraps.
       Four lines each way is the whole rendered phrase and no more. */
    const win = lines.slice(Math.max(0, i - 4), i + 5).join("\n");
    if (SIGN.test(win)) return;
    hits.push(i + 1);
  });
  return hits;
}

console.log("\n── 0. controls — the scan reads, fires, and does not fire on the fix");
{
  t("★ an unsigned variance is flagged",
    scan('  <b>{fmtH(Math.abs(dpDay.dayVar))} h</b> spread across the dayparts').length === 1);
  t("★★ and the real sentence that shipped IS flagged", (() => {
    const shipped = [
      '                  These are the day&rsquo;s <b>{fmtH(Math.abs(dpDay.dayVar))} h</b> spread across the dayparts by',
      '                  where the hours actually sit — they add up to the day total.',
    ].join("\n");
    return scan(shipped).length === 1;
  })());
  t("★ a variance carrying its sign word is not flagged",
    scan('  <b>{fmtH(Math.abs(dpDay.dayVar))} h</b> this day sits {varOver ? "over" : "under"} budget').length === 0);
  t("★ a plain total is not a variance and is left alone",
    scan('  <b>{fmtH(Math.abs(dpDay.dayTotal))} h</b> scheduled').length === 0);
  t("★ the sign word may wrap onto the next line",
    scan('  <b>{fmtH(Math.abs(dpDay.dayVar))} h</b> this day sits\n  {varOver ? "over" : "under"} budget').length === 0);
}

console.log("\n── 1. ★★ every variance rendered in this repo names its direction");
{
  /* ⚠️ A FLOOR AND A CONTROL STRING THAT MUST BE FOUND, never a bare `> 0`.
     A rename that takes the sweep to zero files is the same silent pass as a
     broken regex, and this repo has paid for exactly that once (channelRecap,
     18 call sites to 0, still green, nothing in the output saying so). */
  const FILE = "LaborPlanner.jsx";
  if (!existsSync(new URL(`./${FILE}`, import.meta.url))) {
    t(`★ ${FILE} — NOT GRADED, this store does not have it`, true);
  } else {
    const src = readFileSync(new URL(`./${FILE}`, import.meta.url), "utf8");
    const renders = (src.match(/Math\.abs\s*\(\s*[A-Za-z_$][\w$.]*Var\b/g) || []).length;
    t(`★ the sweep really read the file (control) — ${renders} variance render(s)`, renders >= 1, renders);
    const hits = scan(src);
    t("★★ no variance is printed without a word saying which way it goes",
      hits.length === 0, hits.length ? `lines ${hits.join(", ")}` : undefined);
  }
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
