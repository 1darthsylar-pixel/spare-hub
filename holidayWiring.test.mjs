/* ============================================================================
   holidayWiring.test.mjs — the holiday sales basis actually REACHES the planner.

       node holidayWiring.test.mjs

   ⛔⛔ THE BUG THIS EXISTS FOR, AND IT SHIPPED. Aug 21 2026, hours after the
   holiday hours themselves were typed in.

   `loadMonthBasis(ym, get, policy)` folds the holiday basis into `p.holiday`,
   and `forecastFor` reads it. Measured by RUNNING the real path: NOT ONE of the
   eight call sites passed a third argument. `policy` was always undefined,
   `holidayBasisFor` returned `{}` on its first line, `p.holiday` was empty every
   time, and the whole holiday arm of `forecastFor` was dead code in the shipped
   app.

   ⇒ Christmas Eve is a Thursday. The planner forecast a full Thursday's sales
   and budgeted a full Thursday's hours on a day that shuts at four, and
   Christmas Day — closed — budgeted a crew. Nothing errored, because an empty
   map is exactly what a store with no holiday policy has.

   ★★ AND THE EXISTING TESTS COULD NOT HAVE CAUGHT IT. They handed
   `holidayBasisFor` a policy directly, which is the one thing the app never
   does. A leaf proven correct and reaching nobody is this codebase's most
   expensive recurring shape — `HUB_SCHEDULE_PULL_READY` and the announcement
   filter are the same story.

   ⇒ SO THIS FILE DRIVES THE PATH, IT DOES NOT GREP FOR IT. It runs
   `loadMonthBasis` the way the app runs it and asserts the figure arrives.

   ⚠️ FAKE FIGURES ONLY. Nothing here is this store's real sales.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { loadMonthBasis, forecastFor, holidayBasisFor } from "./laborEngine.js";
import { readHolidayPolicy } from "./holidayPolicy.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "\n        " + extra}`); }
};
const group = (n) => console.log(`\n── ${n}`);

/* Two months of ordinary $30,000 Thursdays and nothing typed for December, so
   any December weekday forecasts off the weekday average. */
const days = {};
/* ⚠️ THE REAL CHANNEL IDS. `dayTotal` sums SA_CHANNELS — dt/co/di/od/ca — so a
   made-up key like { net } totals ZERO and every assertion downstream reads as
   a bug in the code. It cost two runs. Suspect the fixture first. */
for (let d = 1; d <= 28; d++) days[`2026-10-${String(d).padStart(2, "0")}`] = { dt: 18000, co: 6000, di: 4000, od: 2000 };
const get = async (k) => (String(k).includes("2026-10") || String(k).includes("2026-11") ? { days } : null);

const POLICY = readHolidayPolicy({
  open: 630, close: 960, baseSales: 9000,
  byKey: { christmasDay: { closed: true } },
});
const EVE = "2026-12-24";      // a Thursday
const DAY = "2026-12-25";      // closed

group("0. controls — the fixture really exercises the path");
{
  const base = await loadMonthBasis("2026-12", get, POLICY);
  t("the weekday average was actually loaded", base.wk[4] === 30000, `Thursday avg = ${base.wk[4]}`);
  t("control: an ORDINARY December Thursday forecasts off it",
    forecastFor("2026-12-17", base.p, base.wk) === 30000);
  t("control: the policy on its own does produce figures",
    Object.keys(await holidayBasisFor("2026-12", POLICY)).length === 3);
}

group("1. ★★ the policy REACHES the basis, which is the whole bug");
{
  const base = await loadMonthBasis("2026-12", get, POLICY);
  t("★★ p.holiday is not empty when a policy is handed in",
    base.p.holiday && Object.keys(base.p.holiday).length > 0,
    `p.holiday = ${JSON.stringify(base.p && base.p.holiday)}`);
  t("★★ Christmas Eve forecasts the SHORT-DAY figure, not a full Thursday",
    forecastFor(EVE, base.p, base.wk) === 9000,
    `got ${forecastFor(EVE, base.p, base.wk)}, a full Thursday is 30000`);
  t("★★ a CLOSED day forecasts zero, never the weekday average",
    forecastFor(DAY, base.p, base.wk) === 0,
    `got ${forecastFor(DAY, base.p, base.wk)}`);
}

group("2. ★★ absent means unchanged — a store with no holiday hours is untouched");
{
  const base = await loadMonthBasis("2026-12", get);
  t("no policy gives an empty map rather than throwing",
    base.p.holiday && Object.keys(base.p.holiday).length === 0);
  t("★ and every day forecasts exactly as it did before any of this",
    forecastFor(EVE, base.p, base.wk) === 30000);
}

group("3. ★★ a typed figure for the day still beats the holiday default");
{
  const typed = async (k) => (String(k).includes("plan") ? { days: { [EVE]: { forecast: 12345 } } } : (await get(k)));
  const base = await loadMonthBasis("2026-12", typed, POLICY);
  const f = forecastFor(EVE, base.p, base.wk);
  t("★ the operator's own number wins over the holiday basis", f === 12345, `got ${f}`);
}

group("3b. ★★ what the holiday REALLY took beats the typed default");
{
  /* Matt, Aug 21 2026: "you actually have the holiday sales in my labor planner
     history." Measured against this store's own 20 months, the single typed
     figure was wrong for every holiday and wrong in BOTH directions — Christmas
     Eve out by -38%, New Year's Day by +59%. Fake figures below. */
  const lastYear = { days: { "2025-12-24": { dt: 15000, ca: 3000, co: 3000, di: 1000, od: 560 } } };
  const withHist = async (k) => (String(k).includes("2025-12") ? lastYear : (await get(k)));

  const basis = await holidayBasisFor("2026-12", POLICY, withHist);
  t("★★ Christmas Eve takes what it really took, not the typed 9,000",
    basis[EVE] === 22560, `got ${basis[EVE]}`);
  t("★★ a CLOSED day is still zero — a fact about the store beats any history",
    basis[DAY] === 0, `got ${basis[DAY]}`);
  t("★ a holiday with NO history falls back to the typed default",
    basis["2026-12-31"] === 9000, `got ${basis["2026-12-31"]}`);

  const base = await loadMonthBasis("2026-12", withHist, POLICY);
  t("★★ and it reaches the forecast, which is the whole point",
    forecastFor(EVE, base.p, base.wk) === 22560,
    `got ${forecastFor(EVE, base.p, base.wk)}`);

  /* ⚠️ A ZERO IN THE HISTORY IS NOT A BASIS. A holiday the store was closed for
     last year records 0; if it opens this year that 0 would budget nobody. */
  const wasShut = { days: { "2025-12-24": { dt: 0, ca: 0, co: 0, di: 0, od: 0 } } };
  const shutHist = async (k) => (String(k).includes("2025-12") ? wasShut : (await get(k)));
  const b2 = await holidayBasisFor("2026-12", POLICY, shutHist);
  t("★★ a zero last year falls to the typed default, never to nothing",
    b2[EVE] === 9000, `got ${b2[EVE]}`);

  /* ⚠️ A FAILED READ IS NOT A ZERO EITHER. */
  const broken = async (k) => (String(k).includes("2025-12") ? null : (await get(k)));
  const b3 = await holidayBasisFor("2026-12", POLICY, broken);
  t("★ an unreadable prior year falls to the typed default", b3[EVE] === 9000, `got ${b3[EVE]}`);

  /* ⚠️ NO READER AT ALL still works — the old two-argument contract. */
  const b4 = await holidayBasisFor("2026-12", POLICY);
  t("★ no reader given behaves exactly as it did before", b4[EVE] === 9000);
}

group("4. ★★ every call site passes the policy — the assertion that would have caught it");
{
  /* ⚠️ THIS SECTION READS SOURCE ON PURPOSE, and it is the only one that does.
     Sections 1-3 prove the mechanism works when it is fed. This proves it is
     FED, which is the half that was broken and which no behavioural test of the
     engine can see from inside. */
  const eng = readFileSync(new URL("./laborEngine.js", import.meta.url), "utf8");
  const bare = [...eng.matchAll(/loadMonthBasis\(([^)]*)\)/g)]
    .map((m) => m[1].trim())
    .filter((a) => a && !a.startsWith("ym, get, policy"));
  t("★★ no loadMonthBasis call inside the engine drops the policy",
    bare.length === 0, bare.length ? `bare calls: ${bare.join(" | ")}` : undefined);

  const calls = [...eng.matchAll(/loadMonthBasis\(/g)].length;
  t("★ and the scan really found the calls (control) — 7 expected", calls === 7, `found ${calls}`);

  /* The two callers outside the engine. A miss in either is silent. */
  for (const [file, needle] of [
    ["ScheduleBuilder.jsx", "loadMonthBasis(ym, kvGet, holPolicy)"],
    ["worker.js", 'weekCutPlan(ym, startIso, 6, get, storeCfg("holidays", null))'],
  ]) {
    let src = "";
    try { src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8"); } catch { /* absent in some clones */ }
    if (!src) { console.log(`        NOT GRADED — ${file} is not in this repo`); continue; }
    t(`★★ ${file} hands the policy in`, src.includes(needle));
  }

  /* ⚠️ THE BROWSER BINDS IN ONE PLACE AND THAT IS WHY IT IS GRADED SEPARATELY.
     Every screen calls the LaborPlanner wrappers, never the engine. */
  let lp = "";
  try { lp = readFileSync(new URL("./LaborPlanner.jsx", import.meta.url), "utf8"); } catch { /* ignore */ }
  if (!lp) console.log("        NOT GRADED — LaborPlanner.jsx is not in this repo");
  else {
    const wrappers = ["monthLaborCard", "monthLaborPlan", "monthForecastTotal", "monthProductivityGoal", "monthProjectedFinish"];
    const missing = wrappers.filter((w) => !new RegExp(`export const ${w} = [^;]*holPolicy\\(\\)`).test(lp));
    t("★★ every LaborPlanner wrapper that forecasts binds the policy",
      missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : undefined);
    t("★ read at CALL time, never frozen at module scope",
      /const holPolicy = \(\) => storeCfg\("holidays"/.test(lp));
  }
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
process.exit(fails.length ? 1 : 0);
