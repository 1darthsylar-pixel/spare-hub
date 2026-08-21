/* ============================================================================
   jobRetry.test.mjs — can a job that dies ever try again?

       node jobRetry.test.mjs

   ⛔⛔ MEASURED ON THE LIVE STORE, Aug 21 2026. `backup` had never once
   recorded a run. Three faults, each hiding the next:

     1. `alreadyRanToday` wrote the WHOLE-DAY marker when it was ASKED, before
        the job had done anything. So a job that died marked itself as done and
        every later call that day answered "already-ran-today".

     2. The backup copies 595 files with one `fetch` each, and Cloudflare kills
        a Worker at its subrequest cap. Matt's forced run returned exactly that:
        "Too many subrequests by single Worker invocation".

     3. `noteJobRun` stamps over the network, so a job that has spent every
        subrequest has none left to record its own death. The row stayed EMPTY
        rather than `ok:false`, and the Report Card said "no run on record" —
        true, and useless.

   ⇒ One sentence: the job locked itself out for a day, for a reason it could
   not write down, having done nothing.

   ★ A source test because nothing in checks/ can import worker.js — which is
   the same reason all three sat there looking like working code.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `  ${extra}`}`);
  if (cond) pass++; else fail++;
};
const group = (n) => console.log(`\n── ${n}`);

const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const fn = (name) => {
  const i = SRC.indexOf(`function ${name}(`);
  if (i < 0) return "";
  const j = SRC.indexOf("\n}\n", i);
  return j < 0 ? "" : SRC.slice(i, j);
};

group("0. controls — a scan that reads nothing prints ok");
t("worker.js was really read", SRC.length > 100000);
t("the guard exists", fn("alreadyRanToday").length > 0);
t("the backup exists", fn("runBackupFiles").length > 0);
t("control: the day marker key is still spelled `ran:`", /`ran:\$\{jobKey\}`/.test(SRC));

group("1. the day is confirmed, never claimed");
{
  const guard = fn("alreadyRanToday");
  t("★★ the guard no longer writes the whole-day marker",
    !/put\(`ran:\$\{jobKey\}`/.test(guard),
    "writing it here is what let a dead job lock itself out");
  t("★★ it takes a short lease instead", /put\(`lease:\$\{jobKey\}`/.test(guard));
  t("it still refuses a day already done", /get\(`ran:\$\{jobKey\}`\)/.test(guard));
  t("and refuses while a run is in flight", /get\(`lease:\$\{jobKey\}`\)/.test(guard));

  const conf = fn("confirmRanToday");
  t("control: confirmRanToday exists", conf.length > 0);
  t("★★ only it writes the day marker", /put\(`ran:\$\{jobKey\}`/.test(conf));
  t("★ and only when the run was ok", /if \(ok\)/.test(conf));
  t("★ a failed run still clears its lease, so a retry need not wait",
    /delete\(`lease:\$\{jobKey\}`\)/.test(conf) && conf.indexOf("delete(`lease:") > conf.indexOf("if (ok)"));
  t("it never throws", /catch \(e\)/.test(conf));

  t("★★ the dispatcher confirms, keyed on the response",
    /confirmRanToday\(env, dedupJobKey, jobRes\.status < 400\)/.test(SRC));
}

group("2. the marker survives the failure that caused all this");
{
  /* ⚠️ THE WHOLE POINT. Cloudflare KV through the binding costs no subrequest,
     so this guard keeps working in exactly the state that killed the stamp. */
  const guard = fn("alreadyRanToday") + fn("confirmRanToday");
  t("★★ both markers go through the KV binding, not fetch",
    /GATE_CITY_KV\.(get|put|delete)/.test(guard) && !/fetch\(/.test(guard));
}

group("3. the backup cannot spend every subrequest");
{
  t("control: a budget is named", /const BACKUP_FETCH_BUDGET = \d+;/.test(SRC));
  const budget = Number((SRC.match(/const BACKUP_FETCH_BUDGET = (\d+);/) || [])[1] || 0);
  t("★ and it leaves real headroom under Cloudflare's cap", budget > 0 && budget <= 600, `budget = ${budget}`);

  const spends = (SRC.match(/bkSpend\(env\);/g) || []).length;
  t("★★ every fetch in the backup path is counted", spends === 3, `found ${spends}, expected table page + bucket listing + file copy`);

  const files = fn("runBackupFiles");
  t("control: the file loop was really sliced out", files.includes("backupCopyFile"));
  t("★★ the loop stops at the budget", /bkSpent\(env\) >= BACKUP_FETCH_BUDGET/.test(files));
  t("★ and counts what it did not do", /remaining\+\+/.test(files));
}

group("4. ⛔ a partial run must not file a manifest");
{
  const files = fn("runBackupFiles");
  const manIx = files.indexOf("BACKUPS.put(name");
  const partIx = files.indexOf("if (remaining) {");
  t("control: it does write a manifest when it finishes", manIx > -1);
  t("★★ the partial return comes FIRST", partIx > -1 && partIx < manIx,
    "a manifest listing files that are not in R2 is the failure this job exists to avoid");
  t("★ a partial run says so", /done: false/.test(files));
  t("★ and a complete one says so too", /done: true/.test(files));
  t("the count reaches the run record", /"remaining"/.test(SRC));
}

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
