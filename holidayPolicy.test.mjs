/* ============================================================================
   holidayPolicy.test.mjs — the holidays configure themselves, and stay editable

       node holidayPolicy.test.mjs

   Matt, Aug 21 2026: "most open at 10:30 but days like christmase eve and new
   years eve we open at 6. build this into the lineup systam so it doesnt need
   entered anymore but leave the option to edit."

   Both halves of that sentence are load-bearing and they pull against each
   other, so the precedence is the thing under test:

     typed by the operator  >  that holiday's own setting  >  store default  >  nothing

   ⚠️⚠️ AND "NOTHING" IS A NORMAL TRADING DAY, NOT A SHUT ONE. A store that has
   said nothing about Thanksgiving keeps its ordinary hours. Guessing closed
   would delete a trading day from the roster, and a store that has just
   installed the Hub has said nothing about anything.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { holidaysForYear, holidaysFrom, holidayKeyFor, nthDow } from "./usHolidays.js";
import { readHolidayPolicy, holidayDefault, hoursForHoliday, holidayPlan } from "./holidayPolicy.js";

let pass = 0; const fails = [];
const t = (label, cond, extra) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log(`  FAIL  ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
};
const g = (n) => console.log(`\n── ${n}`);

const AM6 = 360, AM1030 = 630, PM4 = 960;

/* Gate City's answer, as he described it. Lives in store config, never in code. */
const GATE_CITY = {
  open: AM1030, close: PM4, baseSales: 14000,
  byKey: {
    thanksgiving:  { closed: true },
    christmasDay:  { closed: true },
    christmasEve:  { open: AM6 },
    newYearsEve:   { open: AM6 },
  },
};

g("0. ★★ the calendar matches his real ControlPoint page");
{
  /* ⚠️ MEASURED AGAINST THE PAGE HE SENT, not against my own arithmetic. */
  const by = Object.fromEntries(holidaysForYear(2026).map((h) => [h.key, h.iso]));
  t("★★ Labor Day 2026 is 09/07", by.laborDay === "2026-09-07", by.laborDay);
  t("★★ Thanksgiving 2026 is 11/26", by.thanksgiving === "2026-11-26", by.thanksgiving);
  t("★★ Black Friday 2026 is 11/27", by.blackFriday === "2026-11-27", by.blackFriday);
  t("★ Christmas Eve is 12/24", by.christmasEve === "2026-12-24");
  t("★ New Year's Eve is 12/31", by.newYearsEve === "2026-12-31");
  t("★ Independence Day is 07/04", by.independenceDay === "2026-07-04");
  t("★★ and 2027 moves with the calendar, not by a year",
    holidaysForYear(2027).find((h) => h.key === "thanksgiving").iso === "2027-11-25");
  t("★ Black Friday is always the day after Thanksgiving (control)",
    [2026, 2027, 2028, 2030].every((y) => {
      const h = Object.fromEntries(holidaysForYear(y).map((x) => [x.key, x.iso]));
      return Date.parse(`${h.blackFriday}T12:00:00`) - Date.parse(`${h.thanksgiving}T12:00:00`) === 86400000;
    }));
  t("★ Thanksgiving is always a Thursday (control)",
    [2026, 2027, 2028, 2029, 2030].every((y) =>
      new Date(`${holidaysForYear(y).find((x) => x.key === "thanksgiving").iso}T12:00:00`).getDay() === 4));
  /* ⚠️ THE YEAR END, which is why this is not just holidaysForYear(now). */
  t("★★ looking forward from December crosses into next year",
    holidaysFrom("2026-12-26", 3).map((h) => h.iso).join(",") === "2026-12-31,2027-01-01,2027-07-04",
    holidaysFrom("2026-12-26", 3).map((h) => h.iso));
}

g("1. ★★ the store default answers the days nobody set");
{
  const d = holidayDefault(GATE_CITY, "2026-09-07");
  t("★★ Labor Day comes back 10:30 to 4 with nothing typed",
    d && d.open === AM1030 && d.close === PM4, d);
  t("★ and says the store default answered", d.source === "store", d && d.source);
  t("★ carrying the sales basis", d.baseSales === 14000, d && d.baseSales);
}

g("2. ★★ a holiday's own setting beats the default, field by field");
{
  const ce = holidayDefault(GATE_CITY, "2026-12-24");
  /* ⚠️ THE FIX THAT MATTERS. Christmas Eve sets ONLY `open`. If the override
     replaced the whole row it would lose the 4pm close and the day would have
     no window at all. */
  t("★★★ Christmas Eve opens at 6", ce && ce.open === AM6, ce);
  t("★★★ and still closes at 4, which it never set itself", ce && ce.close === PM4, ce);
  t("★ New Year's Eve too", holidayDefault(GATE_CITY, "2026-12-31").open === AM6);
  t("★ while Labor Day is untouched by either", holidayDefault(GATE_CITY, "2026-09-07").open === AM1030);
}

g("3. ★★ the closed days");
{
  const tg = holidayDefault(GATE_CITY, "2026-11-26");
  const xm = holidayDefault(GATE_CITY, "2026-12-25");
  t("★★★ Thanksgiving is closed", tg && tg.closed === true, tg);
  t("★★★ Christmas Day is closed", xm && xm.closed === true, xm);
  t("★★ and a closed day carries no hours at all",
    tg.open === null && tg.close === null && xm.open === null && xm.close === null);
}

g("4. ★★★ what the operator typed always wins");
{
  /* ControlPoint had Black Friday trading to 9pm against the store's own
     "holidays close at 4" rule. This is where that gets settled, and the
     settlement must not be overruled by the default. */
  const typed = { closed: false, open: AM6, close: 1260 };
  const r = hoursForHoliday(GATE_CITY, typed, "2026-11-27");
  t("★★★ a typed Black Friday keeps 6 to 9, not the 10:30-4 default",
    r.open === AM6 && r.close === 1260, r);
  t("★ and says it was typed", r.source === "typed", r.source);

  /* ⚠️ EVEN AGAINST A CLOSED HOLIDAY. Somebody opening on Christmas Day has
     done something deliberate and unusual, which is exactly when second-
     guessing them is worst. */
  const openOnXmas = hoursForHoliday(GATE_CITY, { closed: false, open: AM6, close: PM4 }, "2026-12-25");
  t("★★★ typing hours on a closed holiday opens it", openOnXmas.closed === false && openOnXmas.open === AM6, openOnXmas);
  /* And the reverse. */
  const shutLabor = hoursForHoliday(GATE_CITY, { closed: true }, "2026-09-07");
  t("★★ typing Closed on an open holiday shuts it", shutLabor.closed === true, shutLabor);
  t("★ typed hours still inherit the sales basis, since typing hours says nothing about sales",
    openOnXmas.baseSales === 14000, openOnXmas.baseSales);
}

g("5. ★★ a store that has said nothing keeps its normal day");
{
  /* ⚠️⚠️ THE ONE THAT WOULD BE EXPENSIVE TO GET WRONG. Every value empty is
     what a clone arrives with, and every store starts there. */
  const EMPTY = { open: null, close: null, baseSales: null, byKey: {} };
  t("★★★ Thanksgiving is NOT closed for a store that never said so",
    holidayDefault(EMPTY, "2026-11-26") === null, holidayDefault(EMPTY, "2026-11-26"));
  t("★★ and no holiday returns hours", holidaysForYear(2026).every((h) => holidayDefault(EMPTY, h.iso) === null));
  t("★ an absent config reads as empty rather than throwing",
    holidayDefault(null, "2026-11-26") === null && holidayDefault(undefined, "2026-12-25") === null);
  /* Half a window is not a window. */
  t("★★ an open with no close says nothing rather than something unusable",
    holidayDefault({ open: AM1030, close: null, byKey: {} }, "2026-09-07") === null);
  t("★ and a close before the open is refused too",
    holidayDefault({ open: PM4, close: AM6, byKey: {} }, "2026-09-07") === null);
}

g("6. ★ an ordinary day is not a holiday");
{
  t("★ a random Tuesday has no key", holidayKeyFor("2026-08-25") === "");
  t("★★ and no policy applies to it", holidayDefault(GATE_CITY, "2026-08-25") === null);
  t("★ rubbish in is null out", holidayKeyFor("nonsense") === "" && holidayDefault(GATE_CITY, "") === null);
}

g("7. ★ the year at a glance");
{
  const plan = holidayPlan(GATE_CITY, { "2026-11-27": { closed: false, open: AM6, close: 1260 } },
    "2026-09-01", holidaysFrom, 8);
  t("★ it lists the holidays ahead (control)", plan.length === 8, plan.length);
  const by = Object.fromEntries(plan.map((p) => [p.iso, p]));
  t("★★ the typed Black Friday shows as typed", by["2026-11-27"].source === "typed" && by["2026-11-27"].close === 1260);
  t("★ Christmas Eve shows the holiday rule", by["2026-12-24"].source === "holiday" && by["2026-12-24"].open === AM6);
  t("★ Labor Day shows the store rule", by["2026-09-07"].source === "store");
  t("★ Thanksgiving shows closed", by["2026-11-26"].closed === true);
}

g("8. ⛔ the line these files must not cross");
{
  /* storeHours.js states it and this is where it gets enforced: the calendar
     may know dates, and it may NOT know one store's opinion about them. */
  const cal = readFileSync(new URL("./usHolidays.js", import.meta.url), "utf8");
  const code = cal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("★★★ the calendar carries no hour", !/\b(10:30|630|960|1260|closed\s*:)/.test(code), code.match(/\b(630|960|1260)\b/));
  t("★★ and no dollar figure", !/\b14000\b/.test(code));

  const pol = readFileSync(new URL("./holidayPolicy.js", import.meta.url), "utf8");
  const polCode = pol.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("★★★ the resolver knows no time either", !/\b(630|960|360|14000)\b/.test(polCode), polCode.match(/\b(630|960|360|14000)\b/));

  /* 🐛 THIS USED TO READ **GATE CITY'S OWN** `storeConfig.js` AND DEMAND THE
     `holidays` BLOCK BE EMPTY, and it went red on Aug 21 2026 the moment Matt
     said "just input the holiday hrs pls" and they were filled in.

     ⚠️⚠️ THE ASSERTION HAD THE RIGHT GOAL AND THE WRONG FILE. The requirement
     is that **a clone inherits no opinion**, and the clone template is
     `spare-hub`, not this store. Gate City is a live restaurant. Filling in its
     hours is what the whole feature is for, and a test that forbids it forbids
     the feature working anywhere.

     ⇒ Measured where it actually matters: **the two lines above still hold** —
     the calendar and the resolver carry no store's opinion, and those are the
     files that travel byte-identical. The template check moved to
     `holidayHoursSet.test.mjs` section 3, which reads the real clones and
     proves none of them carries Gate City's hours or Gate City's volume. */
  const cfg = readFileSync(new URL("./storeConfig.js", import.meta.url), "utf8");
  const i0 = cfg.indexOf("  holidays: {");
  t("control: this store's holidays block was really found", i0 > 0);
  /* ★★ WHAT STILL HAS TO BE TRUE HERE: the numbers live in the store's own
     config and nowhere upstream of it. A figure that leaked into the calendar
     or the resolver is caught by the two assertions above; this one proves the
     store config is genuinely where it is set, so those two are not passing
     because the value simply does not exist anywhere. */
  const block = cfg.slice(i0, cfg.indexOf("\n  },", i0));
  t("control: the block was sliced, not the whole file", block.length > 40 && block.length < 4000);
  /* ⛔⛔ THIS ASSERTION USED TO READ `open: 630` AND `baseSales: 14000`, WHICH IS
     THIS STORE'S OWN DATA WRITTEN INTO A TRAVELLING TEST FILE. Corrected Aug 21
     2026, when it was ported to three clones and failed all three — correctly,
     because none of them opens at 10:30 or takes $14,000 and none of them ever
     should according to this repo's own rule 18.

     ⇒ IT ASKS THE PORTABLE QUESTION NOW, and it is a stronger one. The block has
     to DECLARE all four fields, so the two assertions above cannot be passing
     merely because the value exists nowhere. And then each repo is graded on
     what is true for it:

       the origin  → the numbers are set, because this is a live store
       a clone     → the numbers are BLANK, because another restaurant's hours
                     arriving in a clone is the exact leak rule 18 exists to
                     stop, and it is the failure this file would otherwise wave
                     through

     ⚠️ NAMED OUT LOUD EITHER WAY. A clone that says nothing here would be a
     silent pass on an absence, which is this repo's most expensive shape. */
  for (const k of ["open", "close", "baseSales", "byKey"]) {
    t(`★ the config declares \`${k}\``, new RegExp(`\\b${k}\\s*:`).test(block));
  }
  const fsr = (cfg.match(/fsr:\s*"([^"]+)"/) || [])[1] || "";
  const isOrigin = fsr === "04010";
  console.log(`        this repo is ${isOrigin ? "THE ORIGIN" : "a clone"} (fsr ${fsr})`);
  const numbered = /\bopen:\s*\d/.test(block) && /\bbaseSales:\s*\d/.test(block);
  if (isOrigin) {
    t("★★ the origin's own hours are set in its own config", numbered);
  } else {
    t("★★ a clone carries NO hours of its own yet, and no other store's either",
      !numbered, numbered ? "a clone has inherited real numbers — rule 18" : undefined);
  }
}

console.log(`\n${fails.length ? `${fails.length} FAILED, ` : ""}${pass} passed`);
if (fails.length) process.exit(1);
