/* ============================================================================
   holidayLabor.test.mjs — a holiday is not budgeted like an ordinary weekday

       node holidayLabor.test.mjs

   Matt, Aug 21 2026: "it also needs to talk to the labor planner. use 14k as
   the base sales for a 10:30-4 day until you get a real holidays numbers to
   smart schedule and budget."

   🐛 WHAT IT FIXES. `forecastFor` fell back to `wk[dow]`, the two-month average
   for that day of the week. Christmas Eve is a Thursday, so the store was
   forecast a full Thursday's sales and budgeted a full Thursday's hours, on a
   day it shuts at four. The board looked entirely normal while being wrong by
   half a day — the same failure shape storeHours.js exists to prevent, arriving
   through the money instead of through the clock.

   ⚠️ AND CHRISTMAS DAY IS WORSE THAN WRONG, IT IS EXPENSIVE. A closed day
   falling through to the weekday average budgets a full crew for a building
   nobody opens.
   ============================================================================ */
import { forecastFor, holidayBasisFor } from "./laborEngine.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const g = (n) => console.log(`\n── ${n}`);

/* A normal Thursday takes 41,000. Sunday is 0, the store is shut. */
const WK = [0, 38000, 39000, 40000, 41000, 44000, 43000];
const POLICY = {
  open: 630, close: 960, baseSales: 14000,
  byKey: { thanksgiving: { closed: true }, christmasDay: { closed: true }, christmasEve: { open: 360 } },
};

g("0. controls");
t("an ordinary Thursday still forecasts off the weekday average",
  forecastFor("2026-08-27", {}, WK) === 41000, forecastFor("2026-08-27", {}, WK));
t("★ and a store with no policy is completely unchanged",
  forecastFor("2026-12-24", {}, WK) === 41000, forecastFor("2026-12-24", {}, WK));

g("1. ★★ the basis picks up the holidays in a month");
{
  const dec = await holidayBasisFor("2026-12", POLICY);
  t("★★ December has three", Object.keys(dec).sort().join(",") === "2026-12-24,2026-12-25,2026-12-31", Object.keys(dec));
  t("★★★ Christmas Eve is 14,000, not a Thursday's 41,000", dec["2026-12-24"] === 14000, dec["2026-12-24"]);
  t("★★★ Christmas Day is 0, because the store is shut", dec["2026-12-25"] === 0, dec["2026-12-25"]);
  t("★ New Year's Eve is 14,000", dec["2026-12-31"] === 14000, dec["2026-12-31"]);

  const nov = await holidayBasisFor("2026-11", POLICY);
  t("★★ Thanksgiving is 0", nov["2026-11-26"] === 0, nov["2026-11-26"]);
  /* ⚠️ BLACK FRIDAY IS A TRADING DAY AND MUST NOT BE CUT. It gets the store
     holiday figure only because this store has one; it is not closed. */
  t("★ Black Friday carries the holiday basis, not zero", nov["2026-11-27"] === 14000, nov["2026-11-27"]);
  t("★ and an ordinary month has none", Object.keys(await holidayBasisFor("2026-08", POLICY)).length === 0);
}

g("2. ★★★ the forecast uses it");
{
  const p = { holiday: await holidayBasisFor("2026-12", POLICY) };
  t("★★★ Christmas Eve forecasts 14,000, not 41,000", forecastFor("2026-12-24", p, WK) === 14000, forecastFor("2026-12-24", p, WK));
  t("★★★ Christmas Day forecasts 0, not a Friday's 44,000", forecastFor("2026-12-25", p, WK) === 0, forecastFor("2026-12-25", p, WK));
  t("★ an ordinary December Thursday is untouched", forecastFor("2026-12-17", p, WK) === 41000);
}

g("3. ★★ a real recorded figure beats the placeholder");
{
  /* "until you get a real holidays numbers" — the moment one exists, it wins. */
  const p = { holiday: await holidayBasisFor("2026-12", POLICY), days: { "2026-12-24": { forecast: 18500 } } };
  t("★★★ a typed Christmas Eve figure wins over the 14,000 default",
    forecastFor("2026-12-24", p, WK) === 18500, forecastFor("2026-12-24", p, WK));
  /* ⚠️ EVEN ON A CLOSED DAY. An operator who types a figure for Christmas Day
     has decided to open, and the budget must follow the decision. */
  const p2 = { holiday: await holidayBasisFor("2026-12", POLICY), days: { "2026-12-25": { forecast: 9000 } } };
  t("★★ and over a closed day's zero", forecastFor("2026-12-25", p2, WK) === 9000, forecastFor("2026-12-25", p2, WK));
}

g("4. ★ absent means unchanged, everywhere");
{
  t("★ no policy, no basis", Object.keys(await holidayBasisFor("2026-12", null)).length === 0);
  t("★ a store with hours but no sales figure gets no basis",
    Object.keys(await holidayBasisFor("2026-12", { open: 630, close: 960, byKey: {} })).length === 0);
  /* ⚠️ EXCEPT A CLOSED DAY, which is a figure of zero whether or not anybody
     set a sales number. A shut store takes nothing; that is not a guess. */
  const shut = await holidayBasisFor("2026-12", { byKey: { christmasDay: { closed: true } } });
  t("★★ but a closed day is still zero", shut["2026-12-25"] === 0, shut);
  t("★ a bad month string is empty, not a throw", Object.keys(await holidayBasisFor("nonsense", POLICY)).length === 0);
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
