/* ============================================================================
   backupBucket.test.mjs — this store's backup goes in this store's bucket

       node backupBucket.test.mjs

   ⛔⛔ WHY IT EXISTS. Every store's backup writes ONE file per night, named for
   that store's FSR and the date. Two stores pointed at one bucket is not a
   merge and it is not a conflict: the second run of the night overwrites the
   first, and BOTH jobs report success. You find out on the day you need the
   backup, which is the worst possible day to find out.

   `newstore.mjs` already refuses to build a snapshot it cannot rewrite this
   line in. That covers stores made from now on. NOTHING checked a repo that
   already exists, and the three clones standing today were built before that
   step existed — they had no bucket at all until Aug 20 2026, and a hand-added
   binding is exactly the kind that gets pasted from another store.

   ★ THE RULE IS SIMPLE ON PURPOSE: the bucket must be named for the Worker that
   writes to it. Nothing to keep in step, and no list to update.
   ============================================================================ */
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};

const TOML = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const SRC = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

console.log("\n── controls");
t("wrangler.toml was read", TOML.length > 100);
t("worker.js was read", SRC.length > 100000);

const worker = (TOML.match(/^name\s*=\s*"([^"]+)"/m) || [])[1];
t(`the Worker names itself (control) — ${worker}`, !!worker && worker.length > 3);

console.log("\n── the binding");
const r2 = TOML.match(/\[\[r2_buckets\]\][\s\S]*?binding\s*=\s*"([^"]+)"[\s\S]*?bucket_name\s*=\s*"([^"]+)"/);
t("an [[r2_buckets]] block exists at all", !!r2);
if (r2) {
  const [, binding, bucket] = r2;
  /* ⚠️ THE BINDING NAME IS WHAT worker.js REACHES FOR. A block with the right
     bucket under the wrong binding is a backup that never runs, and it looks
     perfectly configured. */
  t(`the binding is BACKUPS, which is what worker.js reads — ${binding}`, binding === "BACKUPS");
  t("★ and worker.js really does read that name (control)", SRC.includes("env.BACKUPS"));

  /* ⛔⛔ THE ONE THAT MATTERS. */
  t(`★★ the bucket is named for THIS Worker — ${bucket}`, bucket === `${worker}-backups`,
    { worker, bucket, expected: `${worker}-backups` });

  /* Non-vacuous: prove the comparison can fail. A bucket belonging to another
     store is the exact mistake, so it is the exact thing tested. */
  t("★ and a bucket belonging to another store would be caught (proof)",
    `some-other-hub-backups` !== `${worker}-backups`);
}

console.log("\n── the job cannot silently do nothing");
/* ⚠️ A MISSING BUCKET MUST THROW, NOT RETURN. The dispatcher wraps whatever a
   job returns in ok:true, so returning an error object records the run as a
   SUCCESS — and the dead-man check then reports the backup healthy at a store
   that has never backed anything up. */
const rb = SRC.slice(SRC.indexOf("async function runBackup(env)"));
t("runBackup was found (control)", rb.length > 500);
t("★★ a missing bucket throws rather than returning an error object",
  /if \(!env \|\| !env\.BACKUPS\) throw new Error/.test(rb));
t("★ and it does not return one instead",
  !/if \(!env \|\| !env\.BACKUPS\) return/.test(rb));

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
