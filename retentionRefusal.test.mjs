/* ============================================================================
   retentionRefusal.test.mjs — can the delete job run on numbers it could not read?

       node retentionRefusal.test.mjs

   ⛔⛔ THIS IS THE ONE JOB IN THE HUB THAT DESTROYS RECORDS, so it gets its own
   guard. `runRetentionPurge` read the store's own retention settings inside a
   bare `try { } catch { }`. `sbGetStrict` returns null when a key genuinely is
   not there and THROWS when the read was refused, and that catch collapsed the
   two. A dropped read therefore fell back to the BUILT-IN numbers and purged on
   them: a store that typed 3650 days for escalations would have lost years 1 to
   10 that night, on a schedule, silently, and the run stamped ok.

   Two rules, and the test fails if either is lost:

     ABSENT  → nobody has typed a number. A real answer. Defaults still apply.
     REFUSED → we do not know this store's policy. Delete nothing.

   ⚠️ AND IT MUST THROW, NOT RETURN. This file's own note at `runBackup` records
   why: the dispatcher wraps whatever a job RETURNS in `ok: true`, so an error
   object stamps a good run and moves the heartbeat. A throw is the only thing
   the monitoring can see.

   ★ A source test because nothing in checks/ can import worker.js. That is the
   same reason the bug was invisible.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `  ${extra}`}`);
  if (cond) pass++; else fail++;
};

const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

console.log("\n── controls");
t("worker.js was really read", SRC.length > 50000);
t("the purge job exists", SRC.includes("async function runRetentionPurge"));
t("sbGetStrict exists, so refused and absent really are different here",
  /async function sbGetStrict|const sbGetStrict/.test(SRC));

const body = (() => {
  const i = SRC.indexOf("async function runRetentionPurge");
  return i < 0 ? "" : SRC.slice(i, i + 4000);
})();
t("control: the job body was really sliced out", body.includes("STORE_CONFIG_KEY"));

console.log("\n── the settings read");
t("★★ a refused settings read throws",
  /catch\s*\{[\s\S]{0,1400}?throw new Error\([\s\S]{0,120}?refusing to delete/.test(body));
t("★★ it does not return an error object instead",
  !/catch\s*\{[\s\S]{0,400}?return \{ *ok: false/.test(body));
t("★★ the silent fallback is gone",
  !/catch \{ \/\* no saved settings/.test(SRC));

console.log("\n── and an absent key is still a real answer");
t("a store that has typed nothing still gets the defaults",
  /saved = rec && typeof rec === "object"/.test(body) && body.includes("RETENTION_DEFAULT_DAYS"));
t("control: the defaults are still reachable in the file", SRC.includes("RETENTION_DEFAULT_DAYS"));

console.log(`\n${fail ? "FAIL" : "PASS"}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
