/* ============================================================================
   submissionsRefusal.test.mjs — does a dropped read read as "nobody did it"?

       node submissionsRefusal.test.mjs

   ⛔⛔ THE BUG THIS GRADES, AND IT REACHES PHONES. `sbListSubmissions` answered
   `[]` for "nothing was submitted" and for "the read was refused" alike. All
   three callers subtract what came back from a roster to work out who is
   MISSING:

     runTrainerTasksSummary  pushes EVERY trainer that their task is still open
     runFoodSafetyWeekly     reports a week of zero walkthroughs
     runOnboardingNotice     silently skips everybody

   and each stamps a good run afterwards, so nothing anywhere says the morning
   was blind.

   ⚠️ This is the same class the cleaning summary fixed on Aug 19, where a
   dropped read DMed the cleaning owner that her week was outstanding when it
   may have been finished. That fix landed one file over and this reader kept
   the bug.

   ★ A source test because nothing in checks/ can import worker.js — the same
   reason it was invisible.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `  ${extra}`}`);
  if (cond) pass++; else fail++;
};

const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const fn = (() => {
  const i = SRC.indexOf("async function sbListSubmissions");
  if (i < 0) return "";
  const j = SRC.indexOf("\n}\n", i);
  return j < 0 ? "" : SRC.slice(i, j);
})();

console.log("\n── controls");
t("worker.js was really read", SRC.length > 50000);
t("the reader exists", fn.length > 0);
t("control: the function body was really sliced out", fn.includes("submissions?tool=eq."));

console.log("\n── the read");
t("★★ a refused read throws", /if \(!res\.ok\) throw new Error/.test(fn));
t("★★ it never answers with an empty list instead", !/if \(!res\.ok\) return \[\]/.test(fn));
t("the error names the tool, so the run says which read died", /on \$\{tool\}/.test(fn));
t("★ a successful read of nothing is untouched", fn.includes("return res.json();"));

console.log("\n── every caller is a job, never a request path");
{
  /* ⚠️ THIS IS THE ASSERTION THAT LICENSES THE THROW. If somebody later calls
     this from a route, a refused read becomes a 500 on a person's screen and
     the throw stops being the right answer. */
  const callers = [...SRC.matchAll(/await sbListSubmissions\(/g)].map((m) => {
    const before = SRC.slice(0, m.index);
    const decl = [...before.matchAll(/^(?:async )?function ([A-Za-z0-9_]+)/gm)].pop();
    return decl ? decl[1] : "";
  });
  t("control: callers were really found", callers.length >= 3, `found ${callers.length}`);
  t("★★ every caller is a run* job", callers.every((c) => /^run[A-Z]/.test(c)), callers.join(", "));
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
