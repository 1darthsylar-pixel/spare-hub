/* ============================================================================
   sweepHistory.test.mjs — one row per week, and nothing hidden

       node sweepHistory.test.mjs

   ⚠️ IT IMPORTS AND RUNS `latestPerWeek`. A source grep cannot tell you a
   function works — this repo proved that with newstore.mjs, where every test
   read the script as text and all of them were green while it exited 1 before
   writing a byte.

   ⚠️⚠️ THE FAILURE MODE THIS GUARDS IS NOT "DUPLICATES SHOW". It is the
   opposite: a dedupe that is too eager HIDES a real sweep. Records filed
   before the two-arg `saveSubmission` bug was fixed have no `week` at all, and
   keying those together would collapse every one of them into a single row —
   a worse bug than the one being fixed, and a silent one.
   ============================================================================ */
import { latestPerWeek } from "./sweepHistory.js";

let pass = 0, fail = 0;
const t = (label, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`); if (cond) pass++; else fail++; };
const group = (n) => console.log(`\n── ${n}`);

/* Newest first, the order listSubmissions returns. */
const sub = (id, week, extra) => ({ id, payload: week === null ? undefined : { week, ...(extra || {}) } });

group("0. the module really loaded (control)");
{
  t("latestPerWeek is a function", typeof latestPerWeek === "function");
}

group("1. THE BUG ON MATT'S SCREEN, Aug 14 2026");
{
  /* Exactly what the screenshot showed: Aug 10 twice, Aug 3 five times.
     Newest first, and the finish times are what told them apart on screen. */
  const rows = [
    sub("s9", "2026-08-10", { by: "Guadalupe", finishedAt: "2026-08-14T17:47:10Z" }),
    sub("s8", "2026-08-10", { by: "Guadalupe", finishedAt: "2026-08-14T17:47:02Z" }),
    sub("s7", "2026-08-03", { by: "Lupe", finishedAt: "2026-08-14T17:38:00Z" }),
    sub("s6", "2026-08-03", { by: "Lupe", finishedAt: "2026-08-14T17:37:44Z" }),
    sub("s5", "2026-08-03", { by: "Lupe", finishedAt: "2026-08-14T17:37:30Z" }),
    sub("s4", "2026-08-03", { by: "Lupe", finishedAt: "2026-08-14T17:37:12Z" }),
    sub("s3", "2026-08-03", { by: "Lupe", finishedAt: "2026-08-14T17:37:01Z" }),
  ];
  const out = latestPerWeek(rows);
  t(`7 submissions become 2 rows (${out.length})`, out.length === 2);
  t("★ the NEWEST Aug 10 sweep is the one shown", out[0].row.id === "s9");
  t("★ the NEWEST Aug 3 sweep is the one shown", out[1].row.id === "s7");
  t("Aug 10 reports 1 earlier save", out[0].earlier === 1);
  t("Aug 3 reports 4 earlier saves", out[1].earlier === 4);
  /* The row copy reads "saved N times, showing the last" — N is earlier + 1. */
  t("which renders as 'saved 5 times' for Aug 3", out[1].earlier + 1 === 5);
  t("the weeks keep their newest-first order",
    out[0].row.payload.week === "2026-08-10" && out[1].row.payload.week === "2026-08-03");
}

group("2. ⚠️ NOTHING IS EVER HIDDEN — the dangerous direction");
{
  /* Legacy records: saveSubmission was called with two args, so payload is
     undefined and there is no week to group on. Five of them are five real
     sweeps and must stay five rows. */
  const legacy = [sub("L1", null), sub("L2", null), sub("L3", null), sub("L4", null), sub("L5", null)];
  const out = latestPerWeek(legacy);
  t("★ 5 week-less records stay 5 rows, never collapse", out.length === 5);
  t("and none of them claims an earlier save", out.every((x) => x.earlier === 0));
  t("their keys are all distinct", new Set(out.map((x) => x.key)).size === 5);

  /* Mixed: legacy rows must not be swallowed by dated ones either. */
  const mixed = [sub("a", "2026-08-10"), sub("b", null), sub("c", "2026-08-10"), sub("d", null)];
  const m = latestPerWeek(mixed);
  t("a dated week + 2 undated records = 3 rows", m.length === 3);
  t("only the dated week counts an earlier save",
    m.filter((x) => x.earlier > 0).length === 1 && m[0].earlier === 1);
}

group("3. the ordinary cases");
{
  t("empty in, empty out", latestPerWeek([]).length === 0);
  for (const junk of [null, undefined, "nope", 42, {}]) {
    t(`${JSON.stringify(junk) || String(junk)} → [] rather than a throw`, latestPerWeek(junk).length === 0);
  }
  const distinct = [sub("x", "2026-08-10"), sub("y", "2026-08-03"), sub("z", "2026-07-27")];
  const out = latestPerWeek(distinct);
  t("three different weeks stay three rows", out.length === 3);
  t("none of them reports an earlier save", out.every((x) => x.earlier === 0));
  t("a single submission is a single row", latestPerWeek([sub("only", "2026-08-10")]).length === 1);
}

group("4. the keys React renders with");
{
  /* ⚠️ A KEY THAT CHANGES BETWEEN RENDERS CHURNS THE WHOLE LIST. The first
     cut of this used Math.random() as the last-resort key, which does exactly
     that — it runs during render. Same input must give the same keys. */
  const rows = [sub("a", "2026-08-10"), sub("b", null), { payload: undefined }];
  const one = latestPerWeek(rows).map((x) => x.key);
  const two = latestPerWeek(rows).map((x) => x.key);
  t("★ the same input gives the same keys twice", JSON.stringify(one) === JSON.stringify(two));
  t("a record with no id at all still gets a key", one.every((k) => typeof k === "string" && k.length > 0));
  t("every key is distinct", new Set(one).size === one.length);
}

group("5. the row handed back is the REAL record, not a copy");
{
  /* The component reads r.payload for the score, the flag count and the
     duration. A rebuilt object would drop whatever this file did not think to
     copy — so the original row must come through untouched. */
  const original = sub("s1", "2026-08-10", { by: "Guadalupe", overallPct: 96.9, counts: { flagged: 2 }, durationMin: 28 });
  const out = latestPerWeek([original]);
  t("★ it is the same object reference", out[0].row === original);
  t("the score survives", out[0].row.payload.overallPct === 96.9);
  t("the flag count survives", out[0].row.payload.counts.flagged === 2);
  t("the duration survives", out[0].row.payload.durationMin === 28);
}

console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
