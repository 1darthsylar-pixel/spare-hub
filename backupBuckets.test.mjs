/* ============================================================================
   backupBuckets.test.mjs — EVERY BUCKET THE APP WRITES TO IS BACKED UP.

       node backupBuckets.test.mjs

   🐛 THE BUG THIS EXISTS FOR, FOUND Aug 22 2026. `BACKUP_BUCKETS` and
   `UPLOAD_BUCKETS` are two lists of the same fact — which buckets this store
   uses — kept in step by hand. They drifted. `food-safety-photos` was on the
   upload list, was on the security sweep's `STORAGE_BUCKETS` list, and was
   missing from the backup list in THREE of the four repos.

   ⇒ So every food safety photo those stores took was uploaded fine, listed by
   the sweep fine, and never backed up. The nightly manifest reported `ok` the
   whole time, because a bucket that is not on the list is not a bucket that
   failed — it is a bucket nobody asked about.

   ⭐ THAT IS THE THIRD TIME THIS BACKUP HAS SHIPPED A CONFIDENT MANIFEST OVER
   MISSING DATA, and each one was a different mechanism:
     · a cap    — an unpaged read saved 1,000 of 1,379 keys
     · a horizon — a folder-blind listing saved 19 of 602 files
     · a list    — a bucket nobody carried across

   ⚠️⚠️ THE FIRST TWO WERE FIXED IN CODE AND COULD NOT COME BACK. This one can,
   every time somebody adds a bucket, and no amount of care in `worker.js`
   prevents it — which is exactly what a test is for.

   ⚠️ IT READS BOTH LISTS OUT OF THE REAL `worker.js` rather than holding a copy
   of either. A third hand-kept list of buckets, living in the test that exists
   to catch hand-kept lists drifting, would be the joke writing itself.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");

let pass = 0, fail = 0;
const t = (label, cond, extra) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${cond || !extra ? "" : `\n          ${extra}`}`);
  if (cond) pass++; else fail++;
};
const group = (n) => console.log(`\n── ${n}`);

/* Pull an array literal of quoted strings out of a `const NAME = [...]`. */
function listOf(name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* ── 0. the control ───────────────────────────────────────────────────────
   ⚠️ A SCAN THAT FINDS NOTHING REPORTS CLEAN FOR EVERYTHING. If either regex
   silently missed, every assertion below would compare an empty list against
   an empty list and the whole file would print green while grading nothing. */
group("0. both lists were actually found (control)");
const upload = listOf("UPLOAD_BUCKETS");
const backup = listOf("BACKUP_BUCKETS");
t("worker.js is non-trivial", src.length > 10000);
t("UPLOAD_BUCKETS was found", Array.isArray(upload));
t("BACKUP_BUCKETS was found", Array.isArray(backup));
/* ⚠️ A FLOOR, NOT `> 0`. Losing four of six names is the same silent failure as
   losing all six, and an empty-vs-empty comparison passes either way. */
t("UPLOAD_BUCKETS holds a real list", (upload || []).length >= 5, `got ${(upload || []).length}`);
t("BACKUP_BUCKETS holds a real list", (backup || []).length >= 5, `got ${(backup || []).length}`);

/* ── 1. the rule ─────────────────────────────────────────────────────────── */
group("1. every bucket the app can write to is on the backup list");
if (upload && backup) {
  const missing = upload.filter((b) => !backup.includes(b));
  t("★★ nothing the app uploads to is left out of the backup",
    missing.length === 0,
    `not backed up: ${missing.join(", ")}`);

  /* ⚠️ THE OTHER DIRECTION IS A WARNING, NOT THE SAME RULE, AND THE ASYMMETRY
     IS DELIBERATE. A bucket on the backup list that the app never writes to is
     not data loss — but the listing is NOT wrapped, so if that bucket does not
     exist in the store's project the whole nightly backup dies on it. */
  const stray = backup.filter((b) => !upload.includes(b));
  t("★★ nothing is backed up that the app never writes to",
    stray.length === 0,
    `on the backup list but not the upload list, and an absent bucket kills the job: ${stray.join(", ")}`);
}

/* ── 2. the sweep's list agrees too, where it exists ─────────────────────── */
group("2. the security sweep sees the same buckets");
/* ⚠️ A THIRD LIST OF THE SAME FACT. It is declared inside a function here, so
   it is found by its own name rather than by the `const NAME =` shape above.
   Guarded: a repo without it is a real state, not a failure. */
const sweepM = src.match(/const STORAGE_BUCKETS\s*=\s*\[([\s\S]*?)\]/);
if (!sweepM) {
  console.log("  --    this repo has no STORAGE_BUCKETS, so nothing to compare (NOT GRADED)");
} else {
  const sweep = [...sweepM[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  t("STORAGE_BUCKETS holds a real list (control)", sweep.length >= 5, `got ${sweep.length}`);
  if (backup) {
    const seenNotBacked = sweep.filter((b) => !backup.includes(b));
    t("★★ every bucket the sweep checks is also backed up",
      seenNotBacked.length === 0,
      `swept but not backed up: ${seenNotBacked.join(", ")}`);
  }
}

/* ── 3. the one that started it ──────────────────────────────────────────── */
group("3. food-safety-photos, named because it is what drifted");
if (backup) {
  /* ★ NAMED ON PURPOSE, and it is the one place in this file a name is typed.
     Section 1 already catches it by rule; this catches it by name, so a future
     edit that removes it from BOTH lists at once still fails here and has to be
     a deliberate decision rather than a quiet one. */
  t("★★ food-safety-photos is backed up", backup.includes("food-safety-photos"));
}

console.log(`\n${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
