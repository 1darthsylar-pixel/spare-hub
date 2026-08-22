/* ============================================================================
   weekMath.test.mjs — do all the copies of "which week is it" still agree?

       node weekMath.test.mjs

   ⚠️⚠️ WHY THIS EXISTS. On Aug 17 2026 Matt's dashboard said "the nightly job
   has not written this week" about a job that had run perfectly. The job had
   moved to a FORTNIGHT on Aug 11 and the reader was still asking "is this
   week's Monday the one on the record". Two pieces of date maths, one changed,
   nobody noticed until it put an amber row on his screen.

   Sweeping for that afterwards turned up the fault line underneath: this repo
   has SEVEN separate implementations of "the Monday of this week" and TWO of
   "the ISO week key". They all agree today. Nothing here is broken. This file
   is the alarm for the day one of them changes.

   ⚠️ IT DOES NOT COLLAPSE THEM, AND THAT IS DELIBERATE. Merging seven copies
   touches scheduleEngine.js and the board for no current symptom, which is real
   risk bought with nothing. Design rule 8 says one definition and it is right,
   but the cheap half of the protection is knowing the moment they diverge.

   ★★ IT RUNS THEM. Every implementation is extracted from its real file and
   executed against the same dates. Reading them as text would prove nothing —
   the trainer bug was two functions that each looked completely correct.

   ⚠️⚠️ AN IMPLEMENTATION THAT CANNOT BE EXTRACTED IS A FAILURE, NEVER A SKIP.
   Writing this, my own harness silently failed to extract two of them and
   printed "DISAGREE" against the four that did run. I nearly reported a repo-
   wide bug that did not exist. A skipped copy is an unwatched copy, so it fails
   loudly instead.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* Helpers the extracted functions expect to find in their own file. Kept tiny
   on purpose: if a copy ever needs more than this, extraction fails and the
   test says so rather than quietly guessing what it meant. */
const PRELUDE = `
  const pad = (n) => String(n).padStart(2, "0");
  const fromIso = (s) => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
  const isoOf = (d) => \`\${d.getFullYear()}-\${pad(d.getMonth()+1)}-\${pad(d.getDate())}\`;
`;

const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

/* ⚠️ DISCOVERED, NOT LISTED. A hardcoded list is how an EIGHTH copy gets added
   and drifts unwatched — the same "nobody told the other side" that caused the
   original bug. The scan finds them; section 1 asserts the count so a new one
   has to be looked at deliberately rather than appearing silently. */
function discover(reSrc, files) {
  const found = [];
  for (const f of files) {
    const src = read(f);
    const re = new RegExp(reSrc, "g");
    let m;
    while ((m = re.exec(src)) !== null) found.push({ file: f, name: m[1], src: m[0] });
  }
  return found;
}

const CODE_FILES = fs.readdirSync(DIR)
  .filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith(".test.mjs"));

/* ── FAMILY A — the Monday of this week ─────────────────────────────────── */
group("0. every copy is found and RUNS (controls)");

const monRe = "(?:export )?(?:function (mondayKeyOf|mondayOf)\\s*\\([^{]*\\)\\s*\\{[\\s\\S]*?\\n\\}|const (mondayOf|mondayKeyOf)\\s*=\\s*\\([^{]*\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\};)";
const rawMon = [];
for (const f of CODE_FILES) {
  const src = read(f);
  const re = new RegExp(monRe, "g");
  let m;
  while ((m = re.exec(src)) !== null) rawMon.push({ file: f, name: m[1] || m[2], src: m[0] });
}
console.log(`        ${rawMon.map((r) => r.file).join(", ")}`);
/* ⚠️ SEVEN TODAY. If this number changes, somebody added or removed a copy and
   that is exactly the moment a human should look. Update it deliberately. */
t(`family A: 7 copies of the Monday rule found (${rawMon.length})`, rawMon.length === 7);

const monFns = [];
for (const r of rawMon) {
  try {
    const body = r.src.replace(/^export /, "");
    const fn = new Function(`${PRELUDE}\n${body}\nreturn ${r.name};`)();
    monFns.push({ ...r, fn });
  } catch (e) {
    /* ⚠️ A FAILURE, NOT A SKIP. See the header. */
    t(`${r.file}: extracted and compiled — ${e.message}`, false);
  }
}
t(`all ${rawMon.length} compiled (${monFns.length})`, monFns.length === rawMon.length);

/* ── the dates that have ever mattered ──────────────────────────────────── */
/* ⚠️ SUNDAY IS THE ONE THAT BREAKS NAIVE VERSIONS. `getDay()` is 0 on Sunday,
   so a rule written as `date - day + 1` lands on NEXT Monday and the whole week
   shifts. Every tile here treats Sunday as belonging to the week that just
   ended, and the schedule board rolls at Saturday 11pm for the same reason. */
const DATES = [
  ["2026-08-16", "a SUNDAY — belongs to the week that just ended"],
  ["2026-08-17", "a Monday — the boundary itself"],
  ["2026-08-19", "midweek"],
  ["2026-08-22", "a Saturday"],
  ["2026-08-23", "the Sunday after"],
  ["2026-01-04", "a Sunday in the NEW YEAR, week starts in the old one"],
  ["2026-12-28", "the last Monday of the year"],
  ["2028-02-29", "a leap day"],
  ["2026-03-08", "US spring DST — clocks go forward"],
  ["2026-11-01", "US autumn DST — clocks go back"],
];

const pad2 = (n) => String(n).padStart(2, "0");
const asKey = (v) =>
  typeof v === "string" ? v
    : (v instanceof Date ? `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}` : String(v));

group("1. ★★ family A — all seven agree on every date");
{
  let disagreements = 0;
  for (const [iso, why] of DATES) {
    const now = new Date(`${iso}T12:00:00`);
    const answers = monFns.map((m) => {
      try {
        /* ⚠️ ONE OF THEM TAKES AN ISO STRING, NOT A DATE (LaborPlanner). Feeding
           it a Date returns garbage rather than throwing, which would read as a
           disagreement and send somebody hunting a bug that is not there. */
        const arg = /\(iso\)/.test(m.src) ? iso : now;
        return asKey(m.fn(arg));
      } catch { return "THREW"; }
    });
    const uniq = [...new Set(answers)];
    if (uniq.length !== 1) {
      disagreements++;
      console.log(`        ${iso}  ${monFns.map((m, i) => `${m.file.replace(/\.\w+$/, "")}=${answers[i]}`).join("  ")}`);
    }
    t(`${iso} · ${why} → ${uniq.length === 1 ? uniq[0] : "DISAGREE"}`, uniq.length === 1);
  }
  t(`★ zero disagreements across ${DATES.length} dates`, disagreements === 0);
}

group("2. and the answer is actually right, not just consistent");
/* ⚠️ SEVEN COPIES OF THE SAME MISTAKE WOULD AGREE PERFECTLY. Consistency is not
   correctness, so a few answers are pinned to dates a person can check. */
{
  const one = monFns[0];
  const ask = (iso) => asKey(one.fn(/\(iso\)/.test(one.src) ? iso : new Date(`${iso}T12:00:00`)));
  t("Monday Aug 17 maps to itself", ask("2026-08-17") === "2026-08-17");
  t("★ Sunday Aug 16 maps BACK to Aug 10, not forward", ask("2026-08-16") === "2026-08-10");
  t("Saturday Aug 22 maps back to Aug 17", ask("2026-08-22") === "2026-08-17");
  t("★ Sunday Jan 4 2026 maps back into 2025", ask("2026-01-04") === "2025-12-29");
}

/* ── FAMILY B — the ISO week key ────────────────────────────────────────── */
group("3. family B — the ISO week key, which carries its own warning");
/* inputRegistry.weekKeyOf says it "MUST match DailyCleaning.jsx's getWeekKey
   byte for byte, because it is how that tile names its rows. If the two ever
   drift, this register reads keys the cleaning list never wrote and reports a
   clean week as missing, every week, forever." That is the trainer bug, written
   down in advance, on a different pair. */
const weekRe = "(?:export )?function (weekKeyOf|getWeekKey)\\s*\\([^{]*\\)\\s*\\{[\\s\\S]*?\\n\\}";
const rawWeek = [];
for (const f of CODE_FILES) {
  const src = read(f);
  const re = new RegExp(weekRe, "g");
  let m;
  while ((m = re.exec(src)) !== null) rawWeek.push({ file: f, name: m[1], src: m[0] });
}
console.log(`        ${rawWeek.map((r) => `${r.file}:${r.name}`).join(", ")}`);
t(`family B: 2 copies found (${rawWeek.length})`, rawWeek.length === 2);

const weekFns = [];
for (const r of rawWeek) {
  try {
    const body = r.src.replace(/^export /, "");
    weekFns.push({ ...r, fn: new Function(`${PRELUDE}\n${body}\nreturn ${r.name};`)() });
  } catch (e) {
    t(`${r.file}: extracted and compiled — ${e.message}`, false);
  }
}
t(`both compiled (${weekFns.length})`, weekFns.length === rawWeek.length);

if (weekFns.length === 2) {
  let bad = 0;
  for (const [iso, why] of DATES) {
    const now = new Date(`${iso}T12:00:00`);
    const answers = weekFns.map((m) => { try { return String(m.fn(now)); } catch { return "THREW"; } });
    const same = new Set(answers).size === 1;
    if (!same) { bad++; console.log(`        ${iso}  ${weekFns.map((m, i) => `${m.file}=${answers[i]}`).join("  ")}`); }
    t(`${iso} · ${why} → ${same ? answers[0] : "DISAGREE"}`, same);
  }
  t("★ the register and the cleaning tile still name weeks identically", bad === 0);
}

group("4. what this file does NOT claim");
/* ⚠️ AGREEING ON A MONDAY IS NOT AGREEING ON A CADENCE. The trainer bug was not
   two Monday functions disagreeing — both were right. It was a job moving to a
   FORTNIGHT while its reader still asked about a WEEK. This file cannot see
   that, and trainerPeriod.test.mjs is what guards it. Said out loud so a green
   run here is never read as "the week maths is all fine". */
t("this grades the Monday rules, not any job's cadence", true);
console.log("     ⚠️  A job changing its PERIOD is a different failure — see trainerPeriod.test.mjs.");

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
